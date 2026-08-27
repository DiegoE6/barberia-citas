"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifySession } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { MAX_BLOQUES, type Bloque } from "@/app/lib/horarios";

/**
 * Guardar el horario de un día de la semana.
 *
 * ── Se guarda un día completo, no un bloque ─────────────────────────────
 * La tabla tiene una fila por bloque, pero el formulario manda el día entero:
 * hasta tres tramos y si el día está abierto o cerrado. Así el dueño no tiene
 * que saber que "el sábado son dos filas".
 *
 * La escritura es borrar las filas del día e insertar las nuevas. Para una
 * tabla de configuración de ocho filas es lo más simple, y esquiva los
 * conflictos con el `unique (dia_semana, hora_inicio)` que tendría un update
 * fila por fila. El costo es que los `id` y `created_at` de ese día cambian en
 * cada guardado; nada depende de ellos.
 *
 * Las dos operaciones ocurren dentro de la función `guardar_dia` de Postgres
 * para que sean atómicas: un fallo a medio camino no puede dejar el día sin
 * horario. Ver docs/sql/10-guardar-dia.sql.
 *
 * ── El solapamiento se valida aquí ──────────────────────────────────────
 * docs/DECISIONES.md lo dejó decidido: prohibirlo en la base de datos pediría
 * un EXCLUDE con la extensión `btree_gist`, y con uno o dos bloques por día y
 * un solo dueño editando, el formulario alcanza. Éste es ese formulario.
 *
 * ⚠️ Y como todo Server Action, es un endpoint público con sintaxis de
 * función: nada de lo que llega en el FormData es confiable, aunque el
 * <input type="time"> del navegador ya lo hubiera filtrado.
 */

/** "HH:MM", con los segundos opcionales que algún navegador podría mandar. */
const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function volverConError(error: string, dia: number): never {
  redirect(`/admin/horarios?error=${error}&dia=${dia}`);
}

/**
 * Lee los tres pares de horas del formulario y devuelve solo los que están
 * completos. Un par vacío significa "ese tramo no aplica"; un par a medias es
 * un error, porque casi siempre es un descuido.
 */
function leerBloques(formData: FormData, dia: number): Bloque[] {
  const bloques: Bloque[] = [];

  for (let i = 1; i <= MAX_BLOQUES; i++) {
    const inicio = String(formData.get(`inicio${i}`) ?? "").trim();
    const fin = String(formData.get(`fin${i}`) ?? "").trim();

    // Tramo sin usar: se ignora en silencio. Es el caso normal del 2 y el 3.
    if (!inicio && !fin) continue;

    if (!inicio || !fin) {
      volverConError("incompleto", dia);
    }

    if (!FORMATO_HORA.test(inicio) || !FORMATO_HORA.test(fin)) {
      volverConError("formato", dia);
    }

    // Con "HH:MM" de ancho fijo, comparar como texto equivale a comparar como
    // hora: "09:00" < "14:00". Es además la misma regla que el CHECK
    // horarios_semana_rango_valido, que rechazaría la fila de todos modos.
    const desde = inicio.slice(0, 5);
    const hasta = fin.slice(0, 5);

    if (hasta <= desde) {
      volverConError("rango", dia);
    }

    bloques.push({ inicio: desde, fin: hasta });
  }

  // Ordenar antes de comparar es lo que permite detectar el encimado con una
  // sola pasada, sin importar en qué tramo escribió cada horario el dueño.
  bloques.sort((a, b) => a.inicio.localeCompare(b.inicio));

  for (let i = 1; i < bloques.length; i++) {
    // `<` y no `<=`: dos tramos pegados (uno cierra 14:00, el otro abre 14:00)
    // no se encima, es un horario corrido escrito en dos renglones.
    if (bloques[i].inicio < bloques[i - 1].fin) {
      volverConError("solapan", dia);
    }
  }

  return bloques;
}

export async function guardarDia(formData: FormData) {
  // Primera línea, siempre. La verificación de la página no protege esto: un
  // Server Action es un endpoint POST propio, alcanzable sin pasar por /admin.
  await verifySession();

  const dia = Number(formData.get("dia"));

  // Number("") es 0, que es domingo y un día válido: hay que comprobar el tipo
  // aparte y no confiar en que un 0 sea falsy.
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    redirect("/admin/horarios?error=dia");
  }

  const abierto = String(formData.get("abierto")) === "si";
  const bloques = leerBloques(formData, dia);

  // Un día abierto sin ninguna hora no significa nada: no habría de cuándo a
  // cuándo atender. Cerrado sin horas sí es válido — es un día que nunca tuvo
  // horario cargado.
  if (abierto && bloques.length === 0) {
    volverConError("vacio", dia);
  }

  // El borrado y la inserción van dentro de una función de Postgres
  // (docs/sql/10-guardar-dia.sql) y NO como dos llamadas desde aquí. El
  // cuerpo de una función es una sola transacción: si la inserción falla, el
  // borrado se revierte con ella y el día se queda como estaba.
  //
  // Hechas por separado había un viaje de red entre las dos, y una inserción
  // fallida dejaba el día sin filas — cerrado, sin que el dueño lo pidiera.
  //
  // Todas las filas del día comparten `activo`: el editor tiene un solo
  // interruptor por día. Eso además normaliza un día que hubiera quedado con
  // filas mezcladas por una edición a mano en Supabase.
  const { error } = await supabaseAdmin.rpc("guardar_dia", {
    p_dia: dia,
    p_abierto: abierto,
    p_bloques: bloques,
  });

  if (error) {
    // PGRST202 = PostgREST no encuentra la función. En la práctica significa
    // que falta correr docs/sql/10-guardar-dia.sql en Supabase, típicamente
    // por haber desplegado el código antes que el SQL. Vale la pena
    // distinguirlo: el mensaje genérico mandaría a buscar el problema muy
    // lejos de donde está.
    volverConError(error.code === "PGRST202" ? "faltasql" : "desconocido", dia);
  }

  // La landing es estática y muestra los horarios: sin este aviso seguiría
  // sirviendo el HTML viejo. /agendar y /admin son dinámicas y no lo
  // necesitan. Ver docs/DECISIONES.md.
  revalidatePath("/");

  redirect(`/admin/horarios?ok=${dia}`);
}

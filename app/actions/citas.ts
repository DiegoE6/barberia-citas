"use server";

import { redirect } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { getDisponibilidad } from "@/app/lib/disponibilidad";
import { limitePorTelefono, registrarIntentoPorIp } from "@/app/lib/limites";

/**
 * Server Action que agenda una cita.
 *
 * "use server" hace que esta función corra SOLO en el servidor: Next.js crea
 * el endpoint HTTP y conecta el formulario. El cuerpo nunca se descarga al
 * navegador, así que la service_role key no se expone.
 *
 * ⚠️ Pero según los propios docs de Next, un Server Action "es alcanzable por
 * cualquiera que pueda mandar el mismo POST: trátalo como un punto de entrada
 * no confiable". Por eso aquí NO se confía en nada de lo que llega:
 *
 *   - `fin` y `precio_cobrado` no se reciben: se derivan del servicio.
 *   - El horario elegido se vuelve a validar contra la disponibilidad real,
 *     porque la lista que vio el cliente pudo quedar vieja o ser inventada.
 *
 * ── El freno anti-spam ──────────────────────────────────────────────────
 * Este endpoint es público y no pide autenticación, así que sin freno un
 * script puede llenar la agenda entera con citas falsas. Hay tres capas, de
 * fuera hacia adentro: campo trampa, límite por IP y límite por teléfono.
 * Cada una está comentada en su lugar; el razonamiento completo —incluido
 * por qué no hay captcha— está en docs/DECISIONES.md → "Freno anti-spam:
 * tres capas y fallo abierto".
 */

const MINUTE_MS = 60 * 1000;

export async function agendarCita(formData: FormData) {
  const servicioId = Number(formData.get("servicio"));
  const fecha = String(formData.get("fecha") ?? "");
  const hora = String(formData.get("hora") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();

  // Campo trampa: existe en el HTML pero está fuera de la pantalla y ningún
  // cliente real lo ve. Ver el comentario del formulario en
  // app/(public)/agendar/confirmar/page.tsx.
  const trampa = String(formData.get("referencia") ?? "").trim();

  // Los valores vienen del FormData, o sea de fuera: se escapan antes de
  // meterlos en una URL, aunque después se validen.
  const q = (valor: string | number) => encodeURIComponent(String(valor));

  const volverAConfirmar = (error: string) =>
    `/agendar/confirmar?servicio=${q(servicioId)}&fecha=${q(fecha)}&hora=${q(hora)}&error=${error}`;

  const volverASlots = (error: string) =>
    `/agendar?servicio=${q(servicioId)}&fecha=${q(fecha)}&error=${error}`;

  // ── Capa 1: campo trampa ──────────────────────────────────────────────
  // Cuesta cero y atrapa al bot que rellena a ciegas cualquier formulario
  // que encuentra.
  //
  // Es la capa MÁS DÉBIL de las tres, y conviene no confundirse sobre lo que
  // hace: un script que hace POST directo aquí nunca renderiza el HTML, así
  // que no ve este campo, no lo manda, y pasa la prueba. Quien detiene ese
  // caso es la capa 2. Ésta se queda por lo que cuesta, no por lo que
  // protege.
  //
  // Se reusa el error "datos" a propósito: no hace falta un mensaje propio,
  // y el que hay igual deja salida a un humano que lo dispare por accidente.
  if (trampa) {
    redirect(volverAConfirmar("datos"));
  }

  // ── Capa 0: validación de forma ───────────────────────────────────────
  // El `required` del HTML ya filtra al usuario normal; esto es para quien
  // no pase por el formulario.
  if (!servicioId || !fecha || !hora || !nombre || !telefono) {
    redirect(volverAConfirmar("datos"));
  }

  // ── Capa 2: límite por IP ─────────────────────────────────────────────
  // Va ANTES de buscar el servicio y de recalcular la disponibilidad, que
  // son tres viajes a la base de datos: es una sola consulta y protege todo
  // el trabajo caro que viene después.
  //
  // Ésta es la capa que de verdad detiene un script llenando la agenda, y
  // también la única con riesgo real de falso positivo, porque hay gente
  // que comparte IP. Por eso el umbral va holgado y el mensaje ofrece
  // WhatsApp. Si la consulta falla, deja pasar: ver app/lib/limites.ts.
  if ((await registrarIntentoPorIp()) === "limite") {
    redirect(volverAConfirmar("limite_ip"));
  }

  // 2. El servicio tiene que existir y estar activo. Se usa el cliente
  //    público: `servicios` es data pública, no hace falta la llave maestra.
  const { data: servicio } = await supabase
    .from("servicios")
    .select("id, nombre, precio, duracion_minutos")
    .eq("id", servicioId)
    .eq("activo", true)
    .maybeSingle();

  if (!servicio) {
    redirect(volverASlots("servicio"));
  }

  // 3. Volver a calcular la disponibilidad real y comprobar que el horario
  //    elegido siga en la lista. Esto cubre de un golpe: día cerrado, horario
  //    fuera de bloque, slot en el pasado, y slot ya ocupado.
  const disponibilidad = await getDisponibilidad(
    fecha,
    servicio.duracion_minutos
  );

  if (disponibilidad.estado === "error") {
    redirect(volverASlots("desconocido"));
  }

  const slot = disponibilidad.slots.find((s) => s.hora === hora);

  if (!slot) {
    redirect(volverASlots("ocupado"));
  }

  // ── Capa 3: límite por teléfono ───────────────────────────────────────
  // Va al final, pegado al insert, porque es la más cara de las tres en
  // términos de falso positivo: el mensaje que produce le habla al cliente
  // de SUS citas, así que conviene que a estas alturas ya sepamos que todo
  // lo demás estaba bien.
  //
  // Es débil contra quien inventa teléfonos —eso solo lo arregla la
  // verificación por SMS—, pero es la única capa que ataca el caso más
  // frecuente de todos: el cliente real que envía dos veces.
  if ((await limitePorTelefono(telefono)) === "limite") {
    redirect(volverAConfirmar("limite_telefono"));
  }

  // 4. `fin` y `precio_cobrado` los calcula el servidor, nunca el cliente.
  //    El instante de inicio sale del propio slot, que ya viene convertido
  //    desde Postgres: no se vuelve a interpretar ninguna hora en JavaScript.
  const inicio = slot.inicio;
  const fin = new Date(inicio.getTime() + servicio.duracion_minutos * MINUTE_MS);

  // `estado` se deja en el default de la tabla ('pendiente').
  // `telefono_norm` tampoco se manda: es una columna generada y la calcula
  // Postgres (docs/sql/11-telefono-normalizado.sql).
  const { error } = await supabaseAdmin.from("citas").insert({
    servicio_id: servicio.id,
    nombre_cliente: nombre,
    telefono,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    precio_cobrado: servicio.precio,
  });

  // 5. El paso 3 no basta: entre verificar e insertar pasan milisegundos, y en
  //    ese hueco otro cliente puede tomar el mismo horario. Quien lo impide de
  //    verdad es la restricción EXCLUDE de la base de datos, que devuelve el
  //    código 23P01 (exclusion_violation). Atraparlo es lo que convierte un
  //    error feo en un mensaje útil.
  if (error) {
    redirect(volverASlots(error.code === "23P01" ? "ocupado" : "desconocido"));
  }

  // redirect() lanza internamente, así que va fuera de cualquier try/catch y
  // al final. Además evita que recargar la página reenvíe el formulario.
  redirect(
    `/agendar/listo?servicio=${q(servicio.id)}&fecha=${q(fecha)}&hora=${q(hora)}`
  );
}

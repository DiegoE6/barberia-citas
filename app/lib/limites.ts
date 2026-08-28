import { headers } from "next/headers";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

/**
 * Freno anti-spam del formulario público de citas. Solo servidor.
 *
 * ── La regla que ordena todo este archivo: FALLAR ABIERTO ───────────────
 * Los dos errores posibles no cuestan lo mismo. Dejar pasar una cita falsa
 * le cuesta al dueño un clic en el panel para cancelarla. Bloquear a un
 * cliente real le cuesta la venta, y esa persona no vuelve a intentar.
 *
 * Por eso, cuando algo de NUESTRA infraestructura falla —la consulta se
 * cae, falta el header de la IP, no se corrió el SQL— la respuesta es
 * PERMITIR la cita y dejar rastro en los logs. Nunca al revés.
 *
 * Ver docs/DECISIONES.md → "Freno anti-spam: tres capas y fallo abierto".
 */

/**
 * Citas pendientes y futuras que puede tener un mismo teléfono.
 *
 * No es 1 ni 2 a propósito: en una barbería es normal que un papá agende
 * para él y para dos hijos con su propio número. Con 3 ese caso pasa; con 2
 * se pierde la venta.
 *
 * Cuenta horarios APARTADOS, no reservas históricas: el cliente que viene
 * cada semana nunca se topa con el límite, porque el dueño ya confirmó o
 * cerró las anteriores.
 */
export const MAX_CITAS_PENDIENTES = 3;

/**
 * Reservas por hora desde una misma IP.
 *
 * Va holgado a propósito. Mucha gente real comparte IP: el WiFi del local,
 * una oficina y sobre todo el CGNAT de las operadoras móviles, donde un
 * barrio entero puede salir por la misma dirección. Un hogar no llega a 5
 * reservas en una hora; un script que quiere llenar un sábado (unos 16
 * horarios) se frena en la sexta.
 */
export const MAX_RESERVAS_POR_IP = 5;
export const VENTANA_IP_MINUTOS = 60;

/** Dígitos mínimos para que valga la pena contar por teléfono. */
const MIN_DIGITOS_TELEFONO = 7;

/** "ok" = adelante. "limite" = se topó con el freno. */
export type ResultadoLimite = "ok" | "limite";

/**
 * Misma normalización que la columna generada `telefono_norm` de la tabla
 * (docs/sql/11-telefono-normalizado.sql): solo dígitos, últimos 10. Las dos
 * tienen que coincidir o la consulta no encuentra nada.
 */
export function normalizarTelefono(telefono: string) {
  return telefono.replace(/\D/g, "").slice(-10);
}

/**
 * La IP del cliente.
 *
 * `headers()` es la API de Next para leer los headers HTTP de la petición
 * actual desde código de servidor. En Next 16 devuelve una Promise, por eso
 * el await.
 *
 * En Vercel el header `x-forwarded-for` lo escribe el proxy de la
 * plataforma, que pisa lo que haya mandado el cliente; el primer valor de
 * la lista es la IP real. `x-real-ip` es el respaldo.
 *
 * Devuelve null si no hay ninguno de los dos —correr en local, por
 * ejemplo—, y quien llama lo trata como "no se puede limitar, deja pasar".
 */
async function getIp() {
  const h = await headers();

  const reenviadas = h.get("x-forwarded-for");
  const primera = reenviadas?.split(",")[0].trim();

  return primera || h.get("x-real-ip")?.trim() || null;
}

/**
 * Capa exterior: cuántas reservas se aceptan por IP y por hora.
 *
 * Es la que de verdad detiene el caso que duele —un script llenando la
 * agenda—, porque es la única que no depende de datos que el atacante
 * escribe él mismo.
 *
 * El conteo lo lleva Postgres, no la memoria del proceso: en Vercel el
 * servidor no guarda nada entre peticiones. El porqué largo está en
 * docs/sql/12-limite-citas.sql.
 */
export async function registrarIntentoPorIp(): Promise<ResultadoLimite> {
  const ip = await getIp();

  if (!ip) {
    // Sin IP no hay a quién contarle los intentos. Se deja pasar: perder una
    // cita real por un header ausente sería peor que la cita falsa.
    return "ok";
  }

  const { data, error } = await supabaseAdmin.rpc("registrar_intento", {
    p_clave: `ip:${ip}`,
    p_ventana_minutos: VENTANA_IP_MINUTOS,
    p_maximo: MAX_RESERVAS_POR_IP,
  });

  if (error) {
    // PGRST202 = PostgREST no encuentra la función, que en la práctica
    // significa que falta correr docs/sql/12-limite-citas.sql en Supabase
    // —típicamente por haber desplegado el código antes que el SQL—. Se
    // distingue porque el mensaje genérico manda a buscar muy lejos.
    console.error(
      error.code === "PGRST202"
        ? "[limites] falta correr docs/sql/12-limite-citas.sql en Supabase"
        : "[limites] registrar_intento falló:",
      error
    );
    return "ok";
  }

  // La función devuelve true si el intento cabe en la ventana.
  return data === false ? "limite" : "ok";
}

/**
 * Capa interior: cuántos horarios puede tener apartados un mismo teléfono.
 *
 * No lleva contador propio, consulta la tabla `citas` directamente. Ese
 * estado ya existe y no se puede desincronizar, y además se auto-repara: en
 * cuanto el dueño confirma o cancela, el cliente recupera su cupo.
 *
 * Se usa `supabaseAdmin` porque `citas` no tiene ninguna política de RLS.
 */
export async function limitePorTelefono(
  telefono: string
): Promise<ResultadoLimite> {
  const normalizado = normalizarTelefono(telefono);

  if (normalizado.length < MIN_DIGITOS_TELEFONO) {
    // Un número demasiado corto no identifica a nadie, y contar por él
    // metería en el mismo saco a clientes distintos. Se deja pasar: el
    // límite por IP sigue puesto, y éste nunca fue la defensa contra quien
    // inventa teléfonos.
    return "ok";
  }

  // `head: true` pide solo el conteo, sin traer las filas: no hace falta
  // mover nombres ni teléfonos por la red para contar.
  const { count, error } = await supabaseAdmin
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("telefono_norm", normalizado)
    .eq("estado", "pendiente")
    .gt("inicio", new Date().toISOString());

  if (error) {
    // 42703 = la columna no existe, o sea que falta correr
    // docs/sql/11-telefono-normalizado.sql.
    console.error(
      error.code === "42703"
        ? "[limites] falta correr docs/sql/11-telefono-normalizado.sql en Supabase"
        : "[limites] conteo por teléfono falló:",
      error
    );
    return "ok";
  }

  return (count ?? 0) >= MAX_CITAS_PENDIENTES ? "limite" : "ok";
}

import { supabase } from "@/app/lib/supabase";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

/**
 * Cálculo de horarios libres.
 *
 * La conversión de zona horaria NO ocurre aquí: la resuelve la función
 * `bloques_del_dia` en Postgres (ver docs/sql/08-bloques-del-dia.sql), que
 * devuelve los bloques ya como instantes. Todo lo que sigue en este archivo
 * es aritmética sobre milisegundos, donde las zonas horarias no existen.
 *
 * La única conversión que se hace en JavaScript es instante -> texto para
 * mostrar, que es la dirección fácil y la cubre `Intl` de forma nativa.
 */

export const TIME_ZONE = "America/Monterrey";

// Cada cuánto se ofrece un horario. Con 15 la agenda se compacta más, pero se
// le presentan al cliente el doble de opciones.
export const SLOT_STEP_MINUTES = 30;

// Anticipación mínima: que nadie agende para dentro de cinco minutos.
export const MIN_LEAD_MINUTES = 30;

const MINUTE_MS = 60 * 1000;

export type Slot = {
  /** "10:00" — lo que se muestra y lo que enviará el formulario en el Paso B. */
  hora: string;
  inicio: Date;
};

export type Disponibilidad = {
  /**
   * "cerrado" y "error" se distinguen a propósito. Si una consulta falla y lo
   * reportáramos como "cerrado", le estaríamos diciendo al cliente que la
   * barbería no abre ese día. Es el mismo cuidado que en Schedule.tsx.
   */
  estado: "ok" | "cerrado" | "error";
  slots: Slot[];
};

type BloqueRow = { inicio: string; fin: string };
type CitaRow = { inicio: string; fin: string };

/** Instante -> hora local del negocio. La dirección fácil de la conversión. */
export function formatHora(instante: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);
}

/**
 * La fecha de hoy (YYYY-MM-DD) según el reloj del negocio, no el del servidor
 * —que en Vercel corre en UTC—. El locale "en-CA" se usa porque es el que
 * formatea como YYYY-MM-DD, que es lo que espera un <input type="date">.
 */
export function fechaDeHoy() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getDisponibilidad(
  fecha: string,
  duracionMinutos: number
): Promise<Disponibilidad> {
  // 1. Bloques del día, ya convertidos a instantes por Postgres.
  //    Se usa el cliente público a propósito: los horarios son datos públicos
  //    —ya salen en la landing—, así que no hace falta la llave maestra.
  const { data: bloques, error: errorBloques } = await supabase.rpc(
    "bloques_del_dia",
    { fecha }
  );

  if (errorBloques) {
    return { estado: "error", slots: [] };
  }

  const filas = (bloques ?? []) as BloqueRow[];

  // Sin bloques activos = el negocio no abre ese día.
  if (filas.length === 0) {
    return { estado: "cerrado", slots: [] };
  }

  const bloquesInstantes = filas.map((b) => ({
    inicio: new Date(b.inicio).getTime(),
    fin: new Date(b.fin).getTime(),
  }));

  // 2. Citas que caen dentro de la jornada. El rango va del primer bloque al
  //    último: así no hace falta calcular los límites del día, que exigiría
  //    convertir de nuevo.
  //
  //    Aquí sí se usa el cliente admin: `citas` no tiene política de lectura,
  //    porque guarda nombre y teléfono de los clientes.
  const desde = new Date(bloquesInstantes[0].inicio);
  const hasta = new Date(bloquesInstantes[bloquesInstantes.length - 1].fin);

  const { data: citas, error: errorCitas } = await supabaseAdmin
    .from("citas")
    .select("inicio, fin")
    .neq("estado", "cancelada")
    .lt("inicio", hasta.toISOString())
    .gt("fin", desde.toISOString());

  if (errorCitas) {
    return { estado: "error", slots: [] };
  }

  const ocupados = ((citas ?? []) as CitaRow[]).map((c) => ({
    inicio: new Date(c.inicio).getTime(),
    fin: new Date(c.fin).getTime(),
  }));

  // 3. Recorrer cada bloque en pasos fijos.
  const duracionMs = duracionMinutos * MINUTE_MS;
  const pasoMs = SLOT_STEP_MINUTES * MINUTE_MS;
  const noAntesDe = Date.now() + MIN_LEAD_MINUTES * MINUTE_MS;

  const slots: Slot[] = [];

  for (const bloque of bloquesInstantes) {
    // La condición del for es la que garantiza que el servicio quepa completo
    // dentro del bloque: uno de 45 min no puede empezar a las 19:45 si el
    // bloque cierra a las 20:00.
    for (let t = bloque.inicio; t + duracionMs <= bloque.fin; t += pasoMs) {
      if (t < noAntesDe) continue;

      // Empalme con semántica [), la misma del constraint EXCLUDE de la base
      // de datos: 10:00-10:30 y 10:30-11:00 son adyacentes, no chocan.
      const chocaConCita = ocupados.some(
        (c) => t < c.fin && t + duracionMs > c.inicio
      );
      if (chocaConCita) continue;

      const inicio = new Date(t);
      slots.push({ hora: formatHora(inicio), inicio });
    }
  }

  return { estado: "ok", slots };
}

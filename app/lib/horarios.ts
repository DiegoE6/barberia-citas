import { supabase } from "@/app/lib/supabase";

/**
 * Lectura del patrón semanal de horarios, para la landing y para el panel.
 *
 * ── La tabla guarda bloques; la pantalla muestra días ───────────────────
 * `horarios_semana` tiene una fila por bloque continuo de atención: un día
 * normal es una fila y un sábado partido son dos (ver docs/DECISIONES.md).
 * Ese modelo le conviene al cálculo de slots, pero nadie piensa en "bloques":
 * el dueño piensa en "el sábado". Este archivo hace la traducción, y agrupa
 * las filas sueltas en siete días.
 */

/**
 * Los días en el orden en que se muestran: lunes primero, domingo al final.
 * El número es la convención de la base de datos (0 = domingo ... 6 = sábado).
 *
 * Esta constante define el orden y los nombres, así que la semana siempre
 * tiene sus siete renglones aunque a la tabla le falte alguna fila.
 */
export const DIAS = [
  { numero: 1, nombre: "Lunes" },
  { numero: 2, nombre: "Martes" },
  { numero: 3, nombre: "Miércoles" },
  { numero: 4, nombre: "Jueves" },
  { numero: 5, nombre: "Viernes" },
  { numero: 6, nombre: "Sábado" },
  { numero: 0, nombre: "Domingo" },
] as const;

/**
 * Cuántos tramos de atención se pueden configurar por día. Tres cubre de
 * sobra cualquier barbería real: uno corrido, o abrir–comer–volver, y queda
 * un tercero de reserva.
 */
export const MAX_BLOQUES = 3;

/** Un tramo de atención con horas en formato "HH:MM". */
export type Bloque = { inicio: string; fin: string };

export type DiaHorario = {
  numero: number;
  nombre: string;
  /** false = ese día no se atiende. Sus bloques se conservan igual. */
  abierto: boolean;
  bloques: Bloque[];
};

export type Semana = {
  /** "error" se distingue de la semana vacía: un fallo de red no es "cerrado". */
  estado: "ok" | "error";
  dias: DiaHorario[];
};

/** Postgres entrega un `time` como "10:00:00"; el <input type="time"> quiere "10:00". */
export function aHoraCorta(hora: string) {
  return hora.slice(0, 5);
}

export async function getSemana(): Promise<Semana> {
  // Los horarios son datos públicos —ya salen en la landing—, así que van con
  // el cliente público. NO se filtra por activo: los bloques de un día cerrado
  // se necesitan para poder mostrarlos y para poder reabrir el día sin volver
  // a escribir su horario.
  const { data: filas, error } = await supabase
    .from("horarios_semana")
    .select("dia_semana, hora_inicio, hora_fin, activo")
    .order("dia_semana")
    .order("hora_inicio");

  if (error || !filas) {
    return { estado: "error", dias: [] };
  }

  return {
    estado: "ok",
    dias: DIAS.map((dia) => {
      const delDia = filas.filter((f) => f.dia_semana === dia.numero);

      return {
        numero: dia.numero,
        nombre: dia.nombre,
        // "Abierto" es que haya al menos un bloque activo. Un día con filas
        // mezcladas —unas activas y otras no— no lo produce este editor, que
        // guarda todas con el mismo valor, pero sí podría producirlo una
        // edición a mano en Supabase. Se cuenta como abierto y el siguiente
        // guardado lo normaliza.
        abierto: delDia.some((f) => f.activo as boolean),
        bloques: delDia.map((f) => ({
          inicio: aHoraCorta(f.hora_inicio as string),
          fin: aHoraCorta(f.hora_fin as string),
        })),
      };
    }),
  };
}

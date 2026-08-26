import { supabase } from "@/app/lib/supabase";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { TIME_ZONE, fechaDeHoy } from "@/app/lib/disponibilidad";

/**
 * Arma la agenda de un día para el panel.
 *
 * Igual que en el cálculo de slots, la conversión de zona horaria la hacen
 * las funciones de Postgres (`limites_del_dia`, `bloques_del_dia`), que
 * devuelven instantes. Todo lo de aquí es aritmética sobre milisegundos.
 */

export type CitaAgenda = {
  id: number;
  inicio: Date;
  fin: Date;
  nombreCliente: string;
  telefono: string;
  servicio: string;
  estado: string;
  precioCobrado: number | null;
  /**
   * "en curso" / "siguiente", o null. Se calcula aquí y no en el componente
   * porque depende del reloj: leer Date.now() durante el render rompe la
   * regla de pureza de React (react-hooks/purity), y con razón — el render
   * dejaría de ser determinista.
   */
  marca: "en curso" | "siguiente" | null;
};

export type FilaAgenda =
  | { tipo: "cita"; cita: CitaAgenda }
  | { tipo: "libre"; inicio: Date; fin: Date }
  | { tipo: "cerrado"; inicio: Date; fin: Date };

export type Agenda = {
  /** "error" se distingue de un día vacío: un fallo de red no es "no hay citas". */
  estado: "ok" | "error";
  /** El día no tiene bloques activos en horarios_semana. */
  cerrado: boolean;
  /** La línea de tiempo dentro del horario, con huecos y cierres intermedios. */
  filas: FilaAgenda[];
  /**
   * Citas cuyo inicio no cae en ningún bloque activo. Pasa cuando el dueño
   * cierra un día que ya tenía citas, o cambia el horario después de que se
   * agendaron. Se muestran aparte para que no se pierdan.
   */
  fueraDeHorario: CitaAgenda[];
  canceladas: CitaAgenda[];
  total: { citas: number; monto: number; sinPrecio: number };
};

type Rango = { inicio: Date; fin: Date };

/** Suma días a un "YYYY-MM-DD" sin caer en la trampa de zona de `new Date(str)`. */
export function sumarDias(fecha: string, dias: number) {
  const [year, month, day] = fecha.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function formatHoraCorta(instante: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);
}

export function formatDuracion(ms: number) {
  const minutos = Math.round(ms / 60000);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

export function formatMonto(monto: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(monto);
}

// PostgREST puede entregar la relación embebida como objeto o como arreglo
// según la versión; se aceptan las dos formas.
function nombreServicio(embed: unknown): string {
  const fila = Array.isArray(embed) ? embed[0] : embed;
  const nombre = (fila as { nombre?: string } | null | undefined)?.nombre;
  return nombre ?? "Servicio eliminado";
}

function construirFilas(bloques: Rango[], citas: CitaAgenda[]) {
  const filas: FilaAgenda[] = [];
  const colocadas = new Set<number>();

  bloques.forEach((bloque, i) => {
    const finBloque = bloque.fin.getTime();
    let cursor = bloque.inicio.getTime();

    const delBloque = citas.filter(
      (c) => c.inicio.getTime() >= bloque.inicio.getTime() && c.inicio.getTime() < finBloque
    );

    for (const cita of delBloque) {
      colocadas.add(cita.id);
      const inicioCita = cita.inicio.getTime();

      if (inicioCita > cursor) {
        filas.push({ tipo: "libre", inicio: new Date(cursor), fin: new Date(inicioCita) });
      }

      filas.push({ tipo: "cita", cita });
      // max() por si una cita se extiende más allá de la siguiente: el hueco
      // no debe calcularse hacia atrás.
      cursor = Math.max(cursor, cita.fin.getTime());
    }

    if (cursor < finBloque) {
      filas.push({ tipo: "libre", inicio: new Date(cursor), fin: new Date(finBloque) });
    }

    // Entre un bloque y el siguiente la barbería está CERRADA, no libre. Es la
    // diferencia que evita agendar a alguien a las 14:30 un sábado.
    const siguiente = bloques[i + 1];
    if (siguiente && siguiente.inicio.getTime() > finBloque) {
      filas.push({ tipo: "cerrado", inicio: new Date(finBloque), fin: siguiente.inicio });
    }
  });

  return { filas, fueraDeHorario: citas.filter((c) => !colocadas.has(c.id)) };
}

export async function getAgendaDelDia(fecha: string): Promise<Agenda> {
  const vacia: Agenda = {
    estado: "error",
    cerrado: false,
    filas: [],
    fueraDeHorario: [],
    canceladas: [],
    total: { citas: 0, monto: 0, sinPrecio: 0 },
  };

  // Los límites del día y los bloques son datos públicos: cliente público.
  const [limitesRes, bloquesRes] = await Promise.all([
    supabase.rpc("limites_del_dia", { fecha }),
    supabase.rpc("bloques_del_dia", { fecha }),
  ]);

  if (limitesRes.error || !limitesRes.data?.length || bloquesRes.error) {
    return vacia;
  }

  const limites = limitesRes.data[0] as { inicio: string; fin: string };

  const bloques: Rango[] = ((bloquesRes.data ?? []) as { inicio: string; fin: string }[]).map(
    (b) => ({ inicio: new Date(b.inicio), fin: new Date(b.fin) })
  );

  // Las citas sí requieren la llave maestra: la tabla no tiene políticas RLS.
  const { data, error } = await supabaseAdmin
    .from("citas")
    .select(
      "id, inicio, fin, nombre_cliente, telefono, estado, precio_cobrado, servicios(nombre)"
    )
    .gte("inicio", limites.inicio)
    .lt("inicio", limites.fin)
    .order("inicio");

  if (error) return vacia;

  const todas: CitaAgenda[] = (data ?? []).map((row) => ({
    id: row.id as number,
    inicio: new Date(row.inicio as string),
    fin: new Date(row.fin as string),
    nombreCliente: row.nombre_cliente as string,
    telefono: row.telefono as string,
    servicio: nombreServicio(row.servicios),
    estado: row.estado as string,
    precioCobrado: row.precio_cobrado as number | null,
    marca: null,
  }));

  const canceladas = todas.filter((c) => c.estado === "cancelada");
  const activas = todas.filter((c) => c.estado !== "cancelada");

  // Marcar la cita en curso y la siguiente. Solo tiene sentido en el día de
  // hoy: en otra fecha, "la siguiente" no significa nada útil.
  if (fecha === fechaDeHoy()) {
    const ahora = Date.now();
    const enCurso = activas.find(
      (c) => c.inicio.getTime() <= ahora && c.fin.getTime() > ahora
    );
    if (enCurso) enCurso.marca = "en curso";

    const siguiente = activas.find((c) => c.inicio.getTime() > ahora);
    if (siguiente) siguiente.marca = "siguiente";
  }

  const { filas, fueraDeHorario } = construirFilas(bloques, activas);

  // Las canceladas no cuentan: su horario quedó libre y no son ingreso.
  const conPrecio = activas.filter((c) => c.precioCobrado !== null);

  return {
    estado: "ok",
    cerrado: bloques.length === 0,
    filas,
    fueraDeHorario,
    canceladas,
    total: {
      citas: activas.length,
      monto: conPrecio.reduce((suma, c) => suma + Number(c.precioCobrado), 0),
      sinPrecio: activas.length - conPrecio.length,
    },
  };
}

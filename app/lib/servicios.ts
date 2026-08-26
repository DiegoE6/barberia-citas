import { supabase } from "@/app/lib/supabase";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

/**
 * Lectura de servicios para el panel.
 *
 * A diferencia de Services.tsx —que solo muestra los activos— aquí se traen
 * TODOS: el panel tiene que poder volver a activar uno que está apagado.
 *
 * Además de la fila, cada servicio trae cuántas citas futuras lo usan. Ese
 * dato depende del reloj (`now()`), y leer la hora durante el render rompe la
 * regla de pureza de React; por eso se calcula aquí y no en el componente.
 * Es el mismo motivo por el que la marca "en curso" vive en lib/agenda.ts.
 */

export type ServicioAdmin = {
  id: number;
  nombre: string;
  precio: number;
  duracionMinutos: number;
  activo: boolean;
  /** Citas de hoy en adelante, sin contar canceladas, que usan este servicio. */
  citasFuturas: number;
};

export type ListaServicios = {
  /** "error" se distingue de la lista vacía: un fallo de red no es "no hay servicios". */
  estado: "ok" | "error";
  servicios: ServicioAdmin[];
};

export async function getServiciosAdmin(): Promise<ListaServicios> {
  // `servicios` es data pública —ya sale en la landing—, así que va con el
  // cliente público. Su política de select es `using (true)`, sin filtrar por
  // activo, de modo que los apagados también se leen.
  const { data: filas, error } = await supabase
    .from("servicios")
    .select("id, nombre, precio, duracion_minutos, activo")
    .order("orden")
    // Desempate estable: hoy todos los servicios comparten orden = 0, y sin
    // esto la lista podría salir en distinto orden en cada carga.
    .order("id");

  if (error || !filas) {
    return { estado: "error", servicios: [] };
  }

  // Una sola consulta para todos los servicios, no una por cada uno. Las citas
  // sí requieren la llave maestra: la tabla no tiene políticas de RLS.
  const { data: futuras, error: errorCitas } = await supabaseAdmin
    .from("citas")
    .select("servicio_id")
    .gte("inicio", new Date().toISOString())
    .neq("estado", "cancelada");

  if (errorCitas) {
    return { estado: "error", servicios: [] };
  }

  // Un Map de servicio_id -> cuántas citas futuras tiene.
  const conteo = new Map<number, number>();
  for (const cita of futuras ?? []) {
    const id = cita.servicio_id as number;
    conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }

  return {
    estado: "ok",
    servicios: filas.map((fila) => ({
      id: fila.id as number,
      nombre: fila.nombre as string,
      // PostgREST puede entregar un `numeric` como texto según la versión.
      precio: Number(fila.precio),
      duracionMinutos: fila.duracion_minutos as number,
      activo: fila.activo as boolean,
      citasFuturas: conteo.get(fila.id as number) ?? 0,
    })),
  };
}

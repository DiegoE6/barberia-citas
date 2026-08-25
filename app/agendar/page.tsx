import { supabase } from "@/app/lib/supabase";
import {
  getDisponibilidad,
  fechaDeHoy,
  SLOT_STEP_MINUTES,
  MIN_LEAD_MINUTES,
} from "@/app/lib/disponibilidad";

// Página de verificación del Paso A: elegir servicio y fecha, y ver los
// horarios libres. Todavía no agenda nada — el formulario y el Server Action
// son el Paso B.
//
// Es un Server Component y el formulario es un <form method="get"> normal:
// al enviarlo, el navegador recarga la página con ?servicio=&fecha= en la URL
// y el servidor vuelve a calcular. Cero JavaScript de cliente.

export default async function AgendarPage({
  searchParams,
}: {
  // En Next 16 searchParams es una Promise: hay que await-earla.
  searchParams: Promise<{ servicio?: string; fecha?: string }>;
}) {
  const params = await searchParams;

  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, nombre, duracion_minutos")
    .eq("activo", true)
    .order("orden");

  const fecha = params.fecha || fechaDeHoy();
  const servicioId = Number(params.servicio);
  const servicio = servicios?.find((s) => s.id === servicioId);

  const disponibilidad = servicio
    ? await getDisponibilidad(fecha, servicio.duracion_minutos)
    : null;

  return (
    <section className="bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          Agendar cita
        </h1>

        <form
          method="get"
          className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Servicio</span>
            <select
              name="servicio"
              defaultValue={servicio ? String(servicio.id) : ""}
              className="rounded-md border border-zinc-300 px-3 py-2"
            >
              <option value="">Elige un servicio</option>
              {servicios?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({s.duracion_minutos} min)
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Fecha</span>
            <input
              type="date"
              name="fecha"
              defaultValue={fecha}
              min={fechaDeHoy()}
              className="rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-amber-700 px-5 py-2 font-semibold text-white"
          >
            Ver horarios
          </button>
        </form>

        <div className="mt-10">
          {!servicio ? (
            <p className="text-center text-zinc-500">
              Elige un servicio y una fecha para ver los horarios disponibles.
            </p>
          ) : disponibilidad?.estado === "error" ? (
            <p className="text-center text-zinc-500">
              No pudimos consultar la disponibilidad. Intenta de nuevo.
            </p>
          ) : disponibilidad?.estado === "cerrado" ? (
            <p className="text-center text-zinc-500">
              La barbería no abre ese día.
            </p>
          ) : disponibilidad?.slots.length === 0 ? (
            <p className="text-center text-zinc-500">
              No quedan horarios libres para esa fecha.
            </p>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                {disponibilidad?.slots.length} horarios disponibles para{" "}
                {servicio.nombre} ({servicio.duracion_minutos} min)
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {disponibilidad?.slots.map((slot) => (
                  <li
                    key={slot.inicio.toISOString()}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-lg"
                  >
                    {slot.hora}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-zinc-400">
          Paso de {SLOT_STEP_MINUTES} min · anticipación mínima de{" "}
          {MIN_LEAD_MINUTES} min
        </p>
      </div>
    </section>
  );
}

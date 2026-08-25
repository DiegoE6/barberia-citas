import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { agendarCita } from "@/app/actions/citas";
import { getDisponibilidad, formatFechaLarga } from "@/app/lib/disponibilidad";

// Paso 2 del flujo: confirmar la selección y dejar los datos de contacto.
//
// Esta página existe precisamente para que no haya duda de qué se está
// agendando: el resumen sale de la URL, no de ningún desplegable que se
// pueda haber cambiado sin enviar.

const MENSAJES_ERROR: Record<string, string> = {
  datos: "Faltan datos. Revisa tu nombre y teléfono.",
  desconocido: "No pudimos completar la reserva. Intenta de nuevo.",
};

export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{
    servicio?: string;
    fecha?: string;
    hora?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const fecha = params.fecha ?? "";
  const hora = params.hora ?? "";
  const servicioId = Number(params.servicio);

  const { data: servicio } = await supabase
    .from("servicios")
    .select("id, nombre, precio, duracion_minutos")
    .eq("id", servicioId)
    .eq("activo", true)
    .maybeSingle();

  // Se revalida antes de pedir los datos, para no hacer al cliente escribir
  // su nombre y teléfono en un horario que ya se ocupó.
  const disponibilidad = servicio
    ? await getDisponibilidad(fecha, servicio.duracion_minutos)
    : null;

  const slotSigueLibre = disponibilidad?.slots.some((s) => s.hora === hora);
  const mensajeError = params.error ? MENSAJES_ERROR[params.error] : null;

  if (!servicio || !fecha || !hora || !slotSigueLibre) {
    return (
      <section className="bg-white px-6 py-20 text-zinc-900">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Ese horario ya no está disponible
          </h1>
          <p className="mt-4 text-zinc-500">
            Puede que alguien lo haya tomado mientras decidías.
          </p>
          <Link
            href="/agendar"
            className="mt-8 inline-block rounded-md bg-amber-700 px-5 py-2 font-semibold text-white"
          >
            Elegir otro horario
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-lg">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          Confirma tu cita
        </h1>

        {mensajeError && (
          <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-center text-amber-900">
            {mensajeError}
          </p>
        )}

        <dl className="mt-10 flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
          <div className="flex justify-between py-3">
            <dt className="text-zinc-500">Servicio</dt>
            <dd className="font-medium">{servicio.nombre}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-zinc-500">Fecha</dt>
            <dd className="font-medium">{formatFechaLarga(fecha)}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-zinc-500">Hora</dt>
            <dd className="font-medium">
              {hora} ({servicio.duracion_minutos} min)
            </dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-zinc-500">Precio</dt>
            <dd className="font-semibold text-amber-700">
              ${servicio.precio} MXN
            </dd>
          </div>
        </dl>

        {/* action={agendarCita} conecta el formulario con el Server Action:
            Next.js crea el endpoint y hace el POST. Los hidden llevan la
            selección tal como se calculó, no lo que muestre ningún control. */}
        <form action={agendarCita} className="mt-8 flex flex-col gap-4">
          <input type="hidden" name="servicio" value={servicio.id} />
          <input type="hidden" name="fecha" value={fecha} />
          <input type="hidden" name="hora" value={hora} />

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre</span>
            <input
              type="text"
              name="nombre"
              required
              maxLength={80}
              className="rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Teléfono</span>
            <input
              type="tel"
              name="telefono"
              required
              maxLength={20}
              placeholder="81 1234 5678"
              className="rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-md bg-amber-700 px-5 py-3 font-semibold text-white"
          >
            Confirmar cita
          </button>
        </form>

        <p className="mt-6 text-center">
          <Link href="/agendar" className="text-sm text-zinc-500 underline">
            Elegir otro horario
          </Link>
        </p>
      </div>
    </section>
  );
}

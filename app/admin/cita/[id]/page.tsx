import Link from "next/link";
import { verifySession } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { formatFechaLarga } from "@/app/lib/disponibilidad";
import {
  formatHoraCorta,
  formatMonto,
  fechaLocalDe,
} from "@/app/lib/agenda";
import {
  confirmarCita,
  cancelarCita,
  reactivarCita,
} from "@/app/actions/agenda";

// Detalle de una cita. Aquí vive cancelar, a propósito: es la acción
// destructiva y no debe estar a un toque en la lista de la agenda.

const MENSAJES_ERROR: Record<string, string> = {
  ocupado:
    "No se puede reactivar: alguien más ya tomó ese horario. Habría que agendarla en otro.",
  transicion:
    "Esa cita cambió de estado mientras la veías. Vuelve a la agenda y revisa.",
  desconocido: "No pudimos guardar el cambio. Intenta de nuevo.",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Sin confirmar",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export default async function CitaPage({
  params,
  searchParams,
}: {
  // En Next 16 params y searchParams son Promises: hay que await-earlos.
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await verifySession();

  const { id } = await params;
  const { error: codigoError } = await searchParams;

  const { data: cita } = await supabaseAdmin
    .from("citas")
    .select(
      "id, inicio, fin, nombre_cliente, telefono, estado, precio_cobrado, created_at, servicios(nombre)"
    )
    .eq("id", Number(id))
    .maybeSingle();

  if (!cita) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Esa cita no existe
        </h1>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-md border border-zinc-400 px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
        >
          Volver a la agenda
        </Link>
      </div>
    );
  }

  const inicio = new Date(cita.inicio as string);
  const fin = new Date(cita.fin as string);
  const fecha = fechaLocalDe(inicio);
  const nombre = cita.nombre_cliente as string;
  const estado = cita.estado as string;
  const precio = cita.precio_cobrado as number | null;

  const embed = cita.servicios as unknown;
  const fila = Array.isArray(embed) ? embed[0] : embed;
  const servicio =
    (fila as { nombre?: string } | null | undefined)?.nombre ??
    "Servicio eliminado";

  const mensajeError = codigoError ? MENSAJES_ERROR[codigoError] : null;

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-10">
      <Link
        href={`/admin?fecha=${fecha}`}
        className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-zinc-900"
      >
        ← Volver a la agenda
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900">
        {nombre}
      </h1>

      {mensajeError && (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          {mensajeError}
        </p>
      )}

      <dl className="mt-8 flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-zinc-600">Estado</dt>
          <dd
            className={`font-semibold ${
              estado === "cancelada" ? "text-zinc-500" : "text-zinc-900"
            }`}
          >
            {ETIQUETA_ESTADO[estado] ?? estado}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-zinc-600">Servicio</dt>
          <dd className="font-medium text-zinc-900">{servicio}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-zinc-600">Fecha</dt>
          <dd className="font-medium text-zinc-900 first-letter:uppercase">
            {formatFechaLarga(fecha)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-zinc-600">Hora</dt>
          <dd className="font-medium tabular-nums text-zinc-900">
            {formatHoraCorta(inicio)} – {formatHoraCorta(fin)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-zinc-600">Teléfono</dt>
          <dd>
            <a
              href={`tel:${cita.telefono}`}
              className="font-medium text-zinc-900 underline underline-offset-2"
            >
              {cita.telefono as string}
            </a>
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-zinc-600">Precio</dt>
          <dd className="font-medium text-zinc-900">
            {precio === null ? "Sin precio" : formatMonto(Number(precio))}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-zinc-600">
        Agendada el{" "}
        {formatFechaLarga(fechaLocalDe(new Date(cita.created_at as string)))}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {estado === "pendiente" && (
          <form action={confirmarCita}>
            <input type="hidden" name="cita" value={cita.id as number} />
            <button
              type="submit"
              className="w-full rounded-md bg-amber-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-amber-800"
            >
              Confirmar cita
            </button>
          </form>
        )}

        {(estado === "pendiente" || estado === "confirmada") && (
          <form action={cancelarCita}>
            <input type="hidden" name="cita" value={cita.id as number} />
            {/* El nombre va DENTRO del botón: no se puede cancelar a la
                persona equivocada sin leer de quién es la cita. */}
            <button
              type="submit"
              className="w-full rounded-md bg-red-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-red-800"
            >
              Cancelar la cita de {nombre}
            </button>
          </form>
        )}

        {estado === "cancelada" && (
          <form action={reactivarCita}>
            <input type="hidden" name="cita" value={cita.id as number} />
            <button
              type="submit"
              className="w-full rounded-md border border-zinc-400 px-5 py-3 font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
            >
              Reactivar la cita de {nombre}
            </button>
          </form>
        )}
      </div>

      {estado === "cancelada" && (
        <p className="mt-3 text-sm text-zinc-600">
          Su horario está libre. Reactivar solo funciona si nadie lo ha tomado.
        </p>
      )}
    </div>
  );
}

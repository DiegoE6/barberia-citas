import Link from "next/link";
import { verifySession } from "@/app/lib/auth";
import { getServiciosAdmin, type ServicioAdmin } from "@/app/lib/servicios";
import {
  guardarServicio,
  activarServicio,
  desactivarServicio,
} from "@/app/actions/servicios";

// Editor de servicios y precios. Lo que se guarda aquí sale de inmediato en la
// landing: el Server Action llama a revalidatePath('/').
//
// Crear servicios nuevos y reordenarlos NO están todavía: son un paso aparte.
// Borrar no va a estar nunca — el FK de `citas` lo impide para servicios con
// historial, y "dejar de ofrecer" es el mecanismo previsto.

const MENSAJES_ERROR: Record<string, string> = {
  nombre: "El servicio necesita un nombre.",
  precio: "El precio tiene que ser un número de 0 o más.",
  duracion: "La duración tiene que estar entre 5 y 480 minutos.",
  noexiste: "Ese servicio ya no existe. Vuelve a cargar la página.",
  desconocido: "No pudimos guardar el cambio. Intenta de nuevo.",
};

const CAMPO = "rounded-md border border-zinc-400 px-3 py-2 text-zinc-900";
const ETIQUETA = "text-sm font-medium text-zinc-700";

function Servicio({
  servicio,
  guardado,
}: {
  servicio: ServicioAdmin;
  guardado: boolean;
}) {
  return (
    <li className="py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">
          {servicio.nombre}
        </h2>

        {!servicio.activo && (
          <span className="rounded-full border border-zinc-400 px-2 py-0.5 text-xs text-zinc-600">
            no se ofrece
          </span>
        )}

        {guardado && (
          <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
            guardado
          </span>
        )}
      </div>

      <form action={guardarServicio} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="servicio" value={servicio.id} />

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={ETIQUETA}>Nombre</span>
          <input
            type="text"
            name="nombre"
            defaultValue={servicio.nombre}
            required
            maxLength={80}
            className={CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={ETIQUETA}>Precio (MXN)</span>
          <input
            type="number"
            name="precio"
            defaultValue={servicio.precio}
            required
            min={0}
            step={1}
            inputMode="numeric"
            className={CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={ETIQUETA}>Duración (minutos)</span>
          <input
            type="number"
            name="duracion"
            defaultValue={servicio.duracionMinutos}
            required
            min={5}
            max={480}
            step={5}
            inputMode="numeric"
            className={CAMPO}
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-amber-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-amber-800"
          >
            Guardar
          </button>
        </div>
      </form>

      {/* Formulario aparte y no un botón más del de arriba: en HTML no se
          pueden anidar formularios, y además esta acción no debe arrastrar los
          campos que el dueño tenga a medio escribir. */}
      <form
        action={servicio.activo ? desactivarServicio : activarServicio}
        className="mt-4"
      >
        <input type="hidden" name="servicio" value={servicio.id} />
        <button
          type="submit"
          className="rounded-md border border-zinc-400 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
        >
          {servicio.activo ? "Dejar de ofrecer" : "Volver a ofrecer"}
        </button>

        {servicio.citasFuturas > 0 && (
          <p className="mt-2 text-sm text-zinc-600">
            {servicio.citasFuturas}{" "}
            {servicio.citasFuturas === 1 ? "cita futura" : "citas futuras"} con
            este servicio.{" "}
            {servicio.activo
              ? "Dejar de ofrecerlo no las cancela: solo se quita de las reservas nuevas."
              : "Siguen en pie."}
          </p>
        )}
      </form>
    </li>
  );
}

export default async function ServiciosPage({
  searchParams,
}: {
  // En Next 16 searchParams es una Promise: hay que await-earla.
  searchParams: Promise<{ error?: string; servicio?: string; ok?: string }>;
}) {
  await verifySession();

  const params = await searchParams;
  const mensajeError = params.error ? MENSAJES_ERROR[params.error] : null;
  const guardadoId = Number(params.ok) || null;

  const { estado, servicios } = await getServiciosAdmin();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-zinc-900"
      >
        ← Volver a la agenda
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900">
        Servicios
      </h1>

      <p className="mt-3 text-sm text-zinc-600">
        Los cambios salen en el sitio de inmediato. Cambiar un precio o una
        duración no altera las citas ya agendadas: cada cita guarda el precio y
        la hora de fin con los que se hizo.
      </p>

      {mensajeError && (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          {mensajeError}
        </p>
      )}

      {estado === "error" ? (
        <p className="mt-8 text-zinc-600">
          No pudimos cargar los servicios. Intenta de nuevo.
        </p>
      ) : servicios.length === 0 ? (
        <p className="mt-8 text-zinc-600">Todavía no hay servicios cargados.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-zinc-200">
          {servicios.map((servicio) => (
            <Servicio
              key={servicio.id}
              servicio={servicio}
              guardado={servicio.id === guardadoId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

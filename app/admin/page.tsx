import Link from "next/link";
import { verifySession } from "@/app/lib/auth";
import { cerrarSesion } from "@/app/actions/auth";
import { fechaDeHoy, formatFechaLarga } from "@/app/lib/disponibilidad";
import {
  getAgendaDelDia,
  sumarDias,
  formatHoraCorta,
  formatDuracion,
  formatMonto,
  type CitaAgenda,
} from "@/app/lib/agenda";

// Agenda del día. SOLO LECTURA: confirmar y cancelar son el siguiente paso.

function Fila({ cita }: { cita: CitaAgenda }) {
  const marca = cita.marca;

  const resalte =
    marca === "en curso"
      ? "border-amber-700 bg-amber-50"
      : marca === "siguiente"
        ? "border-amber-300"
        : "border-transparent";

  return (
    <li className={`flex gap-4 border-l-4 py-3 pl-3 ${resalte}`}>
      {/* La hora es el ancla de barrido: ancho fijo para que quede alineada. */}
      <span className="w-14 shrink-0 text-xl font-semibold tabular-nums text-zinc-900">
        {formatHoraCorta(cita.inicio)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-zinc-900">{cita.nombreCliente}</span>
          {marca && (
            <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
              {marca}
            </span>
          )}
          {cita.estado === "pendiente" && (
            <span className="rounded-full border border-zinc-400 px-2 py-0.5 text-xs text-zinc-600">
              sin confirmar
            </span>
          )}
        </p>

        <p className="text-zinc-700">{cita.servicio}</p>

        <p className="mt-1 text-sm text-zinc-600">
          Termina {formatHoraCorta(cita.fin)} ·{" "}
          {/* En celular el teléfono sirve para llamar de un toque. */}
          <a
            href={`tel:${cita.telefono}`}
            className="font-medium text-zinc-700 underline underline-offset-2"
          >
            {cita.telefono}
          </a>
        </p>
      </div>
    </li>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { email } = await verifySession();

  const params = await searchParams;
  const hoy = fechaDeHoy();
  const fecha = params.fecha || hoy;
  const esHoy = fecha === hoy;

  // getAgendaDelDia ya marca la cita en curso y la siguiente: ese cálculo
  // depende del reloj y no puede vivir en el render.
  const agenda = await getAgendaDelDia(fecha);
  const { total } = agenda;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Agenda</h1>

      {/* Navegación por GET con ?fecha= en la URL: funciona el botón atrás,
          se puede guardar en favoritos, y no hace falta JavaScript. */}
      <nav className="mt-6 flex items-center gap-2">
        <Link
          href={`/admin?fecha=${sumarDias(fecha, -1)}`}
          aria-label="Día anterior"
          className="rounded-md border border-zinc-400 px-4 py-3 text-xl font-semibold leading-none text-zinc-900 transition-colors hover:bg-zinc-100"
        >
          ←
        </Link>
        <Link
          href={`/admin?fecha=${sumarDias(fecha, 1)}`}
          aria-label="Día siguiente"
          className="rounded-md border border-zinc-400 px-4 py-3 text-xl font-semibold leading-none text-zinc-900 transition-colors hover:bg-zinc-100"
        >
          →
        </Link>

        {!esHoy && (
          <Link
            href="/admin"
            className="rounded-md border border-zinc-400 px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            Hoy
          </Link>
        )}

        <form method="get" className="ml-auto">
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            className="rounded-md border border-zinc-400 px-3 py-2 text-zinc-900"
          />
        </form>
      </nav>

      <p className="mt-6 text-lg font-medium text-zinc-900 first-letter:uppercase">
        {formatFechaLarga(fecha)}
      </p>

      {agenda.estado === "error" ? (
        <p className="mt-6 text-zinc-500">
          No pudimos cargar la agenda. Intenta de nuevo.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-600">
            {total.citas === 0
              ? "Sin citas"
              : `${total.citas} ${total.citas === 1 ? "cita" : "citas"} · ${formatMonto(total.monto)}`}
            {/* Un total que se come filas sin avisar es peor que uno
                incompleto declarado. */}
            {total.sinPrecio > 0 && ` (${total.sinPrecio} sin precio)`}
          </p>

          {agenda.cerrado && (
            <p className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-600">
              La barbería no abre este día.
            </p>
          )}

          {agenda.filas.length > 0 && (
            <ul className="mt-6 flex flex-col divide-y divide-zinc-200">
              {agenda.filas.map((fila) =>
                fila.tipo === "cita" ? (
                  <Fila key={fila.cita.id} cita={fila.cita} />
                ) : (
                  <li
                    key={`${fila.tipo}-${fila.inicio.toISOString()}`}
                    className="py-2 pl-3 text-sm text-zinc-600"
                  >
                    {fila.tipo === "libre" ? "Libre" : "Cerrado"} ·{" "}
                    {formatDuracion(fila.fin.getTime() - fila.inicio.getTime())}
                    <span className="text-zinc-500">
                      {" "}
                      ({formatHoraCorta(fila.inicio)}–
                      {formatHoraCorta(fila.fin)})
                    </span>
                  </li>
                )
              )}
            </ul>
          )}

          {agenda.fueraDeHorario.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-amber-900">
                Fuera del horario ({agenda.fueraDeHorario.length})
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Se agendaron cuando el horario era otro. Siguen en pie.
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-zinc-200 rounded-md border border-amber-300 bg-amber-50 px-3">
                {agenda.fueraDeHorario.map((cita) => (
                  <Fila key={cita.id} cita={cita} />
                ))}
              </ul>
            </section>
          )}

          {agenda.canceladas.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-zinc-600">
                Canceladas ({agenda.canceladas.length})
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-500">
                {agenda.canceladas.map((cita) => (
                  <li key={cita.id}>
                    <span className="tabular-nums line-through">
                      {formatHoraCorta(cita.inicio)}
                    </span>{" "}
                    {cita.nombreCliente} · {cita.servicio}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="mt-12 flex items-center justify-between border-t border-zinc-200 pt-6">
        <span className="text-sm text-zinc-600">{email}</span>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="rounded-md border border-zinc-400 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

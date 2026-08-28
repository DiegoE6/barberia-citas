import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { whatsappUrl } from "@/app/data";
import { agendarCita } from "@/app/actions/citas";
import { MAX_CITAS_PENDIENTES } from "@/app/lib/limites";
import { getDisponibilidad, formatFechaLarga } from "@/app/lib/disponibilidad";

// Paso 2 del flujo: confirmar la selección y dejar los datos de contacto.
//
// Esta página existe precisamente para que no haya duda de qué se está
// agendando: el resumen sale de la URL, no de ningún desplegable que se
// pueda haber cambiado sin enviar.

/**
 * Los mensajes de los frenos anti-spam llevan `whatsapp: true`.
 *
 * Es la regla, no un adorno: un cliente real que choca con un límite no
 * puede quedarse sin salida, porque eso es una cita perdida. Ninguno de los
 * textos dice "spam", "bot" ni "bloqueado" — acusar a un cliente de verdad
 * es peor que la cita falsa que se estaba evitando.
 *
 * El número del límite se importa de app/lib/limites.ts en vez de escribirse
 * aquí, para que subir el umbral no deje el mensaje mintiendo.
 */
const MENSAJES_ERROR: Record<string, { texto: string; whatsapp: boolean }> = {
  datos: {
    texto: "Faltan datos. Revisa tu nombre y teléfono.",
    whatsapp: false,
  },
  desconocido: {
    texto: "No pudimos completar la reserva. Intenta de nuevo.",
    whatsapp: true,
  },
  limite_telefono: {
    texto: `Ya tienes ${MAX_CITAS_PENDIENTES} citas apartadas con este número. Si necesitas otra más, escríbenos y te la agendamos.`,
    whatsapp: true,
  },
  limite_ip: {
    texto:
      "Recibimos varias reservas desde esta conexión hace un momento. Espera unos minutos e inténtalo de nuevo, o escríbenos y te la agendamos.",
    whatsapp: true,
  },
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
          <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-center text-amber-900">
            <p>{mensajeError.texto}</p>
            {mensajeError.whatsapp && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-semibold underline"
              >
                Escríbenos por WhatsApp
              </a>
            )}
          </div>
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

          {/* Campo trampa (honeypot). Un bot que rellena todo lo que
              encuentra lo llena; una persona no lo ve. Si llega con algo,
              app/actions/citas.ts rechaza la reserva.

              El riesgo real de este campo NO es el bot: es que el
              autocompletar del navegador lo llene solo y mate una reserva
              legítima. De ahí las cuatro precauciones:

                - "referencia" no corresponde a ninguna categoría que los
                  navegadores autocompleten (nada de nombre, email o tel).
                - autoComplete="off" se lo pide explícitamente.
                - tabIndex={-1} lo saca del recorrido con Tab, para que
                  nadie caiga aquí navegando con el teclado.
                - aria-hidden lo esconde de los lectores de pantalla.

              Se oculta sacándolo de la pantalla y no con display:none,
              porque varios bots saltan justamente lo que está oculto así.
              Al ser absolute no ocupa lugar en el flex de arriba. */}
          <div
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
          >
            <label htmlFor="referencia">No llenes este campo</label>
            <input
              type="text"
              id="referencia"
              name="referencia"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>

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

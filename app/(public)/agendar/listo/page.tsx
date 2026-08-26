import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { formatFechaLarga } from "@/app/lib/disponibilidad";
import { siteConfig } from "@/app/data";

// Paso 3: confirmación al cliente.
//
// Se llega aquí por redirect() después de insertar, no renderizando la
// respuesta del POST. Así, recargar la página no reenvía el formulario ni
// crea una segunda cita.

export default async function ListoPage({
  searchParams,
}: {
  searchParams: Promise<{ servicio?: string; fecha?: string; hora?: string }>;
}) {
  const params = await searchParams;
  const fecha = params.fecha ?? "";
  const hora = params.hora ?? "";

  const { data: servicio } = await supabase
    .from("servicios")
    .select("nombre")
    .eq("id", Number(params.servicio))
    .maybeSingle();

  return (
    <section className="bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-3xl font-bold tracking-tight">¡Cita agendada!</h1>

        <p className="mt-4 text-zinc-600">
          Te esperamos en {siteConfig.name}.
        </p>

        {servicio && fecha && hora && (
          <p className="mt-8 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-lg">
            <span className="font-semibold">{servicio.nombre}</span>
            <br />
            {formatFechaLarga(fecha)}
            <br />a las {hora}
          </p>
        )}

        <p className="mt-6 text-sm text-zinc-500">
          Si necesitas cancelar o cambiar la hora, escríbenos por WhatsApp.
        </p>

        <Link
          href="/"
          className="mt-8 inline-block rounded-md bg-amber-700 px-5 py-2 font-semibold text-white"
        >
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}

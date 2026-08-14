import { supabase } from "@/app/lib/supabase";

export default async function Services() {
  const { data: services, error } = await supabase
    .from("servicios")
    .select("id, nombre, precio")
    .eq("activo", true)
    .order("orden");

  return (
    <section className="bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Servicios
        </h2>
        {error || !services?.length ? (
          <p className="mt-10 text-center text-zinc-500">
            No hay servicios disponibles por el momento.
          </p>
        ) : (
          <ul className="mt-10 flex flex-col divide-y divide-zinc-200">
            {services.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between py-4"
              >
                <span className="text-lg">{service.nombre}</span>
                <span className="text-lg font-semibold text-amber-700">
                  ${service.precio} MXN
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

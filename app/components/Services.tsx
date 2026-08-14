import { services } from "@/app/data";

export default function Services() {
  return (
    <section className="bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Servicios
        </h2>
        <ul className="mt-10 flex flex-col divide-y divide-zinc-200">
          {services.map((service) => (
            <li
              key={service.name}
              className="flex items-center justify-between py-4"
            >
              <span className="text-lg">{service.name}</span>
              <span className="text-lg font-semibold text-amber-700">
                ${service.price} MXN
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

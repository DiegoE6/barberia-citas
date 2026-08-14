import { location } from "@/app/data";

export default function Location() {
  return (
    <section className="bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 sm:flex-row">
        <div className="flex h-48 w-full flex-1 items-center justify-center rounded-lg bg-zinc-200 text-zinc-500">
          Mapa próximamente
        </div>
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <h2 className="text-3xl font-bold tracking-tight">Ubicación</h2>
          <p className="mt-3 text-lg">{location.address}</p>
          <p className="text-lg">{location.cityLine}</p>
          <p className="text-zinc-600">{location.reference}</p>
        </div>
      </div>
    </section>
  );
}

import { siteConfig } from "@/app/data";

export default function Hero() {
  const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(
    siteConfig.whatsappMessage
  )}`;

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-900 px-6 py-32 text-center text-zinc-50">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        {siteConfig.name}
      </h1>
      <p className="max-w-md text-lg text-zinc-300">
        Cortes clásicos y modernos en {siteConfig.city}.
      </p>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-amber-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-700"
      >
        Agendar cita
      </a>
    </section>
  );
}

import Link from "next/link";
import { siteConfig, whatsappUrl } from "@/app/data";

export default function Hero() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-900 px-6 py-20 text-center text-zinc-50 sm:py-32">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        {siteConfig.name}
      </h1>
      <p className="max-w-md text-lg text-zinc-300">
        Cortes clásicos y modernos en {siteConfig.city}.
      </p>

      <div className="flex flex-col items-center gap-2">
        {/* Acción principal: sólida y grande. amber-700 sobre blanco da 5:1 de
            contraste; el amber-600 anterior daba 3.2:1 y no pasaba WCAG AA. */}
        <Link
          href="/agendar"
          className="rounded-full bg-amber-700 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-amber-800"
        >
          Agendar cita
        </Link>

        {/* Opción secundaria, para quien prefiera hablar con una persona. Es
            un enlace de texto, no un botón, para que no compita con el de
            arriba. El py-2 le da área de toque suficiente en móvil aunque no
            se vea como botón. */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 text-sm text-zinc-400 underline underline-offset-4 transition-colors hover:text-zinc-200"
        >
          ¿Prefieres hablar con alguien? Escríbenos por WhatsApp
        </a>
      </div>
    </section>
  );
}

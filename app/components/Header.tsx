import Link from "next/link";
import { siteConfig } from "@/app/data";

// Barra superior fija, presente en toda la app (va en layout.tsx).
//
// Cumple dos funciones: tener siempre a un toque la acción principal
// —agendar— y ser la vía de regreso a la landing desde /agendar, que es el
// nombre del negocio, donde la gente ya lo busca.

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href="/"
          className="truncate text-lg font-bold tracking-tight text-zinc-50"
        >
          {siteConfig.name}
        </Link>

        <Link
          href="/agendar"
          className="shrink-0 rounded-full bg-amber-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-800"
        >
          {/* En pantallas chicas el nombre del negocio y el botón se aprietan,
              así que ahí el botón se queda en "Agendar". */}
          <span className="sm:hidden">Agendar</span>
          <span className="hidden sm:inline">Agendar cita</span>
        </Link>
      </div>
    </header>
  );
}

import Link from "next/link";
import { siteConfig } from "@/app/data";

// Chrome del panel. Deliberadamente sobrio y sin el CTA de "Agendar cita":
// el dueño no es un cliente, y ese botón aquí no tiene sentido.
//
// Este layout envuelve también a /admin/login, así que no puede contener nada
// que asuma sesión iniciada — el botón de cerrar sesión vive en la página del
// panel, no aquí.
//
// La verificación de acceso NO va en este layout. Los layouts no se vuelven a
// ejecutar en cada navegación, así que no son un lugar fiable para autorizar:
// cada página llama a verifySession() en su primera línea.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight text-zinc-900">
            Panel
          </span>
          <Link
            href="/"
            className="truncate text-sm text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-900"
          >
            Ir al sitio de {siteConfig.name}
          </Link>
        </div>
      </header>

      {/* El color de texto se fija aquí, no se hereda: un elemento sin
          clase de color no debe depender del tema del sistema. */}
      <main className="flex flex-1 flex-col bg-white text-zinc-900">
        {children}
      </main>
    </>
  );
}

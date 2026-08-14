import { siteConfig } from "@/app/data";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-zinc-950 px-6 py-6 text-center text-sm text-zinc-500">
      © {year} {siteConfig.name}. Todos los derechos reservados.
    </footer>
  );
}

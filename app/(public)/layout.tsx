import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

// Chrome del sitio público: landing y flujo de reserva.
//
// flex-1 en el <main> hace que el contenido ocupe el alto disponible, para
// que el footer quede abajo también en páginas cortas como /agendar/listo.
// <main> además aporta el landmark que usan los lectores de pantalla.

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </>
  );
}

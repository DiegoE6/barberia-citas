import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Layout raíz: solo <html>, <body>, fuentes y metadata.
//
// El encabezado y el pie NO van aquí. La landing y el panel son dos sitios
// distintos con distinta navegación, así que cada uno trae el suyo:
//   app/(public)/layout.tsx -> Header + Footer de la barbería
//   app/admin/layout.tsx    -> barra sobria del panel
//
// (public) es un route group: los paréntesis hacen que la carpeta NO aparezca
// en la URL. La landing sigue siendo "/" y la reserva "/agendar".

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Barbería El Roble | Monterrey",
  description:
    "Barbería en Monterrey. Cortes clásicos y modernos. Agenda tu cita en línea.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-MX"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import { contact, whatsappUrl } from "@/app/data";

export default function Contact() {
  return (
    <section className="bg-zinc-900 px-6 py-20 text-center text-zinc-50">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
        <h2 className="text-3xl font-bold tracking-tight">Contacto</h2>
        <p className="text-lg text-zinc-300">Tel: {contact.phoneDisplay}</p>
        <p className="text-lg text-zinc-300">
          Instagram: {contact.instagramHandle}
        </p>

        {/* Igual que en el Hero: enlace de texto, no botón. Antes era un botón
            ámbar idéntico al de agendar y competía con él. */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 px-3 py-2 text-sm text-zinc-400 underline underline-offset-4 transition-colors hover:text-zinc-200"
        >
          Escríbenos por WhatsApp
        </a>
      </div>
    </section>
  );
}

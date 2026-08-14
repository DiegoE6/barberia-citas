import { siteConfig, contact } from "@/app/data";

export default function Contact() {
  const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(
    siteConfig.whatsappMessage
  )}`;

  return (
    <section className="bg-zinc-900 px-6 py-20 text-center text-zinc-50">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
        <h2 className="text-3xl font-bold tracking-tight">Contacto</h2>
        <p className="text-lg text-zinc-300">Tel: {contact.phoneDisplay}</p>
        <p className="text-lg text-zinc-300">
          Instagram: {contact.instagramHandle}
        </p>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 rounded-full bg-amber-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-amber-700"
        >
          Escríbenos por WhatsApp
        </a>
      </div>
    </section>
  );
}

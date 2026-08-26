import Hero from "@/app/components/Hero";
import Services from "@/app/components/Services";
import Schedule from "@/app/components/Schedule";
import Location from "@/app/components/Location";
import Contact from "@/app/components/Contact";

// Esta página es estática: los servicios y los horarios vienen de Supabase pero
// cambian pocas veces al mes, así que no vale la pena consultar la base en cada
// visita. Aquí NO hay `export const revalidate`: la frescura ya no depende de
// que pase un tiempo, sino de que el panel avise. Los Server Actions de
// app/actions/servicios.ts (y los de horarios) llaman a revalidatePath('/')
// después de guardar, así que un precio nuevo sale de inmediato.
// Ver docs/DECISIONES.md.

export default function Home() {
  return (
    <>
      <Hero />
      <Services />
      <Schedule />
      <Location />
      <Contact />
    </>
  );
}

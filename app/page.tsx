import Hero from "@/app/components/Hero";
import Services from "@/app/components/Services";
import Schedule from "@/app/components/Schedule";
import Location from "@/app/components/Location";
import Contact from "@/app/components/Contact";

// Los servicios y los horarios vienen de Supabase y cambian pocas veces al mes.
// Regenerar la página cada 5 min mantiene el costo de consultas despreciable
// sin que el dueño tenga que esperar mucho para ver un precio actualizado.
// Ver docs/DECISIONES.md. En la Fase 4 (panel de admin) esto se reemplaza
// por revalidatePath() al guardar un cambio, para frescura inmediata.
export const revalidate = 300;

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

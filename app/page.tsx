import Hero from "@/app/components/Hero";
import Services from "@/app/components/Services";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Hero />
      <Services />
    </div>
  );
}

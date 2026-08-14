import Hero from "@/app/components/Hero";
import Services from "@/app/components/Services";
import Schedule from "@/app/components/Schedule";
import Location from "@/app/components/Location";
import Contact from "@/app/components/Contact";
import Footer from "@/app/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Hero />
      <Services />
      <Schedule />
      <Location />
      <Contact />
      <Footer />
    </div>
  );
}

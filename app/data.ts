// Datos ficticios del negocio. Cuando se agregue Supabase, esto se moverá a la base de datos.
export const siteConfig = {
  name: "Barbería El Roble",
  city: "Monterrey",
  whatsappNumber: "5218112345678", // Número ficticio
  whatsappMessage: "Hola, quiero agendar una cita",
};

export const services = [
  { name: "Corte clásico", price: 150 },
  { name: "Corte + barba", price: 220 },
  { name: "Afeitado tradicional", price: 130 },
  { name: "Diseño de barba", price: 100 },
  { name: "Corte niño", price: 120 },
];

export const schedule = [
  { day: "Lunes", hours: "10:00 - 20:00" },
  { day: "Martes", hours: "10:00 - 20:00" },
  { day: "Miércoles", hours: "10:00 - 20:00" },
  { day: "Jueves", hours: "10:00 - 20:00" },
  { day: "Viernes", hours: "10:00 - 21:00" },
  { day: "Sábado", hours: "09:00 - 18:00" },
  { day: "Domingo", hours: "Cerrado" },
];

export const location = {
  address: "Av. Roble 123, Col. Contry",
  cityLine: "Monterrey, N.L., México",
  reference: "Frente a la Plaza Contry",
};

export const contact = {
  phoneDisplay: "81 1234 5678",
  instagramHandle: "@elroble.mty",
};

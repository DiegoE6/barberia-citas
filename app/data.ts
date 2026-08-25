// Datos ficticios del negocio que todavía no viven en la base de datos.
// Los servicios salen de la tabla `servicios` y los horarios de `horarios_semana`.
export const siteConfig = {
  name: "Barbería El Roble",
  city: "Monterrey",
  whatsappNumber: "5218112345678", // Número ficticio
  // WhatsApp es el canal para dudas, no para agendar: la reserva va por
  // /agendar. Un "quiero agendar una cita" regresaría al dueño a la agenda
  // manual, que es justo lo que el sistema viene a reemplazar.
  whatsappMessage: "Hola, tengo una duda",
};

// URL de WhatsApp armada una sola vez. La usan Hero y Contact, que antes la
// construían por separado con el mismo código.
export const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(
  siteConfig.whatsappMessage
)}`;

export const location = {
  address: "Av. Roble 123, Col. Contry",
  cityLine: "Monterrey, N.L., México",
  reference: "Frente a la Plaza Contry",
};

export const contact = {
  phoneDisplay: "81 1234 5678",
  instagramHandle: "@elroble.mty",
};

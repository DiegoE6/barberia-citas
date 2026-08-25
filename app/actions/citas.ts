"use server";

import { redirect } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { getDisponibilidad } from "@/app/lib/disponibilidad";

/**
 * Server Action que agenda una cita.
 *
 * "use server" hace que esta función corra SOLO en el servidor: Next.js crea
 * el endpoint HTTP y conecta el formulario. El cuerpo nunca se descarga al
 * navegador, así que la service_role key no se expone.
 *
 * ⚠️ Pero según los propios docs de Next, un Server Action "es alcanzable por
 * cualquiera que pueda mandar el mismo POST: trátalo como un punto de entrada
 * no confiable". Por eso aquí NO se confía en nada de lo que llega:
 *
 *   - `fin` y `precio_cobrado` no se reciben: se derivan del servicio.
 *   - El horario elegido se vuelve a validar contra la disponibilidad real,
 *     porque la lista que vio el cliente pudo quedar vieja o ser inventada.
 */

const MINUTE_MS = 60 * 1000;

export async function agendarCita(formData: FormData) {
  const servicioId = Number(formData.get("servicio"));
  const fecha = String(formData.get("fecha") ?? "");
  const hora = String(formData.get("hora") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();

  // Los valores vienen del FormData, o sea de fuera: se escapan antes de
  // meterlos en una URL, aunque después se validen.
  const q = (valor: string | number) => encodeURIComponent(String(valor));

  const volverAConfirmar = (error: string) =>
    `/agendar/confirmar?servicio=${q(servicioId)}&fecha=${q(fecha)}&hora=${q(hora)}&error=${error}`;

  const volverASlots = (error: string) =>
    `/agendar?servicio=${q(servicioId)}&fecha=${q(fecha)}&error=${error}`;

  // ───────────────────────────────────────────────────────────────────────
  // TODO(anti-spam): el freno va AQUÍ, antes de tocar la base de datos.
  //
  // Hoy no hay nada que impida a un script llenar la agenda entera con citas
  // falsas: este endpoint es público y no requiere autenticación.
  //
  // Opciones, de menor a mayor costo:
  //   1. Campo trampa (honeypot) oculto en el formulario: si viene lleno, es
  //      un bot. Gratis, detiene lo más burdo.
  //   2. Límite de N citas pendientes por teléfono al día. Barato, pero débil:
  //      los teléfonos se inventan.
  //   3. Límite por IP. Requiere leer headers y guardar contadores.
  //   4. Captcha, o verificación por SMS. Efectivo y con costo real.
  //
  // Ver docs/DECISIONES.md → "Acceso a citas: Server Action con service_role".
  // ───────────────────────────────────────────────────────────────────────

  // 1. Validación de forma. El `required` del HTML ya filtra al usuario
  //    normal; esto es para quien no pase por el formulario.
  if (!servicioId || !fecha || !hora || !nombre || !telefono) {
    redirect(volverAConfirmar("datos"));
  }

  // 2. El servicio tiene que existir y estar activo. Se usa el cliente
  //    público: `servicios` es data pública, no hace falta la llave maestra.
  const { data: servicio } = await supabase
    .from("servicios")
    .select("id, nombre, precio, duracion_minutos")
    .eq("id", servicioId)
    .eq("activo", true)
    .maybeSingle();

  if (!servicio) {
    redirect(volverASlots("servicio"));
  }

  // 3. Volver a calcular la disponibilidad real y comprobar que el horario
  //    elegido siga en la lista. Esto cubre de un golpe: día cerrado, horario
  //    fuera de bloque, slot en el pasado, y slot ya ocupado.
  const disponibilidad = await getDisponibilidad(
    fecha,
    servicio.duracion_minutos
  );

  if (disponibilidad.estado === "error") {
    redirect(volverASlots("desconocido"));
  }

  const slot = disponibilidad.slots.find((s) => s.hora === hora);

  if (!slot) {
    redirect(volverASlots("ocupado"));
  }

  // 4. `fin` y `precio_cobrado` los calcula el servidor, nunca el cliente.
  //    El instante de inicio sale del propio slot, que ya viene convertido
  //    desde Postgres: no se vuelve a interpretar ninguna hora en JavaScript.
  const inicio = slot.inicio;
  const fin = new Date(inicio.getTime() + servicio.duracion_minutos * MINUTE_MS);

  // `estado` se deja en el default de la tabla ('pendiente').
  const { error } = await supabaseAdmin.from("citas").insert({
    servicio_id: servicio.id,
    nombre_cliente: nombre,
    telefono,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    precio_cobrado: servicio.precio,
  });

  // 5. El paso 3 no basta: entre verificar e insertar pasan milisegundos, y en
  //    ese hueco otro cliente puede tomar el mismo horario. Quien lo impide de
  //    verdad es la restricción EXCLUDE de la base de datos, que devuelve el
  //    código 23P01 (exclusion_violation). Atraparlo es lo que convierte un
  //    error feo en un mensaje útil.
  if (error) {
    redirect(volverASlots(error.code === "23P01" ? "ocupado" : "desconocido"));
  }

  // redirect() lanza internamente, así que va fuera de cualquier try/catch y
  // al final. Además evita que recargar la página reenvíe el formulario.
  redirect(
    `/agendar/listo?servicio=${q(servicio.id)}&fecha=${q(fecha)}&hora=${q(hora)}`
  );
}

"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { verifySession } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

/**
 * Acciones del panel sobre una cita.
 *
 * ── Por qué tres actions y no uno con el estado como parámetro ──────────
 * Un `cambiarEstado(citaId, estado)` recibiría el estado desde el
 * formulario, o sea desde fuera. El CHECK de la tabla limita los valores
 * posibles, pero no impide una transición que no tenga sentido.
 *
 * Con tres actions, **la transición vive en el código, no en la petición**.
 * `aplicarCambio` no se exporta: en un archivo "use server" cada función
 * exportada se convierte en un endpoint público, así que dejarla privada es
 * lo que impide llamarla con valores arbitrarios.
 */

// Transiciones legales. Todo lo demás se rechaza.
const DESDE_PARA_CONFIRMAR = ["pendiente"];
const DESDE_PARA_CANCELAR = ["pendiente", "confirmada"];
const DESDE_PARA_REACTIVAR = ["cancelada"];

async function aplicarCambio(
  formData: FormData,
  desde: string[],
  a: string
) {
  // Primera línea, siempre. La verificación de la página no protege esto:
  // un Server Action es un endpoint POST propio, alcanzable sin pasar por
  // /admin.
  await verifySession();

  const citaId = Number(formData.get("cita"));

  if (!citaId) {
    redirect("/admin");
  }

  // ⚠️ HOY el citaId no se valida contra un dueño porque hay un solo negocio
  // y todas las citas son suyas. Cuando el sistema sea multi-negocio, aquí
  // hay que comprobar que la cita pertenezca al negocio de quien la pide, o
  // un dueño podrá cancelar citas de otro adivinando ids.
  // Ver docs/DECISIONES.md → "Propiedad de la cita".

  // El filtro por estado va dentro del UPDATE, no solo en una lectura previa:
  // así la comprobación y la escritura son una sola operación atómica. Si
  // alguien cambió la cita en el intermedio, no coincide y no se escribe.
  const { data, error } = await supabaseAdmin
    .from("citas")
    .update({ estado: a })
    .eq("id", citaId)
    .in("estado", desde)
    .select("id");

  if (error) {
    // Reactivar una cancelada la devuelve al alcance de la restricción
    // EXCLUDE. Si alguien ya tomó ese horario, Postgres devuelve 23P01,
    // el mismo código que ya traducimos en la reserva pública.
    const motivo = error.code === "23P01" ? "ocupado" : "desconocido";
    redirect(`/admin/cita/${citaId}?error=${motivo}`);
  }

  // Cero filas afectadas = la cita no existe, o ya no estaba en un estado
  // desde el que esta transición sea válida.
  if (!data?.length) {
    redirect(`/admin/cita/${citaId}?error=transicion`);
  }

  // Sin esto la agenda seguiría mostrando el estado viejo: según los docs de
  // Next, un action que no llama a refresh/revalidate "carries only its
  // return value, and the current route is not re-rendered". Que la página
  // sea dinámica no basta.
  refresh();
}

export async function confirmarCita(formData: FormData) {
  await aplicarCambio(formData, DESDE_PARA_CONFIRMAR, "confirmada");
}

export async function cancelarCita(formData: FormData) {
  await aplicarCambio(formData, DESDE_PARA_CANCELAR, "cancelada");
}

export async function reactivarCita(formData: FormData) {
  await aplicarCambio(formData, DESDE_PARA_REACTIVAR, "pendiente");
}

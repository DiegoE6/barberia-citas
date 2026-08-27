"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifySession } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

/**
 * Acciones del panel sobre los servicios.
 *
 * ── Por qué aquí sí hay revalidatePath y en agenda.ts no ────────────────
 * La agenda vive en /admin, que es una ruta dinámica: se renderiza en cada
 * visita. La landing NO: Next la sirve como HTML estático ya generado. Si el
 * dueño sube un precio y nadie avisa, la landing sigue mostrando el viejo.
 *
 * `revalidatePath('/')` es ese aviso: marca el HTML guardado como caduco para
 * que la siguiente visita lo regenere. Es lo que reemplaza al viejo
 * `export const revalidate = 300`, que esperaba a que pasaran cinco minutos
 * en vez de enterarse del cambio. Ver docs/DECISIONES.md.
 *
 * /agendar no necesita nada: también es dinámica, así que una duración nueva
 * se refleja en el siguiente cálculo de horarios.
 *
 * ── Activar y desactivar son dos actions, no una con el valor de parámetro ──
 * Mismo criterio que las tres actions de agenda.ts: si el valor viniera en el
 * formulario, vendría de fuera. `cambiarActivo` no se exporta — en un archivo
 * "use server" cada función exportada es un endpoint público.
 */

// Una cita de 0 minutos no tiene sentido y rompería el cálculo de `fin`; una
// de 12 horas se comería el día entero. Son topes de cordura, no reglas de
// negocio finas.
const DURACION_MIN = 5;
const DURACION_MAX = 480;

/** El precio cabe en numeric(10,2); este tope es muy anterior a ese límite. */
const PRECIO_MAX = 100000;

function volverConError(error: string, servicioId?: number): never {
  const ancla = servicioId ? `&servicio=${servicioId}` : "";
  redirect(`/admin/servicios?error=${error}${ancla}`);
}

/** Camino de salida común: avisar a la landing y volver con acuse de recibo. */
function terminar(servicioId: number): never {
  revalidatePath("/");

  // Se sale por redirect y no por refresh() —como sí hace agenda.ts— porque
  // aquí hace falta un acuse: guardar un precio deja el formulario con el
  // mismo aspecto, y sin el "Guardado" el dueño no sabría si pasó algo. El
  // redirect además evita que recargar la página reenvíe el formulario.
  redirect(`/admin/servicios?ok=${servicioId}`);
}

export async function guardarServicio(formData: FormData) {
  // Primera línea, siempre. La verificación de la página no protege esto: un
  // Server Action es un endpoint POST propio, alcanzable sin pasar por /admin.
  await verifySession();

  const servicioId = Number(formData.get("servicio"));
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precio = Number(formData.get("precio"));
  const duracion = Number(formData.get("duracion"));

  if (!servicioId) {
    volverConError("noexiste");
  }

  // El `required` del HTML ya filtra al usuario normal; esto es para quien no
  // pase por el formulario. Todo lo que llega en un FormData viene de fuera.
  if (!nombre) {
    volverConError("nombre", servicioId);
  }

  if (!Number.isFinite(precio) || precio < 0 || precio > PRECIO_MAX) {
    volverConError("precio", servicioId);
  }

  if (
    !Number.isInteger(duracion) ||
    duracion < DURACION_MIN ||
    duracion > DURACION_MAX
  ) {
    volverConError("duracion", servicioId);
  }

  const { data, error } = await supabaseAdmin
    .from("servicios")
    .update({
      nombre,
      // La columna es numeric(10,2): se redondea aquí para que un "150.999"
      // escrito a mano no llegue a la base de datos.
      precio: Math.round(precio * 100) / 100,
      duracion_minutos: duracion,
    })
    .eq("id", servicioId)
    .select("id");

  if (error) {
    volverConError("desconocido", servicioId);
  }

  // Cero filas afectadas = ese servicio ya no existe.
  if (!data?.length) {
    volverConError("noexiste");
  }

  terminar(servicioId);
}

async function cambiarActivo(formData: FormData, activo: boolean) {
  await verifySession();

  const servicioId = Number(formData.get("servicio"));

  if (!servicioId) {
    volverConError("noexiste");
  }

  // ⚠️ Desactivar NO toca las citas ya agendadas, a propósito. Cada cita
  // guarda `fin` y `precio_cobrado` como foto del momento y el servicio sigue
  // existiendo (solo cambia `activo`), así que la agenda las muestra igual.
  // Lo único que cambia es que deja de ofrecerse en /agendar, porque tanto el
  // formulario público como agendarCita filtran por activo = true.
  //
  // Cancelar en cascada obligaría al dueño a romper citas reales de clientes
  // solo para quitar un servicio del menú. Borrar tampoco es opción: el FK
  // `on delete restrict` de citas lo impide para servicios con historial.
  const { data, error } = await supabaseAdmin
    .from("servicios")
    .update({ activo })
    .eq("id", servicioId)
    .select("id");

  if (error) {
    volverConError("desconocido", servicioId);
  }

  if (!data?.length) {
    volverConError("noexiste");
  }

  terminar(servicioId);
}

export async function activarServicio(formData: FormData) {
  await cambiarActivo(formData, true);
}

export async function desactivarServicio(formData: FormData) {
  await cambiarActivo(formData, false);
}

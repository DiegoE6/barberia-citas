"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";

/**
 * Login y logout del dueño.
 *
 * Igual que el Server Action de citas, éste es un endpoint público: cualquiera
 * puede mandarle un POST. Por eso no basta con que las credenciales sean
 * válidas — también se comprueba que el usuario sea el dueño.
 */

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/admin/login?error=datos");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Un solo mensaje para credenciales malas, sin decir si falló el correo o
  // la contraseña: revelarlo ayudaría a adivinar qué cuentas existen.
  if (error || !data.user) {
    redirect("/admin/login?error=credenciales");
  }

  // Las credenciales son válidas, pero eso no significa que sea el dueño:
  // podría ser alguien que se registró por su cuenta. Se cierra la sesión
  // recién abierta para no dejarle una cookie válida dando vueltas.
  if (data.user.id !== process.env.ADMIN_USER_ID) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=no-autorizado");
  }

  redirect("/admin");
}

export async function cerrarSesion() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

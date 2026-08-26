import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";

/**
 * La verificación real de acceso al panel.
 *
 * TODA página y TODO Server Action de /admin debe llamar a esta función. El
 * chequeo de proxy.ts es solo optimista —mira que exista la cookie— y los
 * propios docs de Next avisan que no debe ser la única línea de defensa.
 *
 * ── Por qué no basta con "hay un usuario logueado" ──────────────────────
 * El endpoint de registro de Supabase es público y funciona con la anon key,
 * que va en el bundle del navegador. Si solo preguntáramos si hay sesión,
 * cualquiera podría registrarse solo y entrar al panel. Por eso se compara
 * contra el UUID del dueño.
 *
 * Es la segunda de dos medidas: la otra es desactivar el registro en
 * Supabase (Authentication > Providers > Email > Enable sign ups).
 */
export const verifySession = cache(async () => {
  const supabase = await createSupabaseServerClient();

  // getUser() valida el token contra el servidor de Auth.
  // NO se usa getSession(): la propia librería advierte que su resultado sale
  // de la cookie sin verificar y no debe confiarse para autorizar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminUserId = process.env.ADMIN_USER_ID;

  if (!adminUserId) {
    // Sin la variable no se puede distinguir al dueño de cualquier otro
    // usuario. Fallar cerrado es la única opción segura.
    throw new Error(
      "Falta ADMIN_USER_ID. Sin ella no se puede verificar quién es el dueño. " +
        "Revisa .env.local y las Environment Variables en Vercel."
    );
  }

  if (user.id !== adminUserId) {
    redirect("/admin/login?error=no-autorizado");
  }

  return { userId: user.id, email: user.email };
});

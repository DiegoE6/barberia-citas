import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente de Supabase que lee la sesión del dueño desde las cookies.
 *
 * ── Por qué no sirven los otros dos clientes ────────────────────────────
 *   supabase.ts       -> anon key sin sesión. Es el de los datos públicos.
 *   supabase-admin.ts -> service_role. Ignora RLS, pero no sabe quién eres.
 *   éste              -> anon key + la sesión del usuario logueado.
 *
 * Por defecto supabase-js guarda la sesión en el localStorage del navegador,
 * que el servidor no puede ver. Como nuestras páginas se renderizan en el
 * servidor, la sesión tiene que viajar en cookies. Eso es lo que resuelve
 * `createServerClient` de @supabase/ssr.
 *
 * Se crea uno nuevo por cada petición, nunca se comparte entre peticiones.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies(); // en Next 16 cookies() es asíncrono

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Un Server Component no puede escribir cookies: solo pueden los
            // Server Actions y el proxy. Aquí se ignora a propósito, porque
            // proxy.ts es el que renueva la sesión y escribe las cookies.
          }
        },
      },
    }
  );
}

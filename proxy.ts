import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Primera capa de protección de /admin.
 *
 * ⚠️ En Next 16 este archivo se llama `proxy.ts`. El antiguo `middleware.ts`
 * está deprecado y renombrado; casi todos los tutoriales de Supabase todavía
 * dicen "middleware".
 *
 * Hace dos cosas:
 *   1. Renueva la sesión y escribe las cookies actualizadas en la respuesta.
 *      Es obligatorio: los Server Components no pueden escribir cookies, así
 *      que si esto no ocurre aquí, el dueño se desloguea solo.
 *   2. Rebota a /admin/login si no hay sesión, para no renderizar el panel y
 *      luego redirigir.
 *
 * Es un chequeo OPTIMISTA. No comprueba que el usuario sea el dueño: de eso
 * se encarga verifySession() en app/lib/auth.ts, que es la protección real.
 * Los docs de Next: "no debería ser tu única línea de defensa".
 */

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esLogin = request.nextUrl.pathname === "/admin/login";

  // Sin sesión y fuera del login: al login. La condición de esLogin evita
  // un bucle infinito de redirecciones.
  if (!user && !esLogin) {
    return NextResponse.redirect(new URL("/admin/login", request.nextUrl));
  }

  // Ya logueado y entrando al login: directo al panel.
  if (user && esLogin) {
    return NextResponse.redirect(new URL("/admin", request.nextUrl));
  }

  return response;
}

export const config = {
  // Solo corre en /admin. La landing y el flujo de reserva no lo necesitan,
  // y así no se paga una llamada a Auth en cada visita pública.
  matcher: ["/admin/:path*"],
};

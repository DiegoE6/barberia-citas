import { createClient } from "@supabase/supabase-js";

/**
 * ⚠️  CLIENTE ADMINISTRADOR — SOLO SERVIDOR  ⚠️
 *
 * NUNCA importar este archivo desde un componente de cliente
 * (uno que empiece con "use client").
 *
 * ── Qué es la service_role key ──────────────────────────────────────────
 * Es la llave maestra del proyecto de Supabase: IGNORA POR COMPLETO las
 * políticas de RLS. Con ella se puede leer, modificar y borrar cualquier
 * fila de cualquier tabla, incluidos el nombre y el teléfono de todos los
 * clientes. No es "la anon key pero con más permisos": es acceso total.
 *
 * La anon key (app/lib/supabase.ts) es pública por diseño y viaja en el
 * bundle del navegador. Ésta es exactamente lo contrario.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────
 * La tabla `citas` no tiene ninguna política de RLS: está cerrada para
 * `anon`. Los datos de clientes no deben poder leerse desde el navegador,
 * y las citas deben crearse solo pasando por las validaciones del Server
 * Action (que calcula `fin` y `precio_cobrado` a partir del servicio, en
 * vez de confiar en lo que mande el cliente). Ver docs/DECISIONES.md.
 *
 * ── Qué nos protege ─────────────────────────────────────────────────────
 * La variable NO lleva el prefijo NEXT_PUBLIC_. Next.js solo mete en el
 * bundle del navegador las variables con ese prefijo, así que esta llave
 * simplemente no existe del lado del cliente. Si por error se importara
 * este archivo en un componente de cliente, el resultado sería un cliente
 * roto con la llave en `undefined`, no una llave filtrada.
 *
 * Aun así, el guard de abajo hace que ese error sea ruidoso e inmediato,
 * en vez de un 401 confuso más adelante.
 *
 * ── Dónde SÍ se puede usar ──────────────────────────────────────────────
 * Server Components (los `async` como Services.tsx), Server Actions
 * ("use server") y Route Handlers. Todo eso corre solo en el servidor.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "supabase-admin.ts se importó desde el navegador. Este módulo es solo de " +
      "servidor: úsalo en un Server Component, un Server Action o un Route Handler."
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// A diferencia del cliente público, aquí no se usa `!` para silenciar a
// TypeScript: si falta la variable (típicamente por no haberla cargado en
// Vercel), conviene un error claro al arrancar y no un fallo raro al insertar.
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. " +
      "Revisa .env.local en local, y las Environment Variables del proyecto en Vercel."
  );
}

// .env.local se crea con un placeholder. Sin esto, la llave falsa pasaría el
// chequeo de arriba y el error saldría hasta el primer insert, como un 401
// difícil de rastrear.
if (supabaseServiceRoleKey === "pegar_aqui_la_service_role_key") {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY sigue con el valor de ejemplo. Cópiala de " +
      "Supabase > Project Settings > API > service_role (secret) y pégala en .env.local."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    // Este cliente no representa a un usuario: no debe guardar ni refrescar
    // sesiones. Corre en el servidor, donde no hay dónde persistirlas.
    persistSession: false,
    autoRefreshToken: false,
  },
});
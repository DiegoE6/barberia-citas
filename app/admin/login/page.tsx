import { iniciarSesion } from "@/app/actions/auth";

// Solo hay login: NO hay página de registro, a propósito. La cuenta del dueño
// se crea a mano en Supabase (Authentication > Users > Add user).

const MENSAJES_ERROR: Record<string, string> = {
  credenciales: "Correo o contraseña incorrectos.",
  datos: "Escribe tu correo y tu contraseña.",
  "no-autorizado": "Esa cuenta no tiene acceso al panel.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const mensajeError = params.error ? MENSAJES_ERROR[params.error] : null;

  return (
    <section className="flex flex-1 items-center bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          Panel de administración
        </h1>

        {mensajeError && (
          <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-center text-amber-900">
            {mensajeError}
          </p>
        )}

        <form action={iniciarSesion} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Correo</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              className="rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-md bg-amber-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-amber-800"
          >
            Entrar
          </button>
        </form>
      </div>
    </section>
  );
}

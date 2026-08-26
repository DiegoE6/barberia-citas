import { verifySession } from "@/app/lib/auth";
import { cerrarSesion } from "@/app/actions/auth";

// Paso 1 de la Fase 4: solo la puerta. Todavía no hay nada detrás.
//
// La primera línea de toda página del panel es verifySession(). El chequeo
// del proxy es optimista y no comprueba que el usuario sea el dueño.

export default async function AdminPage() {
  const { email } = await verifySession();

  return (
    <section className="flex flex-1 flex-col bg-white px-6 py-20 text-zinc-900">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Panel de administración
        </h1>

        <p className="mt-4 text-zinc-600">
          Sesión iniciada como <span className="font-medium">{email}</span>.
        </p>

        <p className="mt-8 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-zinc-500">
          Aquí va a ir la agenda del día y de la semana.
        </p>

        <form action={cerrarSesion} className="mt-8">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-5 py-3 text-sm font-medium transition-colors hover:bg-zinc-50"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </section>
  );
}

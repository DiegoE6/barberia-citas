import Link from "next/link";
import { verifySession } from "@/app/lib/auth";
import { getSemana, MAX_BLOQUES, type DiaHorario } from "@/app/lib/horarios";
import { guardarDia } from "@/app/actions/horarios";

// Editor del horario de la semana. Lo que se guarda aquí sale de inmediato en
// la landing y manda sobre los horarios que se ofrecen en /agendar.
//
// La tabla guarda una fila por tramo, pero esta pantalla no lo enseña: se edita
// "el sábado", no "las dos filas del sábado". Toda la traducción está en
// app/lib/horarios.ts y app/actions/horarios.ts.

const MENSAJES_ERROR: Record<string, string> = {
  incompleto:
    "Un horario quedó a medias: hay que poner la hora de abrir y la de cerrar, o dejar las dos vacías.",
  rango: "La hora de cerrar tiene que ser después de la de abrir.",
  solapan:
    "Dos horarios de ese día se encima uno con otro. Revisa que el segundo empiece después de que termine el primero.",
  vacio:
    "Si el día está abierto necesita al menos un horario. Si no abres ese día, ponlo en Cerrado.",
  formato: "Alguna hora no se entendió. Vuelve a escribirla.",
  dia: "Ese día no existe. Vuelve a cargar la página.",
  // Solo aparece si se desplegó el código sin haber corrido el SQL. El dato
  // que importa aquí es que el horario NO se tocó.
  faltasql:
    "No se guardó nada y el horario quedó como estaba. Falta instalar en Supabase la función guardar_dia (docs/sql/10-guardar-dia.sql).",
  // Se puede prometer que el horario quedó intacto porque el guardado es
  // atómico: o entra el día completo, o no entra nada.
  desconocido:
    "No pudimos guardar el cambio y el horario quedó como estaba. Intenta de nuevo.",
};

const CAMPO = "rounded-md border border-zinc-400 px-3 py-2 text-zinc-900";

// Etiqueta de cada tramo. La primera no dice "opcional" porque no lo es; las
// otras dos lo dicen en la propia etiqueta, no solo en la letra chica de
// abajo.
const ETIQUETAS: Record<number, string> = {
  1: "Horario",
  2: "Segundo horario · opcional",
  3: "Tercer horario · opcional",
};

// La lista se genera a partir de MAX_BLOQUES —la misma constante que usa el
// Server Action para leer el formulario— y no escrita a mano. Si las dos
// contaran distinto, el tramo sobrante se pintaría pero no se guardaría, y
// fallaría en silencio.
const TRAMOS = Array.from({ length: MAX_BLOQUES }, (_, i) => ({
  n: i + 1,
  etiqueta: ETIQUETAS[i + 1] ?? `Horario ${i + 1} · opcional`,
}));

function Tramo({
  n,
  etiqueta,
  dia,
  bloque,
}: {
  n: number;
  etiqueta: string;
  dia: DiaHorario;
  bloque: { inicio: string; fin: string } | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        className={`w-full sm:w-52 ${
          n === 1 ? "font-medium text-zinc-700" : "text-zinc-600"
        } text-sm`}
      >
        {etiqueta}
      </span>

      {/* Un <label> no puede envolver dos campos, así que cada hora lleva su
          propio aria-label. Sin eso, un lector de pantalla anunciaría siete
          pares de campos llamados todos igual. */}
      <input
        type="time"
        name={`inicio${n}`}
        defaultValue={bloque?.inicio ?? ""}
        aria-label={`${dia.nombre}, ${n === 1 ? "hora de abrir" : `hora de abrir del horario ${n}`}`}
        className={CAMPO}
      />
      <span className="text-sm text-zinc-600">a</span>
      <input
        type="time"
        name={`fin${n}`}
        defaultValue={bloque?.fin ?? ""}
        aria-label={`${dia.nombre}, ${n === 1 ? "hora de cerrar" : `hora de cerrar del horario ${n}`}`}
        className={CAMPO}
      />
    </div>
  );
}

function Dia({ dia, guardado }: { dia: DiaHorario; guardado: boolean }) {
  return (
    <li className="py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">{dia.nombre}</h2>

        {!dia.abierto && (
          <span className="rounded-full border border-zinc-400 px-2 py-0.5 text-xs text-zinc-600">
            cerrado
          </span>
        )}

        {guardado && (
          <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
            guardado
          </span>
        )}
      </div>

      <form action={guardarDia} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="dia" value={dia.numero} />

        <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-full text-sm font-medium text-zinc-700 sm:w-52">
            ¿Abres este día?
          </span>
          <select
            name="abierto"
            defaultValue={dia.abierto ? "si" : "no"}
            className={CAMPO}
          >
            <option value="si">Sí, abro</option>
            <option value="no">No, cerrado</option>
          </select>
        </label>

        {TRAMOS.map((tramo) => (
          <Tramo
            key={tramo.n}
            n={tramo.n}
            etiqueta={tramo.etiqueta}
            dia={dia}
            bloque={dia.bloques[tramo.n - 1]}
          />
        ))}

        <p className="text-sm text-zinc-600">
          Deja el segundo y el tercero vacíos si ese día no cierras a media
          jornada.
        </p>

        <div className="mt-1">
          {/* El nombre del día va DENTRO del botón, igual que en cancelar una
              cita: no se puede guardar el día equivocado sin leer cuál es.
              Todos los días de la semana son masculinos en español, así que
              "el" sirve para los siete. */}
          <button
            type="submit"
            className="rounded-md bg-amber-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-amber-800"
          >
            Guardar el {dia.nombre.toLowerCase()}
          </button>
        </div>
      </form>
    </li>
  );
}

export default async function HorariosPage({
  searchParams,
}: {
  // En Next 16 searchParams es una Promise: hay que await-earla.
  searchParams: Promise<{ error?: string; dia?: string; ok?: string }>;
}) {
  await verifySession();

  const params = await searchParams;
  const { estado, dias } = await getSemana();

  const mensajeError = params.error ? MENSAJES_ERROR[params.error] : null;
  const diaDelError = dias.find((d) => String(d.numero) === params.dia);

  // Se compara como texto y no con Number(): el domingo es el 0, y `Number("0")
  // || null` daría null porque 0 es falsy. Un bug que solo aparecería en
  // domingo.
  const diaGuardado = params.ok;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-zinc-900"
      >
        ← Volver a la agenda
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900">
        Horarios
      </h1>

      {/* La explicación de para qué sirve el segundo horario va aquí arriba,
          en el lenguaje en que el dueño piensa el problema: él no configura
          "bloques", él cierra a comer. */}
      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>
          Casi todos los días se llenan con el primer horario: abres a las
          10:00, cierras a las 20:00 y listo.
        </p>
        <p className="mt-2">
          El segundo horario es para cuando cierras a media jornada. Por
          ejemplo un sábado: abres de 9:00 a 14:00, cierras a comer, y vuelves
          de 16:00 a 20:00. Eso son dos horarios el mismo día. Si no cierras a
          media jornada, deja el segundo y el tercero vacíos.
        </p>
        <p className="mt-2">
          Poner un día en <strong>Cerrado</strong> no borra sus horas: quedan
          guardadas para cuando quieras volver a abrirlo.
        </p>
      </div>

      <p className="mt-3 text-sm text-zinc-600">
        Este es el horario que se repite cada semana. Las citas que ya estaban
        agendadas no se cancelan si cambias el horario: si alguna queda fuera,
        la agenda del día la muestra aparte, en “Fuera del horario”.
      </p>

      {mensajeError && (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          {diaDelError && <strong>{diaDelError.nombre}: </strong>}
          {mensajeError}
        </p>
      )}

      {estado === "error" ? (
        <p className="mt-8 text-zinc-600">
          No pudimos cargar los horarios. Intenta de nuevo.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-zinc-200">
          {dias.map((dia) => (
            <Dia
              key={dia.numero}
              dia={dia}
              guardado={String(dia.numero) === diaGuardado}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

import { supabase } from "@/app/lib/supabase";
import { DIAS, aHoraCorta } from "@/app/lib/horarios";

// El orden de los días, sus nombres y el recorte de la hora viven en
// app/lib/horarios.ts: el editor del panel necesita exactamente los mismos, y
// dos copias que se separen dejarían la landing y el panel discrepando.

// Un bloque continuo de atención, tal como viene de la tabla horarios_semana.
// Un día normal tiene uno; el sábado tiene dos (horario partido).
type ScheduleBlock = {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
};

// Arma el texto de un día: sus rangos activos unidos con " y ", o "Cerrado"
// si ese día no tiene ningún bloque activo.
function formatDayHours(dayBlocks: ScheduleBlock[]) {
  const openBlocks = dayBlocks.filter((block) => block.activo);

  if (openBlocks.length === 0) {
    return "Cerrado";
  }

  return openBlocks
    .map((block) => `${aHoraCorta(block.hora_inicio)} - ${aHoraCorta(block.hora_fin)}`)
    .join(" y ");
}

export default async function Schedule() {
  // A diferencia de Services, aquí NO se filtra por activo: los bloques
  // inactivos se necesitan para poder pintar "Cerrado". El orden de la
  // consulta deja los dos bloques del sábado ya acomodados entre sí; el
  // orden de los días lo define la constante DAYS.
  const { data: blocks, error } = await supabase
    .from("horarios_semana")
    .select("dia_semana, hora_inicio, hora_fin, activo")
    .order("dia_semana")
    .order("hora_inicio");

  // Se agrupan los bloques por día. Un Map es un arreglo asociativo:
  // la llave es el número de día y el valor son sus bloques.
  const blocksByDay = new Map<number, ScheduleBlock[]>();

  for (const block of blocks ?? []) {
    const dayBlocks = blocksByDay.get(block.dia_semana) ?? [];
    dayBlocks.push(block);
    blocksByDay.set(block.dia_semana, dayBlocks);
  }

  return (
    <section className="bg-zinc-50 px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Horarios
        </h2>
        {/* Si la consulta falla, se muestra el mensaje en lugar de la lista:
            pintar los 7 días como "Cerrado" le diría al cliente que la
            barbería no abre en toda la semana. */}
        {error || !blocks?.length ? (
          <p className="mt-10 text-center text-zinc-500">
            No pudimos cargar los horarios por el momento.
          </p>
        ) : (
          <ul className="mt-10 flex flex-col divide-y divide-zinc-200">
            {DIAS.map((day) => (
              <li
                key={day.numero}
                className="flex items-center justify-between py-3"
              >
                <span className="text-lg">{day.nombre}</span>
                <span className="text-lg text-zinc-600">
                  {formatDayHours(blocksByDay.get(day.numero) ?? [])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

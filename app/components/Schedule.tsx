import { supabase } from "@/app/lib/supabase";

// Un bloque continuo de atención, tal como viene de la tabla horarios_semana.
// Un día normal tiene uno; el sábado tiene dos (horario partido).
type ScheduleBlock = {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
};

// Los días en el orden en que se muestran: lunes primero, domingo al final.
// El número es la convención de la BD (0 = domingo ... 6 = sábado). Esta
// constante define el orden y los nombres, así que la lista siempre tiene
// los 7 renglones aunque a la tabla le falte alguna fila.
const DAYS = [
  { number: 1, label: "Lunes" },
  { number: 2, label: "Martes" },
  { number: 3, label: "Miércoles" },
  { number: 4, label: "Jueves" },
  { number: 5, label: "Viernes" },
  { number: 6, label: "Sábado" },
  { number: 0, label: "Domingo" },
];

// Postgres entrega un `time` como "10:00:00"; en pantalla basta "10:00".
function formatTime(time: string) {
  return time.slice(0, 5);
}

// Arma el texto de un día: sus rangos activos unidos con " y ", o "Cerrado"
// si ese día no tiene ningún bloque activo.
function formatDayHours(dayBlocks: ScheduleBlock[]) {
  const openBlocks = dayBlocks.filter((block) => block.activo);

  if (openBlocks.length === 0) {
    return "Cerrado";
  }

  return openBlocks
    .map((block) => `${formatTime(block.hora_inicio)} - ${formatTime(block.hora_fin)}`)
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
            {DAYS.map((day) => (
              <li
                key={day.number}
                className="flex items-center justify-between py-3"
              >
                <span className="text-lg">{day.label}</span>
                <span className="text-lg text-zinc-600">
                  {formatDayHours(blocksByDay.get(day.number) ?? [])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

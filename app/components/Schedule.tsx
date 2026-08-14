import { schedule } from "@/app/data";

export default function Schedule() {
  return (
    <section className="bg-zinc-50 px-6 py-20 text-zinc-900">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Horarios
        </h2>
        <ul className="mt-10 flex flex-col divide-y divide-zinc-200">
          {schedule.map((item) => (
            <li
              key={item.day}
              className="flex items-center justify-between py-3"
            >
              <span className="text-lg">{item.day}</span>
              <span className="text-lg text-zinc-600">{item.hours}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

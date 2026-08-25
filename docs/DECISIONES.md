# Decisiones de arquitectura

## Caché de la landing: revalidate = 300 (2026-08-14)

**Contexto**: `Services.tsx` lee la tabla `servicios` de Supabase. Como
Next.js prerrenderiza la página como estática, un cambio de precio en
Supabase no se reflejaba en producción hasta el siguiente deploy.

**Opciones consideradas**:
- `dynamic = 'force-dynamic'` — siempre fresco, pero consulta Supabase en
  cada visita y pierde el caché estático. Descartado: el dueño cambia
  precios pocas veces al mes, no vale la pena pagar ese costo en cada
  visita.
- Revalidación bajo demanda (`revalidatePath()`) — la más eficiente y
  la más fresca, pero requiere que algo avise a Next.js cuándo hubo un
  cambio. Hoy los precios se editan directo en el Table Editor de
  Supabase, fuera de la app, así que requeriría un Database Webhook
  adicional. Descartado por ahora.
- `revalidate = N` (ISR por tiempo) — elegida.

**Decisión**: `export const revalidate = 300` en `app/page.tsx` (se
regenera como máximo cada 5 minutos). Costo de consultas a Supabase
despreciable, y el retraso máximo (5 min) es aceptable para cambios de
precio poco frecuentes.

**Migración futura**: en la Fase 4, cuando exista un panel de admin, los
cambios de precio van a pasar por la propia app. En ese momento se puede
llamar `revalidatePath('/')` justo después de guardar, y frescura pasa a
ser inmediata sin necesidad de un webhook externo. Reemplazar el
`revalidate` por tiempo en ese momento.

## Horarios: una fila por bloque, no por día (2026-08-25)

**Contexto**: la tabla de horarios tiene que alimentar dos cosas muy
distintas: la lista de horarios de la landing (Fase 2) y el cálculo de
slots libres para agendar (Fase 3). Además, el horario partido —cerrar a
mediodía y reabrir por la tarde— es común en las barberías locales, así
que el modelo tiene que soportarlo desde el principio.

**Opciones consideradas**:
- **Una fila por día**, con `hora_apertura` y `hora_cierre`. Es lo más
  directo, pero para el horario partido obliga a agregar
  `hora_apertura_2` y `hora_cierre_2`: dos columnas nullable más, más
  `CHECK`s, y código en la Fase 3 que pregunta "¿hay segundo bloque?".
  Y no extiende a tres bloques. Descartada.
- **Una fila por bloque** (`dia_semana`, `hora_inicio`, `hora_fin`) —
  elegida.

**Decisión**: tabla `horarios_semana`, una fila por bloque continuo de
atención. Un día normal es una fila, uno partido son dos. Tiene *menos*
columnas que la alternativa, y sobre todo le quita trabajo a la Fase 3:
el generador de slots recorre los bloques del día y avanza de
`hora_inicio` a `hora_fin`; un día con uno y uno con dos bloques pasan
por el mismo código, sin casos especiales.

Detalles que se decidieron junto con esto:

- **`dia_semana smallint` con 0 = domingo**, en vez de texto o de un
  `enum`. Es la convención que ya devuelven `extract(dow from fecha)` en
  Postgres y `Date.getDay()` en JavaScript, así que la traducción
  *fecha → día → bloques* de la Fase 3 no necesita ningún mapeo. El
  costo es que ordenar por esa columna pone el domingo primero; se
  resuelve en la consulta con `order by (dia_semana + 6) % 7`.
- **Día cerrado = fila con `activo = false`**, no fila ausente. Así el
  panel de la Fase 4 cierra un día con un switch sin perder el horario
  configurado, y las columnas de hora se quedan `NOT NULL` sin `CHECK`
  condicional. Es la misma convención que ya usa `servicios.activo`.
  Hoy el día inactivo es el lunes; el domingo abre.
- **`time` y no `timetz`**: `timetz` guarda un offset fijo que se rompe
  con el horario de verano. La zona (`America/Monterrey`) se aplica al
  combinar fecha + hora en la Fase 3.
- **Sin índice extra**: la tabla tiene ~7 filas y el `unique
  (dia_semana, hora_inicio)` ya deja un índice utilizable para buscar
  por día.
- **Sin restricción de solapamiento entre bloques**. Se puede prohibir a
  nivel de BD con un `EXCLUDE`, pero requiere habilitar la extensión
  `btree_gist`. Con uno o dos bloques por día y un solo dueño editando,
  se validará en el formulario de la Fase 4.

**Trampa anotada para la Fase 3**: en JavaScript, `new Date("2026-08-30")`
se interpreta como medianoche **UTC**, y `.getDay()` en Monterrey (UTC−6)
devuelve el día anterior. El día de la semana hay que sacarlo de las
partes de la fecha, no de un `Date` construido desde el string ISO.

**Migración futura**: los cierres de una fecha concreta (festivos,
vacaciones) **no** van en esta tabla, que es solo el patrón que se repite
cada semana. Irán en una tabla `excepciones` (fecha + abierto/cerrado)
en la Fase 3. La política RLS de lectura es `to anon`, igual que la de
`servicios`; cuando la Fase 4 traiga Supabase Auth habrá que revisar
ambas para el rol `authenticated`.

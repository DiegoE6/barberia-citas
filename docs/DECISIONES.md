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

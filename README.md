# Barbería El Roble — Sitio web y sistema de citas

Sitio web para barberías y negocios locales que hoy agendan por WhatsApp
o libreta, y pierden citas por no tener dónde reservar.

**Demo:** https://barberia-citas-one.vercel.app/

![Landing](docs/img/landing.png)
![Servicios](docs/img/servicios.png)
![Seleccionar](docs/img/seleccionar.png)
![Datos](docs/img/datos.png)
![Confirmacion](docs/img/confirmacion.png)

## El problema

Un negocio local sin presencia web depende de que lo encuentren en la calle.
Sin agenda digital, el dueño atiende el teléfono mientras corta el cabello,
y las citas se anotan en papel.

## Solución

- Presencia web propia, rápida y adaptada a móvil
- Catálogo de servicios con precios visibles
- Reserva de citas en línea (en desarrollo)
- Panel para que el dueño administre su agenda (en desarrollo)

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase — Postgres + Auth (en desarrollo)
- Desplegado en Vercel

## Correr en local

```bash
git clone https://github.com/DiegoE6/barberia-citas.git
cd barberia-citas
npm install
npm run dev
```

Abrir http://localhost:3000

## Estado del proyecto

- [x] Fase 1 — Landing pública
- [x] Fase 2 — Base de datos
- [x] Fase 3 — Reserva de citas
- [ ] Fase 4 — Panel de administración

Ver [docs/PLAN.md](docs/PLAN.md) para el detalle.
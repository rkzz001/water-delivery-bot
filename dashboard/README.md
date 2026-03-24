# Soda Dashboard — Panel Administrativo de Pedidos

Dashboard web en tiempo real para gestión de pedidos de una fábrica de soda. Permite al personal de oficina visualizar los pedidos que llegan desde el bot de WhatsApp y cargar pedidos telefónicos manuales.

## Stack Técnico

- **Framework:** Next.js 15 (App Router)
- **Estilos:** Tailwind CSS
- **Base de datos:** Supabase (PostgreSQL)
- **Realtime:** `supabase.channel().on('postgres_changes', ...)` — escucha INSERT y UPDATE en la tabla `pedidos`
- **Notificaciones:** `sonner`
- **Iconos:** `lucide-react`

## Estructura del Proyecto

```
soda-dashboard/
├── app/
│   ├── layout.tsx          # Root layout — incluye <Toaster /> de sonner
│   ├── page.tsx            # Entry point — renderiza <Dashboard />
│   └── globals.css
├── components/
│   ├── Dashboard.tsx       # Componente principal (client) — orquesta estado y realtime
│   ├── KPICards.tsx        # 3 tarjetas: Pedidos Hoy, Pendientes, Recaudado
│   ├── OrderList.tsx       # Lista de pedidos — maneja la acción "Marcar Entregado"
│   ├── OrderCard.tsx       # Tarjeta individual de pedido
│   └── NewOrderModal.tsx   # Modal de carga manual de pedidos telefónicos
├── lib/
│   ├── supabase.ts         # Cliente de Supabase (browser)
│   └── types.ts            # Interfaces TypeScript + constantes de dominio
└── .env.local.example
```

## Configuración Inicial

### 1. Variables de entorno

Copiar `.env.local.example` a `.env.local` y completar con los valores de Supabase:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
```

Los valores se encuentran en **Supabase → Settings → API**.

### 2. Schema de base de datos

La tabla `pedidos` debe incluir la columna `origen`. Ejecutar en **Supabase → SQL Editor**:

```sql
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'bot';
```

Si la tabla no existe aún, ejecutar el `schema.sql` completo del proyecto `water-delivery-bot`.

### 3. Habilitar Realtime (imprescindible para actualizaciones en vivo)

Ejecutar una sola vez en **Supabase → SQL Editor**:

```sql
ALTER TABLE pedidos REPLICA IDENTITY FULL;
```

Y también: **Supabase → Database → Replication** → activar la tabla `pedidos`.

### 4. Instalar dependencias y levantar

```bash
npm install
npm run dev
```

El dashboard estará disponible en `http://localhost:3000`.

## Funcionalidades

### KPIs en tiempo real
- **Pedidos Hoy:** total de pedidos del día (todos los estados)
- **Pendientes:** pedidos en estado PENDING, ASSIGNED, NOT_ANSWERED o UNASSIGNED
- **Recaudado Hoy:** suma de `total` de pedidos con estado DELIVERED

### Lista de pedidos
- Pedidos del día ordenados del más reciente al más antiguo
- Cada tarjeta muestra: hora, origen (WhatsApp/Teléfono), estado, cliente, **producto** (en negrita), dirección, repartidor, método de pago, total y nota
- Borde lateral con código de color por estado:
  - 🟡 Amarillo — Pendiente
  - 🔵 Azul — En camino (ASSIGNED)
  - 🟢 Verde — Entregado
  - 🔴 Rojo — No atendió
  - 🟠 Naranja — Sin repartidor
- Botón **"✅ Marcar como ENTREGADO"** en cada pedido activo

### Carga manual (pedidos por teléfono)
Botón **"➕ NUEVO PEDIDO POR TELÉFONO"** abre un modal con:
- Teléfono del cliente (opcional)
- Cantidad + tamaño del bidón (con preview del pedido y total calculado)
- Dirección, Repartidor, Método de pago, Nota opcional

Inserta con `origen: 'telefono'` para distinguirlos de los pedidos del bot.

### Notificaciones toast
Cuando entra un pedido nuevo por Realtime, aparece una notificación visual con el producto y la dirección.

## Decisiones Técnicas

### Por qué todo client-side
El dashboard es una herramienta interna sin requisitos de SEO. Usar client-side simplifica la arquitectura: un solo cliente de Supabase, sin server actions, sin cookies de autenticación. Si se necesita proteger el acceso, se puede agregar Supabase Auth.

### Por qué `sonner`
Soporta `richColors` y el prop `description` nativo, lo que permite mostrar el producto y la dirección en dos líneas en la notificación sin componentes custom.

### Mapeo de estados del bot
El bot usa estados en inglés mayúscula (`PENDING`, `ASSIGNED`, etc.). El dashboard los mapea a etiquetas en español mediante `ESTADO_LABELS` en `lib/types.ts`, sin tocar los valores en la base de datos para mantener compatibilidad con el bot.

### Campo `origen`
Se agregó `origen TEXT DEFAULT 'bot'` a la tabla `pedidos` para distinguir pedidos del bot vs. carga manual. El bot setea `origen: 'bot'`; el dashboard setea `origen: 'telefono'`.

## Deploy (Vercel recomendado)

1. Conectar el repo a Vercel
2. Agregar las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Deploy automático en cada push a `main`

## Changelog

### v1.0.0 — Dashboard inicial (2026-03-24)
- KPI cards: Pedidos Hoy, Pendientes, Recaudado del día
- Lista de pedidos del día con actualización en tiempo real (Supabase Realtime)
- Tarjetas de pedido con código de color por estado y fuentes grandes (UX para usuarios no nativos digitales)
- Botón "✅ Marcar como ENTREGADO" con UPDATE a Supabase
- Modal de carga manual de pedidos telefónicos con cálculo automático del total
- Notificaciones toast al recibir pedidos nuevos por Realtime
- Campo `origen` en tabla `pedidos` para distinguir fuente del pedido (bot vs. teléfono)

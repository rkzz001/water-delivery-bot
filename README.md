# Water Delivery Bot 💧

Bot de WhatsApp para gestión de pedidos de una empresa de reparto de agua en bidones.
Los clientes hacen pedidos por WhatsApp y los repartidores los reciben y confirman con comandos numéricos.

## Requisitos

- Node.js 20 o superior
- npm

## Instalación

```bash
git clone https://github.com/rkzz001/water-delivery-bot.git
cd water-delivery-bot
npm install
```

## Uso

### Levantar el sistema
```bash
node src/index.js
```

### Simular conversaciones de prueba
```bash
npm run seed
```
Ejercita todos los flujos posibles e imprime en consola los mensajes entrantes y salientes.

### Modo watch (reinicia ante cambios)
```bash
npm run dev
```

## Flujo del cliente

```
Cliente escribe cualquier cosa
  → "¿Qué querés pedir?"
  → Cliente escribe el pedido (ej: "2 bidones de 20 litros")
  → "¿Cuál es tu dirección?"
  → Cliente escribe la dirección
    → Si ya tiene repartidor asignado: pedido registrado automáticamente
    → Si no: "¿Quién es tu repartidor? 1 Silvio / 2 Alejandro / 3 Damian / 4 No sé"
```

## Flujo del repartidor

Cuando llega un pedido, el repartidor recibe:
```
Nuevo pedido #5
Cliente: 5491100000001
Dirección: Av. Corrientes 1234
Pedido: 2 bidones de 20 litros
Respondé:
1 Entregado
2 No atendió
3 Reprogramar
```

Responde con `1`, `2` o `3`. Si tiene más de un pedido activo, el bot le pregunta a cuál se refiere.

## Repartidores

| ID | Nombre    |
|----|-----------|
| 1  | Silvio    |
| 2  | Alejandro |
| 3  | Damian    |

Para agregar un repartidor, editar `src/config.js` (secciones `DRIVERS` y `DRIVER_PHONES`).

## Estados de un pedido

| Estado        | Descripción                              |
|---------------|------------------------------------------|
| `PENDING`     | Creado, esperando acción del repartidor  |
| `ASSIGNED`    | Asignado a un repartidor                 |
| `DELIVERED`   | Entregado                                |
| `NOT_ANSWERED`| Cliente no atendió                       |
| `UNASSIGNED`  | Sin repartidor (cliente eligió "No sé")  |

## Recordatorio automático

Todos los días a las 09:00 cada repartidor recibe un resumen de sus pedidos en estado `PENDING` o `NOT_ANSWERED`.

## Estructura del proyecto

```
water-delivery-bot/
├── db/
│   └── schema.sql              # Esquema de la base de datos
├── src/
│   ├── index.js                # Entry point y coordinador
│   ├── config.js               # Repartidores, estados y mensajes
│   ├── database/
│   │   ├── connection.js       # Conexión SQLite (singleton)
│   │   └── queries.js          # Todas las queries SQL
│   ├── bot/
│   │   ├── messageHandler.js   # FSM pura del bot
│   │   └── sessionManager.js   # Estado de conversación por teléfono
│   ├── orders/
│   │   ├── orderService.js     # Lógica de negocio de pedidos
│   │   └── orderModel.js       # Validaciones
│   ├── scheduler/
│   │   └── reminderJob.js      # Cron job de recordatorios
│   └── whatsapp/
│       └── simulator.js        # Mock de WhatsApp (dev/test)
└── scripts/
    └── seed.js                 # Datos y conversaciones de prueba
```

## Variables de entorno

Copiar `.env.example` a `.env`:

```bash
cp .env.example .env
```

| Variable | Descripción                          | Default                        |
|----------|--------------------------------------|--------------------------------|
| `TZ`     | Zona horaria para el cron de las 9am | `America/Argentina/Buenos_Aires` |

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

### Load test (1000 conversaciones simuladas)
```bash
npm run loadtest
```
Simula 1000 conversaciones de clientes contra la FSM + DB sin conectar a WhatsApp. Al terminar genera un archivo de log en `logs/loadtest-FECHA.txt` con el intercambio completo de cada conversación. Útil para detectar bugs de lógica y estados colgados antes de hacer deploy.

```bash
node scripts/loadtest.js --clients 500   # cantidad personalizada
node scripts/loadtest.js --no-log        # sin archivo de log
```

### Modo watch (reinicia ante cambios)
```bash
npm run dev
```

### Problema: el bot manda mensajes duplicados al reiniciar

Al reconectarse, whatsapp-web.js puede volver a emitir mensajes que llegaron mientras el bot estaba caído. El bot los ignora comparando el `timestamp` del mensaje contra el momento en que arrancó. No requiere ninguna acción manual.

### Problema: "database is locked"
Si el bot cierra de forma abrupta puede quedar un archivo `.lock`. Eliminarlo sin matar otros procesos:
```bash
del db\orders.db.lock
```

## Flujo del cliente

El bot entiende lenguaje natural. El cliente puede escribir de distintas formas:

```
Cliente: "Hola"
  → "¡Hola! ¿Qué querés pedir hoy?"
  → Cliente escribe el pedido

Cliente: "Hola, quiero 2 bidones"
  → Bot detecta el pedido y pregunta dirección directamente

Cliente: "2 bidones a Andrade 252"
  → Bot detecta pedido + dirección en un solo mensaje
```

### Flujo completo (cliente nuevo)

```
1. Cliente escribe cualquier cosa
2. Bot pregunta qué quiere pedir
3. Cliente escribe el pedido (ej: "2 bidones de 20 litros")
4. Bot pregunta cuántos bidones si no se especificó cantidad
5. Bot pregunta el tamaño si no se especificó (12L o 20L)
6. Bot pregunta la dirección
7. Bot pregunta el repartidor (solo la primera vez):
     1 Silvio / 2 Alejandro / 3 Damian / 4 No sé
8. Bot muestra el total y pregunta método de pago:
     Total a abonar: $8.000
     1 Efectivo / 2 Transferencia
9. Si elige transferencia: bot pide el comprobante (imagen)
10. Bot pregunta aclaración opcional para el repartidor (ej: horario)
     - Si el cliente cambia el tamaño acá ("mejor de 12L"), el bot actualiza el pedido y muestra
       el nuevo resumen con precio recalculado sin reiniciar el flujo
     - Responder "no", "ok", "nop", "paso", "sin notas" omite la nota del resumen
11. Bot muestra resumen completo y pide confirmación:
     📦 2 bidones de 20 litros
     📍 Corrientes 1234
     🛵 Silvio
     💳 Efectivo — $8.000
     ¿Confirmás?  1 Sí, confirmar / 2 Cancelar
     Acepta: "sí", "dale", "va", "listo", "metele", "mandalo", "ya está", "arranca", "vamos", etc.
     Si el cliente cambia cantidad ("mejor 3") o cantidad+tamaño ("mejor 3 de 12"), el resumen
     se actualiza con precio recalculado y se vuelve a pedir confirmación
12. Pedido registrado → repartidor recibe la notificación
     Mensaje al cliente: "¡Perfecto! Tu pedido ya está en manos de [Repartidor]. Gracias por elegirnos."
```

El cliente puede escribir **cancelar** en cualquier momento del flujo para abortar el pedido.

### Cliente conocido

A partir del segundo pedido, el bot recuerda el repartidor del cliente y saltea el paso 6. Si el cliente manda pedido + dirección en un mensaje, el bot va directo al paso 7.

### Detección de lenguaje natural

El bot reconoce saludos y frases conversacionales y las elimina antes de procesar el pedido:
- `"Hola, te puedo pedir 2 bidones"` → pedido: `"2 bidones"`
- `"Che, me mandás 3 bidones de 20 litros a San Martín 500"` → pedido + dirección detectados
- `"Por favor, 2 bidones de 20"` → pedido: `"2 bidones de 20"`
- `"buenas tardes, por favor 1 bidón de 20 a Corrientes 1234"` → pedido + dirección detectados

Los números escritos se convierten automáticamente a dígitos:
- `"dos bidones de veinte litros"` → `"2 bidones de 20 litros"`

Los saludos compuestos también se eliminan correctamente:
- `"buenas tardes, me mandás 1 bidón de 12"` → pedido: `"1 bidón de 12"`
- `"buenas noches quiero 2 bidones"` → pedido: `"2 bidones"`

Prefijos eliminados (en cualquier combinación y orden): saludos (`hola`, `buenas`, `buenos días`…), muletillas (`che`, `mirá`), frases de pedido (`quiero`, `quisiera`, `me mandás`, `me podés mandar`…), cortesía (`por favor`).

## Flujo del repartidor

Cuando llega un pedido, el repartidor recibe:
```
🛵 Nuevo pedido #5
Cliente: 5491100000001
Dirección: Av. Corrientes 1234
Pedido: 2 bidones de 20 litros
Pago: Efectivo

Respondé:
1 Entregado
2 No atendió
3 Reprogramar
```

Responde con `1`, `2` o `3`.

### Responder citando el mensaje

El repartidor puede mantener presionado el mensaje de notificación y responder citándolo. El bot detecta a qué pedido corresponde automáticamente sin necesidad de aclarar.

### Múltiples pedidos activos

Si el repartidor tiene más de un pedido activo y responde sin citar, el bot pregunta a cuál se refiere:

```
¿Tenés varios pedidos activos. ¿A cuál te referís? #3, #5
```

El repartidor responde con el número de pedido (`3` o `#3`).

### Flujo "No atendió"

Cuando el repartidor marca opción `2`:
1. El repartidor recibe confirmación del cambio de estado
2. El cliente recibe: `"El repartidor pasó por tu casa pero nadie lo atendió. ¿Querés que reprogramemos la entrega?"`
3. Si el cliente responde **Sí** (o cualquier frase que empiece con "si/sí"): el pedido se reenvía al repartidor
4. Si el cliente responde **No** (o cualquier frase que empiece con "no"): no se realiza ninguna acción

## Horario de atención

El bot acepta pedidos hasta las **14:00**. Pasada esa hora responde con un mensaje de cierre y no abre ningún flujo de conversación.

Para cambiar el horario de corte, modificar el valor `14` en `src/index.js` (línea del chequeo `hour >= 14`).

## Precios

| Tamaño    | Precio   |
|-----------|----------|
| 20 litros | $4.000   |
| 12 litros | $3.500   |

El total se calcula automáticamente según la cantidad y el tamaño indicados en el pedido y se muestra antes de la pregunta de pago. Si no se especifica tamaño, se asume 20 litros.

> **Decisión técnica:** `hasQuantity()` verifica que el texto *empiece* con un número (`/^\d+/`), no solo que contenga alguno. Esto evita que "bidones de **20** litros" sea interpretado erróneamente como "20 bidones". De forma análoga, `calculateTotal()` detecta el tamaño primero y luego busca el primer número que no sea el tamaño para usarlo como cantidad.

## Métodos de pago

- **Efectivo**: el pedido avanza al paso de notas.
- **Transferencia**: el bot solicita el comprobante (imagen). Solo acepta imágenes, no texto.

Ambas opciones aceptan número (`1`/`2`) o texto natural:
- Efectivo: `efectivo`, `efect`, `cash`, `en mano`, `en efectivo`
- Transferencia: `transferencia`, `transfe`, `transf`, `transfer`, `transfiero`

El método de pago queda registrado en la DB y se incluye en la notificación al repartidor (`Pago: Efectivo` o `Pago: Transferencia ✓`).

## Repartidores

| ID | Nombre    |
|----|-----------|
| 1  | Silvio    |
| 2  | Alejandro |
| 3  | Damian    |

Para agregar un repartidor, editar `src/config.js` (secciones `DRIVERS`, `DRIVER_PHONES` y `DRIVER_NAME_MAP` en `messageHandler.js`).

Al elegir repartidor, el bot acepta número (`1`/`2`/`3`/`4`) o nombre (`Silvio`, `Alejandro`, `Ale`, `Damian`).

## Estados de un pedido

| Estado         | Descripción                              |
|----------------|------------------------------------------|
| `PENDING`      | Creado, esperando acción del repartidor  |
| `ASSIGNED`     | Asignado a un repartidor                 |
| `DELIVERED`    | Entregado                                |
| `NOT_ANSWERED` | Cliente no atendió                       |
| `UNASSIGNED`   | Sin repartidor (cliente eligió "No sé")  |

## Recordatorio automático

Todos los días a las 09:00 cada repartidor recibe un resumen de sus pedidos en estado `PENDING` o `NOT_ANSWERED`.

## Estructura del proyecto

```
water-delivery-bot/
├── db/
│   └── schema.sql              # Esquema de la base de datos
├── src/
│   ├── index.js                # Entry point y coordinador
│   ├── config.js               # Repartidores, precios, estados y mensajes
│   ├── database/
│   │   ├── connection.js       # Conexión SQLite (singleton + migraciones)
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
│       ├── client.js           # Cliente real WhatsApp (whatsapp-web.js)
│       └── simulator.js        # Mock de WhatsApp (dev/test)
└── scripts/
    ├── seed.js                 # Datos y conversaciones de prueba
    └── loadtest.js             # Load test: simula N conversaciones (FSM + DB, sin WhatsApp)
```

## Variables de entorno

Copiar `.env.example` a `.env`:

```bash
cp .env.example .env
```

| Variable                    | Descripción                                        | Default                          |
|-----------------------------|----------------------------------------------------|----------------------------------|
| `TZ`                        | Zona horaria para el cron de las 9am               | `America/Argentina/Buenos_Aires` |
| `PORT`                      | Puerto HTTP para health check                      | `3000`                           |
| `DRIVER_1_PHONE`            | Teléfono de Silvio (solo dígitos, sin +, con el 9) | —                                |
| `DRIVER_2_PHONE`            | Teléfono de Alejandro                              | —                                |
| `DRIVER_3_PHONE`            | Teléfono de Damian                                 | —                                |
| `PUPPETEER_EXECUTABLE_PATH` | Ruta al Chrome del sistema (Railway/Render)        | —                                |

> **Formato de teléfonos Argentina:** `549` + código de área + número. Ej: `5492396432617`

## Changelog

### v1.12 — 1000 conversaciones, doble saludo y test de caracteres especiales

**Default del loadtest: 1000 conversaciones (antes 300).**

**`runFixedConversation(phone, fixedMessages, scenarioName)` — nueva función:**
Ejecuta una secuencia predeterminada de mensajes y luego continúa con `AUTO_RESPONSE` para los pasos restantes. Permite testear flujos exactos sin depender del azar:
```
['Hola', 'Hola', '2 bidones de 20']  →  verifica que el segundo saludo no reinicie el pedido
['2 bidones de 20', "O'Higgins 500"] →  verifica codificación de apóstrofo en DB y ticket
```

**Fase 4 — Doble saludo:**
4 secuencias fijas que envían un saludo accidental (o frase social) en mitad del flujo `WAITING_ORDER`. Comportamiento esperado: el bot re-pregunta `ASK_ORDER` y mantiene el paso, sin reiniciar ni romper. Casos cubiertos:
- `"Hola"` → `"Hola"` → `"2 bidones de 20"` (saludo repetido)
- `"Hola"` → `"dale"` → `"3 bidones de 12"` (frase social)
- `"Buenas"` → `"Hola, ¿hay alguien?"` → `"1 bidón de 20"` (saludo distinto)
- `"Hola"` → `"¿Hasta qué hora reparten?"` → `"2 bidones de 20"` (FAQ interrumpe WAITING_ORDER)

**Fase 4 — Caracteres especiales (codificación DB):**
6 secuencias fijas con caracteres problemáticos en la dirección. Verifica que SQLite los almacene y el ticket los muestre sin corrupción:
- Apóstrofo: `"O'Higgins 500"`
- Comillas simples: `"Calle 'Falsa' 123"`
- Diéresis: `"Güemes 1234"`
- Emoji: `"San Martín 500 ✨"`
- Símbolo de grado: `"Peña 800, 2° piso"`
- Comillas dobles + apóstrofo: `O'Brien 123, "el rojo"`

**`WAITING_ADDRESS` pool ampliado:**
Incluye las mismas direcciones especiales para que se ejerciten también en las 1000 conversaciones aleatorias.

**Nuevos escenarios SCENARIOS:**
`char-comilla-simple`, `char-tilde-u`, `char-emoji`, `char-segundo-piso` — todo-junto con dirección de caracteres especiales.

### v1.11 — Mensaje de despedida post-venta y cierre de QA

**Mensaje de despedida al confirmar pedido:**
Los mensajes de confirmación se reemplazaron por mensajes de cierre amables:
- Con repartidor: `"¡Perfecto! Tu pedido ya está en manos de [Repartidor]. Gracias por elegirnos. 🙌"`
- Sin repartidor: `"¡Perfecto! Pedido registrado. Te asignamos un repartidor en breve. Gracias por elegirnos. 🙌"`

**Recálculo forzado verificado:**
`buildOrderSummary` llama a `calculateTotal(data.details)` en cada invocación, con los detalles actualizados como argumento. No existe variable de precio en sesión — se calcula al vuelo. Verificado con doble cambio de cantidad:
- Inicial: `"2 bidones de 20 litros"` → $8.000
- `"mejor 3"` → `"3 bidones de 20 litros"` → $12.000
- `"mejor 1"` → `canonicalizeDetails` corrige `"1 bidones"` → `"1 bidón de 20 litros"` → $4.000 ✓

**Sanitización de cierre:**
Auditoría de los tres campos del ticket. Ningún `\n` ni espacio extra puede sobrevivir hasta el resumen o la notificación al repartidor:
- `details`: reconstruido por `canonicalizeDetails` desde cero, sin heredar whitespace
- `address`: sanitizado en la entrada (`handleMessage`), en la extracción (`splitOrderAndAddress`, `WAITING_ADDRESS`) y en la presentación (`ORDER_SUMMARY safeAddr`)
- `notes`: recibe `input` que ya pasó por la sanitización global de entrada

### v1.10 — Confirmación NLP, recálculo garantizado y auditoría de sanitización

**Confirmación NLP extendida:**
Agrega al detector de confirmación: `"metele"`, `"mandalo"`, `"mandá"`, `"ya está"`, `"ya esta"`, `"anotalo"`, `"arranca"`, `"vamos"`. El bot ahora entiende confirmaciones coloquiales sin forzar al cliente a decir "sí" o "1".

**Recálculo automático verificado:**
`buildOrderSummary` siempre llama a `calculateTotal(data.details)` sobre los detalles actualizados. Si el cliente dice "mejor 3" en el resumen, `detectOrderChange` actualiza `data.details` a `"3 bidones de X litros"` y el precio se recalcula automáticamente. Verificado:
- Pedido: 1 bidón de 20 → resumen muestra $4.000
- Cliente: "mejor 3" → resumen actualizado: `"3 bidones de 20 litros"` + `$12.000` ✓

**Uniformidad del ticket:**
Todo path de la FSM pasa por `canonicalizeDetails` o `normalizeDetails` antes de llegar al resumen. Formato garantizado: `N bidón/bidones de X litros` sin excepciones.

**Sanitización definitiva — auditoría de tres capas:**
1. **Entrada**: `text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()` al inicio de `handleMessage` — ningún salto de línea entra al procesamiento
2. **Extracción**: `.replace(/\s+/g, ' ')` en `splitOrderAndAddress` y en `WAITING_ADDRESS` — la dirección guardada en sesión ya es limpia
3. **Presentación**: `address.replace(/\n/g, ' ')` en `ORDER_SUMMARY` — capa defensiva final

No existe path en el que un `\n` sobreviva hasta el ticket o la notificación al repartidor.

### v1.9 — QA natural: por favor, cambio de tamaño en notas y nuevos escenarios

**`stripPrefix` — elimina "por favor" inicial:**
`"Por favor, 2 bidones de 20"` → `"2 bidones de 20"`. Se aplica en el bucle do/while junto al resto de prefijos, por lo que también funciona combinado: `"buenas tardes, por favor 1 bidón de 20"`.

**`detectSizeChange` + cambio de tamaño en `WAITING_NOTES` (El Arrepentido de último momento):**
Nueva función que detecta frases de cambio de tamaño en el paso de notas: `"mejor de 12"`, `"al final de 20L"`, `"mandame de 12 litros"`, `"en vez de 20"`. Cuando se detecta:
1. Se extrae la cantidad del detalle actual (`extractQty`)
2. Se reconstruye `"N bidón/bidones de X litros"` con el nuevo tamaño
3. El bot muestra el resumen actualizado con precio recalculado y pasa a `WAITING_CONFIRMATION` sin perder dirección, repartidor ni método de pago

> **Decisión técnica:** `detectSizeChange` se evalúa **antes** del chequeo de `noNotes`, para que "mejor de 12" no sea tratado como "sin nota" ni guardado como nota textual.

**`noNotes` regex ampliado:**
Agrega `"nop"`, `"nope"`, `"sin notas"`, `"sin nada"`, `"paso"` → nota omitida del resumen.

**`normalizeDetails` — fix singular/plural en path con bidón:**
Antes: `"1 bidón de 20"` → paso WAITING_SIZE → `"1 bidón de 20 litros"` (correcto). Pero `"1 bidones de 20"` → `"1 bidones de 20 litros"` (incorrecto). Ahora extrae la cantidad del texto original y aplica `bidón`/`bidones` correctamente antes de agregar el tamaño.

**Loadtest — nuevos escenarios y respuestas:**
- `educado-por-favor`, `educado-por-favor-2`, `educado-por-favor-3`: ejercitan "por favor" en distintas posiciones.
- `respuesta-corta-20l`, `respuesta-corta-12l`: cliente responde con `"2"` / `"1"` directo desde el saludo.
- `arrepentido-en-nota`, `arrepentido-en-nota-2`: llegan hasta el paso de notas y cambian el tamaño con `"mejor de 12"` / `"mejor de 20"`.
- `AUTO_RESPONSE[WAITING_SIZE]`: agrega `'12'`, `'20'`, `'12l'`, `'20l'` además de `'1'`/`'2'`.
- `AUTO_RESPONSE[WAITING_NOTES]`: agrega `'nop'`, `'paso'`, `'mejor de 12'`, `'mejor de 20'`.

### v1.8 — El Arrepentido, El Charlatán y robustez QA

**`detectOrderChange` — cambio de cantidad Y tamaño en confirmación:**
Reemplaza a `detectQuantityChange`. Ahora detecta "mejor 3 de 12" → actualiza cantidad (3) y tamaño (12L) simultáneamente, recalculando el total. Si solo se indica cantidad ("mejor 3"), aplica el cambio sobre el tamaño existente y canonicaliza.

> **Decisión técnica:** cuando cambia el tamaño, reconstruye desde cero: `"N bidón/bidones de X litros"`. Cuando solo cambia la cantidad, reemplaza el número inicial de `data.details` y llama a `canonicalizeDetails` para corregir singular/plural.

**WAITING_ADDRESS — El Charlatán (validación de dígito):**
Ahora rechaza cualquier dirección sin dígito (número de calle): "Jajaja", "¿Cómo está el clima?", "frente al arco" → INVALID_ADDRESS. Requiere mínimo 5 caracteres Y al menos un dígito.

**Expresiones de duda ampliadas:**
Agrega "pará", "para", "esperate", "aguarda", "ya vengo" al detector de duda en WAITING_CONFIRMATION. Todas retornan el mensaje breve sin spam de resumen.

**Loadtest — nuevos escenarios:**
`arrepentido-qty-size` (cambia cantidad+tamaño), `mezcla-dos-de-veinte`, `mezcla-2-de-12`, `mezcla-tres-de-doce`. `AUTO_RESPONSE[WAITING_CONFIRMATION]` incluye "pará", "mejor 3 de 12", "mejor 1 de 20".

### v1.7 — Refactorización QA: sanitización global, canonicalización y gramática

**Sanitización global de saltos de línea (bug crítico resuelto):**
`const input = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()` al inicio de `handleMessage`. Antes se usaba `text.trim()`, que no colapsa `\n` internos. El efecto: el regex `(.+)$` falla porque `.` no matchea `\n`, así que `splitOrderAndAddress` retornaba `null` para `"Av.\nCorrientes 1234"` y el bot preguntaba la dirección separado aunque ya venía en el mensaje.

> **Decisión técnica:** la sanitización ocurre una sola vez al entrar al handler, antes de cualquier procesamiento. Así todos los pasos (WAITING_ADDRESS, WAITING_ORDER, splitOrderAndAddress, etc.) reciben siempre input limpio sin duplicar la limpieza.

**`canonicalizeDetails` — normalización canónica con gramática correcta:**
Nueva función que convierte cualquier forma de detalles con tamaño conocido al formato canónico `"N bidón/bidones de X litros"`:
- `"2 de 20"` → `"2 bidones de 20 litros"` (skip silencioso de WAITING_SIZE)
- `"1 bidones de 20 litros"` → `"1 bidón de 20 litros"` (corrige gramática)
- `"1 bidón de 20"` → `"1 bidón de 20 litros"` (agrega "litros")
- `"Buenardooo 👌 2 bidones de 20"` → `"2 bidones de 20 litros"` (limpia ruido)

Se llama en `nextAfterDetails` cada vez que `hasSize` es true. Al estar centralizada, cualquier path que llegue a pago, repartidor o confirmación tiene detalles canónicos.

**Fix gramática singular en `normalizeDetails`:**
Cuando qty=1, retorna `"1 bidón de X litros"` (no `"1 bidones"`).

**WAITING_SIZE más robusto:**
Acepta `"12"`, `"20"`, `"12 litros"`, `"20 litros"`, `"12l"`, `"20l"` además de `"1"` y `"2"`.

**`PAYMENT_MAP` ampliado:**
Agrega `"transfe"` → `"2"`.

### v1.6 — Cambio de cantidad, manejo de dudas y loadtest Gamer/Indeciso/Extranjero

**Cambio de cantidad a último momento (`WAITING_CONFIRMATION`):**
Si el cliente llega al resumen y quiere ajustar la cantidad ("mejor 3", "cambiá a 2", "en vez de 4"), el bot actualiza los detalles y re-muestra el resumen sin perder la dirección, el repartidor ni el método de pago ya cargados. El cambio acepta números escritos ("mejor dos") gracias a `normalizeNumbers`.

> **Decisión técnica:** `detectQuantityChange` normaliza el texto primero, luego matchea `(?:mejor|cambiá|corregí|en vez de)\s+(\d+)`. El reemplazo se hace sobre `data.details.replace(/^\d+/, newQty)` — solo toca el número inicial del string, no los litros.

**Expresiones de duda sin spam de resumen:**
Cuando el cliente envía "un momento", "hmm", "espera" u otras expresiones de pausa en `WAITING_CONFIRMATION`, el bot responde con un mensaje breve ("No hay problema, avisame cuando estés listo. 1 Confirmar 2 Cancelar") en lugar de repetir el resumen completo.

**Loadtest — El Gamer, El Indeciso, El Extranjero:**
- **Gamer**: nueva Fase 2 — mismo teléfono, 3 conversaciones en ráfaga. Verifica que `clearSession` funcione correctamente y no haya corrupción de estado entre pedidos del mismo número.
- **Indeciso**: escenario `indeciso-cambio` + "mejor 3"/"mejor 2" en `AUTO_RESPONSE[WAITING_CONFIRMATION]`. Ejercita el cambio de cantidad mid-flow y el mensaje de duda.
- **Extranjero**: escenarios `extranjero-dos`/`extranjero-tres` hacen explícita la cobertura de números escritos, que ya maneja `normalizeNumbers`.

### v1.5 — FAQ mid-flow, direcciones complejas y loadtest más humano

**Detección de FAQ en cualquier paso:**
El bot responde preguntas frecuentes sin romper el flujo activo. Si el cliente está esperando dirección y pregunta "¿Hasta qué hora reparten?", el bot responde y vuelve a pedir la dirección. Preguntas reconocidas:
- Horario: "¿hasta qué hora reparten?", "¿qué hora cierran?"
- Precios: "¿cuánto cuesta el bidón?", "¿qué precio tiene?"

> **Decisión técnica:** la detección FAQ ocurre antes del `switch(step)` en `handleMessage`, lo que garantiza que aplica en todos los pasos sin duplicar código. El mapa `RE_ASK` asocia cada step con la pregunta a re-emitir después de la respuesta FAQ.

**Regex de dirección más permisivo:**
`splitOrderAndAddress` usaba un pattern estricto que rechazaba direcciones complejas como "9 de Julio 350" (número en el nombre de la calle) o "Rivadavia esquina Corrientes 1200" (sin número inmediato tras el nombre). El nuevo pattern acepta todo lo que haya después de "a/en" siempre que contenga al menos un dígito (número de calle). Esto elimina falsos negativos sin introducir falsos positivos ("2 bidones en total" → "total" sin dígito → rechazado).

**Loadtest — comportamiento más humano:**
- `WAITING_ADDRESS`: incluye direcciones complejas ("Rivadavia esquina Corrientes 1200", "9 de Julio 350, timbre 4B", "Mitre 100, la casa con portón azul, timbre 3")
- `WAITING_CONFIRMATION`: agrega respuestas inválidas ("un momento", "hmm") para probar que el bot re-muestra el resumen en lugar de cancelar
- `WAITING_PAYMENT`: incluye texto natural ("efectivo", "transferencia", "transfer", "efect")
- Nuevos escenarios: `faq-horario-idle`, `faq-precio-idle`, `dirección-esquina`, `dirección-numero-calle`

### v1.4 — Gramática, dirección limpia y loadtest NLP

**`normalizeDetails` mejorado:**
Si el cliente describe el pedido con una palabra ambigua (ej: "agua", "3 agua"), el bot la reemplaza por la forma canónica "N bidones de X litros" al asignar el tamaño. Así el resumen y la notificación al repartidor son siempre gramaticalmente correctos.

**Sanitización de dirección:**
Los saltos de línea invisibles (`\n`) que podía capturar el regex de `splitOrderAndAddress` (al hacer `match` con `\s+`) ahora se eliminan en dos puntos: al extraer la dirección del texto combinado y al guardarla desde `WAITING_ADDRESS`. Esto evita el corte visual "📍 Av.\n Santa Fe 3000" en el resumen.

> **Decisión técnica:** la sanitización se aplica en la fuente (extracción/almacenamiento), no solo en la presentación (`ORDER_SUMMARY`). Así el dato en sesión ya es limpio y no depende de que todos los puntos de salida la saniticen.

**Loadtest — cobertura de pago NLP:**
`AUTO_RESPONSE[WAITING_PAYMENT]` ahora incluye `'efectivo'`, `'transferencia'`, `'transfer'`, `'efect'` además de `'1'`/`'2'`. Esto ejercita la función `normalizePaymentInput` en cada corrida del loadtest.

### v1.3 — Tamaño obligatorio y confirmación mejorada

**Nuevo paso `WAITING_SIZE`:**
Si el cliente especifica cantidad pero no el tamaño del bidón (ej: "2 bidones"), el bot pregunta:
```
¿De qué tamaño los querés?
1 De 12 litros — $3.500
2 De 20 litros — $4.000
```
Esto elimina la asunción silenciosa de 20L y evita reclamos por precio o tamaño equivocado. Al confirmar, los detalles se normalizan a "2 bidones de 20 litros" para que el resumen siempre sea explícito.

**Helper `nextAfterDetails` centralizado:**
La decisión "¿qué pregunto después de tener los detalles?" estaba duplicada en 5 lugares del handler. Se extrajo a una función única que evalúa en orden: falta tamaño → falta dirección → cliente conocido (pago) → cliente nuevo (repartidor). Cualquier cambio futuro al flujo se hace en un solo lugar.

**Confirmación con lenguaje natural:**
`WAITING_CONFIRMATION` ahora acepta "sí", "dale", "va", "ok", "confirmado", "listo", "claro", "de acuerdo" además del número "1". Para cancelar: "no", "cancelar" además del "2".

**Corrección de resumen:**
Las direcciones con saltos de línea se sanitizan antes de mostrarlas en el resumen para evitar cortes visuales.

### v1.2 — Segunda ronda de fixes

**Bugs corregidos:**
- `calculateTotal` ahora busca la cantidad como el número que precede a "bidón/bidones" en lugar del primer número del texto. Evita que "20 bidones" calcule 1 bidón (confundía 20 con litros).
- `WAITING_ORDER` ya rechaza frases sociales ("ok", "dale", "gracias") y entradas de menos de 2 caracteres, en lugar de guardarlas como detalles del pedido.

**Mejoras de flujo:**
- Opción 4 (no sé mi repartidor): el bot informa inmediatamente "te asignamos un repartidor" en el mismo mensaje del total, sin dejar al cliente sin respuesta.
- `WAITING_NOTES`: "ok", "dale", "listo", "nada", etc. se interpretan como "sin notas", igual que "No".

**Mensajes — consistencia y brevedad:**
- Eliminados todos los fillers: "Perfecto.", "¡Listo!", "¡Hola!" al inicio de respuestas intermedias.
- "¿Cómo vas a abonar?" → "¿Cómo abonás?" (forma consistente con el resto).
- `ASK_RESCHEDULE`, `RESCHEDULE_CONFIRMED`, `RECEIPT_REQUIRED` acortados.
- Todas las preguntas usan el mismo tono directo y tuteo rioplatense.

### v1.1 — Mejoras de flujo y corrección de bugs

**Bugs corregidos:**
- `hasQuantity()` ahora verifica `/^\d+/` en lugar de `/\d/`. El bug anterior hacía que "bidones de **20** litros" fuera interpretado como "20 bidones", calculando un total de $80.000 en vez de $8.000.
- `calculateTotal()` detecta el tamaño (litros) antes de buscar la cantidad, evitando que ambos números se confundan.

**Nuevas funcionalidades:**
- **Confirmación de pedido**: antes de registrar el pedido se muestra un resumen completo (producto, dirección, repartidor, método de pago, total) y el cliente confirma o cancela.
- **Cancelar en cualquier momento**: el cliente puede escribir `cancelar` en cualquier paso del flujo.
- **Lenguaje natural en opciones**: el bot ahora acepta nombres de repartidores ("Silvio", "Ale", "Damian") y métodos de pago ("efectivo", "transferencia") además de los números.
- **Validación de dirección**: se rechaza cualquier dirección de menos de 5 caracteres.
- **Load test** (`npm run loadtest`): simula conversaciones completas contra la FSM y la DB sin conectar a WhatsApp (1000 por defecto desde v1.12).

## Deploy en Railway + Supabase

### 1. Base de datos (Supabase)

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a **Dashboard → SQL Editor → New query**, pegar el contenido de `db/schema.sql` y ejecutar
3. Ir a **Settings → API** y copiar:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_KEY`

### 2. Subir a Railway

1. Hacer push del repo a GitHub
2. En [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**
3. Railway detecta el `Dockerfile` automáticamente

### 3. Variables de entorno en Railway

En el panel de Railway, sección **Variables**, agregar:

| Variable                    | Valor                                            |
|-----------------------------|--------------------------------------------------|
| `SUPABASE_URL`              | Project URL de Supabase                          |
| `SUPABASE_KEY`              | anon public key de Supabase                      |
| `NODE_ENV`                  | `production`                                     |
| `TZ`                        | `America/Argentina/Buenos_Aires`                 |
| `DRIVER_1_PHONE`            | Teléfono de Silvio (formato: `549...`)           |
| `DRIVER_2_PHONE`            | Teléfono de Alejandro                            |
| `DRIVER_3_PHONE`            | Teléfono de Damian                               |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` (ya seteado en el Dockerfile)|

> Railway inyecta `PORT` automáticamente — no hace falta agregarlo.

### 4. Sesión de WhatsApp

La primera vez que el bot arranque, el QR aparece en los **logs de Railway**. Escanearlo con el teléfono una sola vez. La sesión queda guardada en `/app/sessions` (configurado en `LocalAuth`).

> **Nota:** si Railway redeploya el contenedor, la sesión se pierde y hay que escanear el QR nuevamente. Para evitarlo, configurar un **volumen persistente** en Railway montado en `/app/sessions`.

## Próximos pasos

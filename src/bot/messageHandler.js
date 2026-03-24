// FSM pura del bot: recibe (phone, text, session, assignment) → retorna { reply, nextStep, sideEffects }

import { STEPS, MESSAGES, DRIVERS } from '../config.js';
import { PRICES } from '../cache/precioCache.js';

// ── Helpers de texto ──────────────────────────────────────────────────────────

function stripPrefix(text) {
  let prev;
  do {
    prev = text;
    text = text
      .replace(/^(buenos\s+d[ií]as?|buenas\s+tardes?|buenas\s+noches?|buen\s+d[ií]a|buenas?|hola|hey)[,!.\s]*/i, '')
      .replace(/^(che|mira|mir[aá])[,!.\s]*/i, '')
      .replace(/^(te\s+puedo\s+pedir|quiero\s+pedir|quisiera\s+pedir|necesito\s+pedir|me\s+pod[eé]s?\s+(mandar|traer|dar)|me\s+podr[ií]as?\s+(mandar|traer|dar)|me\s+mand[aá]s?|me\s+tra[eé]s?|pod[eé]s?\s+mandarme|por\s+favor\s+mand[aá]me|quiero|quisiera|necesito)[,?!.\s]*/i, '')
      .replace(/^por\s+favor[,!.\s]*/i, '')
      .trim();
  } while (text !== prev);
  return text;
}

const NUMBER_WORDS = {
  'cero': '0', 'un': '1', 'uno': '1', 'una': '1',
  'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
  'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
  'diez': '10', 'once': '11', 'doce': '12', 'trece': '13',
  'catorce': '14', 'quince': '15', 'dieciseis': '16', 'dieciséis': '16',
  'diecisiete': '17', 'dieciocho': '18', 'diecinueve': '19', 'veinte': '20',
};

function normalizeNumbers(text) {
  const pattern = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');
  return text.replace(pattern, (match) => NUMBER_WORDS[match.toLowerCase()] ?? match);
}

/** True si el texto empieza con un número (indica cantidad explícita de unidades). */
function hasQuantity(text) {
  return /^\d+/.test(text.trim());
}

/**
 * True si el texto especifica un tamaño de bidón o menciona sifón.
 * Sin esto no se puede calcular el precio con certeza.
 */
function hasSize(text) {
  return /\d+\s*litros/i.test(text)
    || /\bde\s+(5|8|10|12|20)\b/i.test(text)
    || /sif[oó]n/i.test(text);
}

function isSocialPhrase(text) {
  return /^(gracias|muchas\s+gracias|mil\s+gracias|gracia|ok|okey|okay|dale|genial|perfecto|buenísimo|buenisimo|excelente|re\s+bien|todo\s+bien|👍|🙏|joya|de\s+nada|np|barbaro|bárbaro|divino)[\s!.]*$/i.test(text);
}

/**
 * Detecta peticiones de cambio de cantidad y/o tamaño en WAITING_CONFIRMATION.
 * Ejemplos: "mejor 3", "mejor 3 de 12", "cambiá a 2 de 20", "en vez de 1 bidón de 12".
 * Retorna { qty, liters } donde liters puede ser null si no se especificó.
 */
function detectOrderChange(text) {
  const normalized = normalizeNumbers(text);
  const m = normalized.match(
    /(?:mejor|cambi[aá](?:\s+a)?|correg[ií](?:\s+a)?|en\s+vez\s+(?:de\s+)?|pon[eé]\s+|son\s+)(\d+)(?:\s+(?:bid[oó]n\S*\s+)?de\s+(\d+))?/i
  );
  if (!m) return null;
  const qty    = parseInt(m[1]);
  const liters = m[2] ? parseInt(m[2]) : null;
  return { qty, liters: liters && PRICES[liters] ? liters : null };
}

/**
 * Extrae la cantidad de una cadena de detalles canónica ("N bidón/bidones de X litros").
 * Retorna 1 si no se puede determinar.
 */
function extractQty(details) {
  const m = details.match(/^(\d+)/);
  return m ? parseInt(m[1]) : 1;
}

/**
 * Detecta un cambio de tamaño en WAITING_NOTES.
 * Ejemplos: "mejor de 12", "al final de 20L", "mandame de 12 litros", "mejor de 12L".
 * Retorna el nuevo número de litros (12 o 20) o null si no detecta cambio.
 */
function detectSizeChange(text) {
  const normalized = normalizeNumbers(text);
  const m = normalized.match(
    /(?:mejor|al\s+final|en\s+vez|cambi[aá](?:\s+a)?|mand[aá]me|quiero)\s+(?:de\s+)?(\d+)\s*(?:l(?:itros?)?)?(?:\b|$)/i
  );
  if (!m) return null;
  const liters = parseInt(m[1]);
  return PRICES[liters] ? liters : null;
}

/**
 * Detecta preguntas frecuentes (horario, precios) y retorna la respuesta o null.
 * Se activa en cualquier paso del flujo para no dejar al cliente sin respuesta.
 */
function detectFaq(text) {
  if (/hasta\s+qu[eé]\s+hora|qu[eé]\s+hora\s+(reparten|entregan|cierran)|horario\s+de\s+(entrega|reparto)/i.test(text)) {
    return 'Repartimos hasta las 14hs.';
  }
  if (/cu[aá]nto\s+(cuesta|sale|vale|cuestan|salen|valen)|qu[eé]\s+precio\s+tiene|cuales?\s+son\s+los\s+precios/i.test(text)) {
    const fmt = (n) => n.toLocaleString('es-AR');
    return [
      `Sifón de soda: $${fmt(PRICES.sifon)}`,
      `Bidón 5L: $${fmt(PRICES[5])}`,
      `Bidón 8L: $${fmt(PRICES[8])}`,
      `Bidón 10L: $${fmt(PRICES[10])}`,
      `Bidón 12L: $${fmt(PRICES[12])}`,
      `Bidón 20L: $${fmt(PRICES[20])}`,
    ].join('\n');
  }
  return null;
}

/**
 * Calcula el total detectando tamaño primero para no confundirlo con la cantidad.
 * Busca la cantidad como el número antes de "bidón/bidones"; fallback al primer
 * número distinto del tamaño.
 * Exportada para que orderService.js pueda calcular el total al crear un pedido.
 */
export function calculateTotal(details) {
  // Sifón de soda: "N sifón/sifones de soda"
  if (/sif[oó]n/i.test(details)) {
    const m = details.match(/(\d+)/);
    const qty = m ? parseInt(m[1]) : 1;
    return qty * (PRICES.sifon ?? 1000);
  }

  const litrosMatch = details.match(/(\d+)\s*litros/i);
  let liters = litrosMatch ? parseInt(litrosMatch[1]) : null;

  if (!liters) {
    const deMatch = details.match(/\bde\s+(\d+)\b/i);
    if (deMatch) {
      const val = parseInt(deMatch[1]);
      if (PRICES[val]) liters = val;
    }
  }
  liters = liters ?? 20;

  const bidMatch = details.match(/(\d+)\s*bid[oó]n/i);
  let quantity;
  if (bidMatch) {
    quantity = parseInt(bidMatch[1]);
  } else {
    const allNumbers = [...details.matchAll(/\d+/g)].map((m) => parseInt(m[0]));
    quantity = allNumbers.find((n) => n !== liters) ?? 1;
  }

  return quantity * (PRICES[liters] ?? PRICES[20]);
}

/**
 * Normaliza los detalles del pedido incluyendo el tamaño.
 * Si el producto no menciona "bidón/bidones" (ej: "agua", "3 agua"),
 * lo reemplaza directamente por "N bidones de X litros" para que el
 * resumen y la notificación al repartidor sean siempre claros.
 */
function normalizeDetails(details, sizeLabel) {
  // Sifón: construir "N sifón/sifones de soda"
  if (sizeLabel === 'sifon') {
    const qMatch = details.match(/^(\d+)/);
    const qty  = qMatch ? parseInt(qMatch[1]) : null;
    const word = qty === 1 ? 'sifón' : 'sifones';
    return qty !== null ? `${qty} ${word} de soda` : 'sifón de soda';
  }

  if (/litros/i.test(details)) return details; // tamaño ya presente

  if (!/bid[oó]n/i.test(details)) {
    // Producto ambiguo (ej: "agua", "3 agua") → inferir "bidones"
    const qMatch = details.match(/^(\d+)/);
    const qty    = qMatch ? parseInt(qMatch[1]) : null;
    const word   = qty === 1 ? 'bidón' : 'bidones';
    return qty !== null
      ? `${qty} ${word} de ${sizeLabel}`
      : `bidones de ${sizeLabel}`;
  }

  // Preserva la cantidad correcta y corrige singular/plural
  const bidQMatch = details.match(/^(\d+)/);
  const bidQty    = bidQMatch ? parseInt(bidQMatch[1]) : null;
  const bidWord   = bidQty === 1 ? 'bidón' : 'bidones';
  return bidQty !== null
    ? `${bidQty} ${bidWord} de ${sizeLabel}`
    : `${details} de ${sizeLabel}`;
}

/**
 * Convierte cualquier forma de detalles con tamaño conocido a la forma canónica
 * "N bidón/bidones de X litros". Ejemplos:
 *   "2 de 20"            → "2 bidones de 20 litros"
 *   "1 bidón de 20"      → "1 bidón de 20 litros"
 *   "3 bidones de 12"    → "3 bidones de 12 litros"
 *   "1 bidones de 20L"   → "1 bidón de 20 litros"  (corrige gramática)
 * Requiere que hasSize(details) sea true.
 */
function canonicalizeDetails(details) {
  // Sifón: ya está en forma canónica "N sifones de soda"
  if (/sif[oó]n/i.test(details)) return details;

  // Detectar litros
  let liters = null;
  const litMatch = details.match(/(\d+)\s*litros/i);
  if (litMatch) {
    liters = parseInt(litMatch[1]);
  } else {
    const deMatch = details.match(/\bde\s+(5|8|10|12|20)\b/i);
    if (deMatch) liters = parseInt(deMatch[1]);
  }
  if (!liters || !PRICES[liters]) return details; // no se puede determinar

  // Detectar cantidad
  const bidMatch = details.match(/(\d+)\s*bid[oó]n/i);
  let qty;
  if (bidMatch) {
    qty = parseInt(bidMatch[1]);
  } else {
    const nums = [...details.matchAll(/\d+/g)].map((m) => parseInt(m[0]));
    qty = nums.find((n) => n !== liters) ?? 1;
  }

  const word = qty === 1 ? 'bidón' : 'bidones';
  return `${qty} ${word} de ${liters} litros`;
}

function splitOrderAndAddress(text) {
  const cleaned = stripPrefix(text);
  const separators = [
    /^(.+?),?\s+direcci[oó]n\s*:\s*(.+)$/i,
    /^(.+?)\s+(?:a|en)\s+(.+)$/i,
  ];
  for (const regex of separators) {
    const match = cleaned.match(regex);
    if (match) {
      const details = normalizeNumbers(match[1].trim());
      const address = match[2].trim().replace(/[?!]+$/, '').replace(/\s+/g, ' ');
      // Exigir un dígito en la dirección (número de calle) para evitar falsos positivos
      // como "2 bidones en total" → address="total" (sin dígito → rechazado).
      if (details.length >= 2 && address.length >= 5 && /\d/.test(address)) {
        return { details, address };
      }
    }
  }
  return null;
}

// ── Mapas de lenguaje natural ─────────────────────────────────────────────────

const DRIVER_NAME_MAP = {
  silvio: '1', sil: '1',
  alejandro: '2', ale: '2',
  damian: '3', damián: '3', dami: '3',
};

const PAYMENT_MAP = {
  efectivo: '1', efect: '1', cash: '1', 'en mano': '1', 'en efectivo': '1',
  transferencia: '2', transfe: '2', transf: '2', transfer: '2', transfiero: '2',
};

function normalizeDriverInput(input) {
  return DRIVER_NAME_MAP[input.toLowerCase().trim()] ?? input;
}

function normalizePaymentInput(input) {
  return PAYMENT_MAP[input.toLowerCase().trim()] ?? input;
}

// ── Helper central: decide el siguiente paso según los datos disponibles ──────
//
// Orden de prioridad:
//   1. Si falta tamaño   → preguntar tamaño  (WAITING_SIZE)
//   2. Si falta dirección → preguntar dirección (WAITING_ADDRESS)
//   3. Si cliente conocido → preguntar pago  (WAITING_PAYMENT)
//   4. Si cliente nuevo   → preguntar repartidor (WAITING_DRIVER)
//
// Centralizar aquí evita que la lógica se repita (y diverja) en cada estado.

function nextAfterDetails(details, address, assignment, extraData = {}) {
  // Sin tamaño → preguntar tamaño (preservamos details original en sesión)
  if (!hasSize(details)) {
    const baseData = { ...extraData, details };
    if (address) baseData.address = address;
    return {
      reply:       MESSAGES.ASK_SIZE,
      nextStep:    STEPS.WAITING_SIZE,
      nextData:    baseData,
      sideEffects: {},
    };
  }

  // Con tamaño → normalizar a la forma canónica antes de continuar
  const canonical = canonicalizeDetails(details);
  const baseData  = { ...extraData, details: canonical };
  if (address) baseData.address = address;

  if (!address) {
    return {
      reply:       MESSAGES.ASK_ADDRESS,
      nextStep:    STEPS.WAITING_ADDRESS,
      nextData:    baseData,
      sideEffects: {},
    };
  }

  if (assignment) {
    return {
      reply:       MESSAGES.ASK_PAYMENT(calculateTotal(canonical)),
      nextStep:    STEPS.WAITING_PAYMENT,
      nextData:    { ...baseData, driverId: assignment.driver_id, status: 'ASSIGNED' },
      sideEffects: {},
    };
  }

  return {
    reply:       MESSAGES.ASK_DRIVER,
    nextStep:    STEPS.WAITING_DRIVER,
    nextData:    baseData,
    sideEffects: {},
  };
}

// ── Resumen del pedido ────────────────────────────────────────────────────────

function buildOrderSummary(data) {
  const total      = calculateTotal(data.details);
  const driverName = data.driverId ? DRIVERS[data.driverId] : 'Sin asignar';
  return MESSAGES.ORDER_SUMMARY({
    details:       data.details,
    address:       data.address,
    driverName,
    paymentMethod: data.paymentMethod,
    notes:         data.notes ?? null,
    total,
  });
}

// Pregunta a re-emitir después de responder una FAQ en medio del flujo
const RE_ASK = {
  [STEPS.WAITING_ORDER]:        MESSAGES.ASK_ORDER,
  [STEPS.WAITING_QUANTITY]:     MESSAGES.ASK_QUANTITY,
  [STEPS.WAITING_SIZE]:         MESSAGES.ASK_SIZE,
  [STEPS.WAITING_ADDRESS]:      MESSAGES.ASK_ADDRESS,
  [STEPS.WAITING_DRIVER]:       MESSAGES.ASK_DRIVER,
  [STEPS.WAITING_PAYMENT]:      MESSAGES.INVALID_PAYMENT_CHOICE,
  [STEPS.WAITING_RECEIPT]:      MESSAGES.ASK_RECEIPT,
  [STEPS.WAITING_NOTES]:        MESSAGES.ASK_NOTES,
  [STEPS.WAITING_RESCHEDULE]:   MESSAGES.ASK_RESCHEDULE,
  [STEPS.WAITING_CONFIRMATION]: '¿Confirmás?\n1 Sí, confirmar\n2 Cancelar',
};

// ── FSM ───────────────────────────────────────────────────────────────────────

export function handleMessage(phone, text, session, assignment) {
  const { step, data } = session;
  // Colapsar \r\n internos antes de cualquier procesamiento.
  // Sin esto, "Av.\nCorrientes 1234" hace que el regex (.+)$ falle
  // porque `.` no matchea \n, y splitOrderAndAddress retorna null.
  const input = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Cancelar en cualquier momento del flujo (excepto IDLE y reprogramación)
  if (step !== STEPS.IDLE && step !== STEPS.WAITING_RESCHEDULE && /^cancelar$/i.test(input)) {
    return {
      reply:       MESSAGES.ORDER_CANCELLED,
      nextStep:    STEPS.IDLE,
      nextData:    {},
      sideEffects: {},
    };
  }

  // FAQ en cualquier paso: responde horario o precios y re-pregunta lo que esperaba
  const faqAnswer = detectFaq(input);
  if (faqAnswer) {
    const reAsk = RE_ASK[step] ?? null;
    return {
      reply:       reAsk ? `${faqAnswer}\n\n${reAsk}` : faqAnswer,
      nextStep:    step,
      nextData:    data,
      sideEffects: {},
    };
  }

  switch (step) {

    // ── IDLE ─────────────────────────────────────────────────────────────────
    case STEPS.IDLE: {
      if (isSocialPhrase(input)) {
        return {
          reply:       MESSAGES.SOCIAL_REPLY,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: {},
        };
      }

      const combined = splitOrderAndAddress(input);
      if (combined) {
        if (!hasQuantity(combined.details)) {
          return {
            reply:       MESSAGES.ASK_QUANTITY,
            nextStep:    STEPS.WAITING_QUANTITY,
            nextData:    { details: combined.details, address: combined.address },
            sideEffects: {},
          };
        }
        return nextAfterDetails(combined.details, combined.address, assignment);
      }

      const cleaned = normalizeNumbers(stripPrefix(input));
      if (cleaned.length >= 3) {
        if (!hasQuantity(cleaned)) {
          return {
            reply:       MESSAGES.ASK_QUANTITY,
            nextStep:    STEPS.WAITING_QUANTITY,
            nextData:    { details: cleaned },
            sideEffects: {},
          };
        }
        return nextAfterDetails(cleaned, null, assignment);
      }

      return {
        reply:       MESSAGES.ASK_ORDER,
        nextStep:    STEPS.WAITING_ORDER,
        nextData:    {},
        sideEffects: {},
      };
    }

    // ── WAITING_ORDER ────────────────────────────────────────────────────────
    case STEPS.WAITING_ORDER: {
      // Rechazar frases sociales y entradas vacías
      if (isSocialPhrase(input) || normalizeNumbers(stripPrefix(input)).length < 2) {
        return {
          reply:       MESSAGES.ASK_ORDER,
          nextStep:    STEPS.WAITING_ORDER,
          nextData:    data,
          sideEffects: {},
        };
      }

      const combined = splitOrderAndAddress(input);
      if (combined) {
        if (!hasQuantity(combined.details)) {
          return {
            reply:       MESSAGES.ASK_QUANTITY,
            nextStep:    STEPS.WAITING_QUANTITY,
            nextData:    { details: combined.details, address: combined.address },
            sideEffects: {},
          };
        }
        return nextAfterDetails(combined.details, combined.address, assignment);
      }

      const details = normalizeNumbers(stripPrefix(input) || input);
      if (!hasQuantity(details)) {
        return {
          reply:       MESSAGES.ASK_QUANTITY,
          nextStep:    STEPS.WAITING_QUANTITY,
          nextData:    { details },
          sideEffects: {},
        };
      }
      return nextAfterDetails(details, null, assignment);
    }

    // ── WAITING_QUANTITY ─────────────────────────────────────────────────────
    case STEPS.WAITING_QUANTITY: {
      const normalized    = normalizeNumbers(input.trim());
      const quantityMatch = normalized.match(/\d+/);

      if (!quantityMatch) {
        return {
          reply:       MESSAGES.INVALID_QUANTITY,
          nextStep:    STEPS.WAITING_QUANTITY,
          nextData:    data,
          sideEffects: {},
        };
      }

      const details = `${quantityMatch[0]} ${data.details}`;
      return nextAfterDetails(details, data.address ?? null, assignment);
    }

    // ── WAITING_SIZE ─────────────────────────────────────────────────────────
    case STEPS.WAITING_SIZE: {
      const sizeMap = {
        // Opciones del menú numerado
        '1': 'sifon',      '2': '5 litros',   '3': '8 litros',
        '4': '10 litros',  '5': '12 litros',  '6': '20 litros',
        // Texto libre
        'sifon': 'sifon',  'sifón': 'sifon',  'soda': 'sifon',
        '5l': '5 litros',  '5 litros': '5 litros',
        '8l': '8 litros',  '8 litros': '8 litros',
        '10l': '10 litros','10 litros': '10 litros',
        '12l': '12 litros','12 litros': '12 litros',
        '20l': '20 litros','20 litros': '20 litros',
      };
      const sizeLabel = sizeMap[input.trim().toLowerCase()];

      if (!sizeLabel) {
        return {
          reply:       MESSAGES.INVALID_SIZE_CHOICE,
          nextStep:    STEPS.WAITING_SIZE,
          nextData:    data,
          sideEffects: {},
        };
      }

      const details = normalizeDetails(data.details, sizeLabel);
      return nextAfterDetails(details, data.address ?? null, assignment, { ...data });
    }

    // ── WAITING_ADDRESS ──────────────────────────────────────────────────────
    case STEPS.WAITING_ADDRESS: {
      // Requiere al menos 5 chars Y un dígito (número de calle).
      // Rechaza entradas inválidas como "jajaja" o "¿Cómo está el clima?".
      if (input.length < 5 || !/\d/.test(input)) {
        return {
          reply:       MESSAGES.INVALID_ADDRESS,
          nextStep:    STEPS.WAITING_ADDRESS,
          nextData:    data,
          sideEffects: {},
        };
      }

      const address = input.replace(/\s+/g, ' ').trim();
      const orderData = { ...data, address };

      if (assignment) {
        return {
          reply:       MESSAGES.ASK_PAYMENT(calculateTotal(orderData.details)),
          nextStep:    STEPS.WAITING_PAYMENT,
          nextData:    { ...orderData, driverId: assignment.driver_id, status: 'ASSIGNED' },
          sideEffects: {},
        };
      }

      return {
        reply:       MESSAGES.ASK_DRIVER,
        nextStep:    STEPS.WAITING_DRIVER,
        nextData:    orderData,
        sideEffects: {},
      };
    }

    // ── WAITING_DRIVER ───────────────────────────────────────────────────────
    case STEPS.WAITING_DRIVER: {
      const effective = normalizeDriverInput(input);

      if (effective === '1' || effective === '2' || effective === '3') {
        const driverId = parseInt(effective, 10);
        return {
          reply:       MESSAGES.ASK_PAYMENT(calculateTotal(data.details)),
          nextStep:    STEPS.WAITING_PAYMENT,
          nextData:    { ...data, driverId, status: 'ASSIGNED' },
          sideEffects: { saveAssignment: { driverId } },
        };
      }

      if (effective === '4' || /^no\s+s[eé]/i.test(input)) {
        return {
          reply:       MESSAGES.ASK_PAYMENT_NO_DRIVER(calculateTotal(data.details)),
          nextStep:    STEPS.WAITING_PAYMENT,
          nextData:    { ...data, driverId: null, status: 'UNASSIGNED' },
          sideEffects: {},
        };
      }

      return {
        reply:       MESSAGES.INVALID_DRIVER_CHOICE,
        nextStep:    STEPS.WAITING_DRIVER,
        nextData:    data,
        sideEffects: {},
      };
    }

    // ── WAITING_PAYMENT ──────────────────────────────────────────────────────
    case STEPS.WAITING_PAYMENT: {
      const effective = normalizePaymentInput(input);

      if (effective === '1') {
        return {
          reply:       MESSAGES.ASK_NOTES,
          nextStep:    STEPS.WAITING_NOTES,
          nextData:    { ...data, paymentMethod: 'efectivo' },
          sideEffects: {},
        };
      }

      if (effective === '2') {
        return {
          reply:       MESSAGES.ASK_RECEIPT,
          nextStep:    STEPS.WAITING_RECEIPT,
          nextData:    data,
          sideEffects: {},
        };
      }

      return {
        reply:       MESSAGES.INVALID_PAYMENT_CHOICE,
        nextStep:    STEPS.WAITING_PAYMENT,
        nextData:    data,
        sideEffects: {},
      };
    }

    // ── WAITING_RECEIPT ──────────────────────────────────────────────────────
    case STEPS.WAITING_RECEIPT: {
      if (input !== '[comprobante]') {
        return {
          reply:       MESSAGES.RECEIPT_REQUIRED,
          nextStep:    STEPS.WAITING_RECEIPT,
          nextData:    data,
          sideEffects: {},
        };
      }
      return {
        reply:       MESSAGES.ASK_NOTES,
        nextStep:    STEPS.WAITING_NOTES,
        nextData:    { ...data, paymentMethod: 'transferencia' },
        sideEffects: {},
      };
    }

    // ── WAITING_NOTES ────────────────────────────────────────────────────────
    case STEPS.WAITING_NOTES: {
      // Cambio de tamaño en el último momento: "mejor de 12L", "al final de 20"
      const newLiters = detectSizeChange(input);
      if (newLiters) {
        const qty        = extractQty(data.details);
        const word       = qty === 1 ? 'bidón' : 'bidones';
        const newDetails = `${qty} ${word} de ${newLiters} litros`;
        const updatedData = { ...data, details: newDetails, notes: null };
        return {
          reply:       buildOrderSummary(updatedData),
          nextStep:    STEPS.WAITING_CONFIRMATION,
          nextData:    updatedData,
          sideEffects: {},
        };
      }

      const noNotes = /^(no|nop|nope|ninguna|nada|ok|okey|okay|dale|listo|bien|todo bien|ninguno|sin notas|sin nada|paso)[\s.!]*$/i.test(input);
      const notes   = noNotes ? null : input;
      const completeData = { ...data, notes };

      return {
        reply:       buildOrderSummary(completeData),
        nextStep:    STEPS.WAITING_CONFIRMATION,
        nextData:    completeData,
        sideEffects: {},
      };
    }

    // ── WAITING_CONFIRMATION ─────────────────────────────────────────────────
    case STEPS.WAITING_CONFIRMATION: {
      const isConfirm = input === '1'
        || /^(s[ií]|dale|va|ok|okay|okey|confirmo|confirmado|listo|de acuerdo|claro|perfecto|bueno|obvio|metele|mand[aá](?:lo)?|ya\s+est[aá]|anota(?:lo)?|arranca|vamos)[\s.!]*$/i.test(input);
      const isCancel = input === '2'
        || /^(no|cancelar|cancel)[\s.!]*$/i.test(input);

      if (isConfirm) {
        const confirmMsg = data.driverId
          ? MESSAGES.ORDER_REGISTERED_WITH_DRIVER(DRIVERS[data.driverId])
          : MESSAGES.ORDER_REGISTERED_NO_DRIVER;
        return {
          reply:       confirmMsg,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: { createOrder: data },
        };
      }

      if (isCancel) {
        return {
          reply:       MESSAGES.ORDER_CANCELLED,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: {},
        };
      }

      // Cambio de pedido a último momento: "mejor 3 de 12", "cambiá a 2", "en vez de 1 de 20"
      const change = detectOrderChange(input);
      if (change && change.qty > 0 && change.qty <= 50) {
        let newDetails;
        if (change.liters) {
          // Cambia cantidad Y tamaño → reconstruir desde cero
          const word = change.qty === 1 ? 'bidón' : 'bidones';
          newDetails = `${change.qty} ${word} de ${change.liters} litros`;
        } else {
          // Solo cambia cantidad → reemplazar el número inicial y canonicalizar (corrige singular/plural)
          newDetails = canonicalizeDetails(data.details.replace(/^\d+/, String(change.qty)));
        }
        const updatedData = { ...data, details: newDetails };
        return {
          reply:       buildOrderSummary(updatedData),
          nextStep:    STEPS.WAITING_CONFIRMATION,
          nextData:    updatedData,
          sideEffects: {},
        };
      }

      // Expresión de duda: respuesta breve, sin repetir el resumen completo
      if (/^(par[aá]|espera[te]*|un momento|momento|hmm+|hm+|aguant[aá](?:me)?|dame un seg|un seg|pensando|aguarda|ya\s+vengo)[\s.!,]*$/i.test(input)) {
        return {
          reply:       'No hay problema, avisame cuando estés listo.\n1 Confirmar  2 Cancelar',
          nextStep:    STEPS.WAITING_CONFIRMATION,
          nextData:    data,
          sideEffects: {},
        };
      }

      // Respuesta inválida: re-mostrar el resumen
      return {
        reply:       buildOrderSummary(data),
        nextStep:    STEPS.WAITING_CONFIRMATION,
        nextData:    data,
        sideEffects: {},
      };
    }

    // ── WAITING_RESCHEDULE ───────────────────────────────────────────────────
    case STEPS.WAITING_RESCHEDULE: {
      if (/^s[ií]/i.test(input)) {
        return {
          reply:       MESSAGES.RESCHEDULE_CONFIRMED,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: { rescheduleOrder: { orderId: data.orderId } },
        };
      }

      if (/^no/i.test(input)) {
        return {
          reply:       MESSAGES.RESCHEDULE_CANCELLED,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: {},
        };
      }

      return {
        reply:       MESSAGES.RESCHEDULE_NOT_UNDERSTOOD,
        nextStep:    STEPS.WAITING_RESCHEDULE,
        nextData:    data,
        sideEffects: {},
      };
    }

    default:
      return {
        reply:       MESSAGES.ASK_ORDER,
        nextStep:    STEPS.WAITING_ORDER,
        nextData:    {},
        sideEffects: {},
      };
  }
}

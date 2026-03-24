// Constantes globales: repartidores, estados de pedido, pasos de conversación y mensajes del bot

import 'dotenv/config';

export const DRIVERS = {
  1: 'Silvio',
  2: 'Alejandro',
  3: 'Damian',
};

// Teléfonos reales de cada repartidor, configurados via variables de entorno.
// Formato: solo dígitos, sin +. Ej: 5491112345678
export const DRIVER_PHONES = {
  1: process.env.DRIVER_1_PHONE,
  2: process.env.DRIVER_2_PHONE,
  3: process.env.DRIVER_3_PHONE,
};

// Teléfono del administrador (puede asignar pedidos vía WhatsApp)
export const ADMIN_PHONE = process.env.ADMIN_PHONE;

// Chat ID del grupo de administración (para notificaciones de pedidos sin repartidor)
// Formato: XXXXXXXXXX-XXXXXXXXXX@g.us (lo loguea el bot automáticamente)
export const NOTIFY_GROUP_ID = process.env.NOTIFY_GROUP_ID;

// Precio por tamaño de bidón (en pesos)
export const PRICES = {
  20: 4000,
  12: 3500,
};

export const ORDER_STATUS = {
  PENDING:      'PENDING',
  ASSIGNED:     'ASSIGNED',
  DELIVERED:    'DELIVERED',
  NOT_ANSWERED: 'NOT_ANSWERED',
  UNASSIGNED:   'UNASSIGNED',
};

export const STEPS = {
  IDLE:                    'IDLE',
  WAITING_ORDER:           'WAITING_ORDER',
  WAITING_QUANTITY:        'WAITING_QUANTITY',
  WAITING_ADDRESS:         'WAITING_ADDRESS',
  WAITING_DRIVER:          'WAITING_DRIVER',
  WAITING_PAYMENT:         'WAITING_PAYMENT',
  WAITING_RECEIPT:         'WAITING_RECEIPT',
  WAITING_ORDER_SELECTION: 'WAITING_ORDER_SELECTION',
  WAITING_RESCHEDULE:      'WAITING_RESCHEDULE',
  WAITING_SIZE:            'WAITING_SIZE',
  WAITING_NOTES:           'WAITING_NOTES',
  WAITING_CONFIRMATION:    'WAITING_CONFIRMATION',
};

// Traducción de estados internos al español para mostrar al usuario
export const STATUS_LABELS = {
  PENDING:      'Pendiente',
  ASSIGNED:     'Asignado',
  DELIVERED:    'Entregado',
  NOT_ANSWERED: 'No atendió',
  UNASSIGNED:   'Sin asignar',
};

export const MESSAGES = {
  // Mensajes hacia el cliente
  ASK_ORDER:
    '¡Hola! ¿Qué querés pedir hoy?',

  SOCIAL_REPLY:
    '¡Cuando necesites algo, acá estamos!',

  ASK_NOTES:
    '¿Alguna nota para el repartidor? (horario, instrucciones). Si no, respondé No.',

  ASK_ADDRESS:
    '¿A qué dirección lo llevamos?',

  ASK_DRIVER:
    '¿Quién es tu repartidor?\n1 Silvio\n2 Alejandro\n3 Damian\n4 No sé',

  ORDER_REGISTERED_WITH_DRIVER: (driverName) =>
    `¡Perfecto! Tu pedido ya está en manos de ${driverName}. Gracias por elegirnos. 🙌`,

  ORDER_REGISTERED_NO_DRIVER:
    '¡Perfecto! Pedido registrado. Te asignamos un repartidor en breve. Gracias por elegirnos. 🙌',

  ORDER_REGISTERED:
    '¡Perfecto! Tu repartidor lo recibe en breve. Gracias por elegirnos. 🙌',

  ASK_QUANTITY:
    '¿Cuántos bidones querés?',

  INVALID_QUANTITY:
    'Indicá solo la cantidad, por ejemplo: 2',

  ASK_PAYMENT: (total) =>
    `Total: $${total.toLocaleString('es-AR')}\n\n¿Cómo abonás?\n1 Efectivo\n2 Transferencia`,

  ASK_PAYMENT_NO_DRIVER: (total) =>
    `Sin problema, te asignamos un repartidor.\n\nTotal: $${total.toLocaleString('es-AR')}\n\n¿Cómo abonás?\n1 Efectivo\n2 Transferencia`,

  INVALID_PAYMENT_CHOICE:
    'Respondé 1 (Efectivo) o 2 (Transferencia).',

  ASK_RECEIPT:
    'Enviá el comprobante de la transferencia.',

  RECEIPT_REQUIRED:
    'Solo se acepta imagen del comprobante, no texto.',

  ASK_RESCHEDULE:
    'El repartidor pasó pero nadie atendió. ¿Reprogramamos la entrega?',

  RESCHEDULE_CONFIRMED:
    'Listo, le avisamos al repartidor.',

  RESCHEDULE_CANCELLED:
    'Entendido. Escribinos cuando quieras.',

  RESCHEDULE_NOT_UNDERSTOOD:
    'Respondé Sí o No.',

  INVALID_DRIVER_CHOICE:
    'Respondé con 1 (Silvio), 2 (Alejandro), 3 (Damian) o 4 (No sé).',

  ASK_SIZE:
    '¿De qué tamaño los querés?\n1 De 12 litros — $3.500\n2 De 20 litros — $4.000',

  INVALID_SIZE_CHOICE:
    'Elegí 1 (12 litros) o 2 (20 litros).',

  INVALID_ADDRESS:
    'Indicá la dirección completa con calle y número (ej: Corrientes 1234).',

  ORDER_CANCELLED:
    'Pedido cancelado. Cuando quieras pedir algo, escribinos.',

  ORDER_SUMMARY: ({ details, address, driverName, paymentMethod, notes, total }) => {
    const pago      = paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo';
    const safeAddr  = address.replace(/\n/g, ' ').trim();
    const notesLine = notes ? `\nNota: ${notes}` : '';
    return `Resumen del pedido:\n📦 ${details}\n📍 ${safeAddr}\n🛵 ${driverName}\n💳 ${pago} — $${total.toLocaleString('es-AR')}${notesLine}\n\n¿Confirmás?\n1 Sí, confirmar\n2 Cancelar`;
  },

  // Mensajes hacia el repartidor
  NEW_ORDER_NOTIFICATION: (order) => {
    const pago  = order.metodo_pago === 'transferencia' ? 'Transferencia ✓' : 'Efectivo';
    const notas = order.nota ? `\nNota: ${order.nota}` : '';
    return `🛵 Nuevo pedido #${order.id}\nCliente: ${order.cliente}\nDirección: ${order.direccion}\nPedido: ${order.producto}${notas}\nPago: ${pago}\n\nRespondé:\n1 Entregado\n2 No atendió\n3 Reprogramar`;
  },

  ORDER_STATUS_UPDATED: (orderId, status) =>
    `Pedido #${orderId} marcado como: ${STATUS_LABELS[status] ?? status}`,

  DRIVER_AMBIGUOUS_ORDERS: (ids) =>
    `¿A cuál pedido te referís? Tenés activos: ${ids.map((id) => `#${id}`).join(', ')}`,

  DRIVER_NO_ACTIVE_ORDERS:
    'No tenés pedidos activos por el momento.',

  DRIVER_INVALID_RESPONSE:
    'No entendí. Respondé con 1 (Entregado), 2 (No atendió) o 3 (Reprogramar).',

  DRIVER_INVALID_ORDER_SELECTION: (ids) =>
    `No reconozco ese número. Respondé con uno de estos: ${ids.map((id) => `#${id}`).join(', ')}`,

  // Notificación al grupo de admin cuando un pedido queda sin repartidor
  UNASSIGNED_ORDER_NOTIFICATION: (order) =>
    `⚠️ Pedido sin repartidor #${order.id}\nCliente: ${order.cliente}\nDirección: ${order.direccion}\nPedido: ${order.producto}\nPago: ${order.metodo_pago === 'transferencia' ? 'Transferencia ✓' : 'Efectivo'}\n\nCitá este mensaje y respondé con:\n1 Silvio\n2 Alejandro\n3 Damian`,

  // Mensajes del administrador
  ADMIN_ASSIGN_SUCCESS: (orderId, driverName, clientPhone) =>
    `✅ Pedido #${orderId} asignado a ${driverName}. Se notificó al repartidor.\nCliente: ${clientPhone}`,

  ADMIN_ASSIGN_NOT_FOUND: (orderId) =>
    `❌ No encontré el pedido #${orderId}.`,

  ADMIN_ASSIGN_INVALID_DRIVER:
    '❌ Repartidor inválido. Usá 1 (Silvio), 2 (Alejandro) o 3 (Damian).',

  ADMIN_HELP:
    'Comandos disponibles:\n\nasignar #<pedido> <repartidor>\nEjemplo: asignar #5 2\n\nRepartidores:\n1 Silvio\n2 Alejandro\n3 Damian',

  // Horario cerrado
  CLOSED_FOR_TODAY:
    '¡Hola! Por hoy ya cerramos los pedidos. Podés escribirnos mañana y con gusto te atendemos. 🙏',

  // Recordatorio diario
  REMINDER_HEADER:
    '🗒️ Buenos días! Estos son tus pedidos pendientes para hoy:',

  REMINDER_LINE: (order) =>
    `• #${order.id} — ${order.direccion} — ${order.producto}`,
};

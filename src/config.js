// Constantes globales: repartidores, estados de pedido, pasos de conversación y mensajes del bot

export const DRIVERS = {
  1: 'Silvio',
  2: 'Alejandro',
  3: 'Damian',
};

// Números de teléfono simulados de cada repartidor (usados por el simulador)
export const DRIVER_PHONES = {
  1: 'driver_1',
  2: 'driver_2',
  3: 'driver_3',
};

export const ORDER_STATUS = {
  PENDING:      'PENDING',
  ASSIGNED:     'ASSIGNED',
  DELIVERED:    'DELIVERED',
  NOT_ANSWERED: 'NOT_ANSWERED',
  UNASSIGNED:   'UNASSIGNED',
};

export const STEPS = {
  IDLE:            'IDLE',
  WAITING_ORDER:   'WAITING_ORDER',
  WAITING_ADDRESS: 'WAITING_ADDRESS',
  WAITING_DRIVER:  'WAITING_DRIVER',
};

export const MESSAGES = {
  // Mensajes hacia el cliente
  ASK_ORDER:
    '¡Hola! ¿Qué querés pedir?',

  ASK_ADDRESS:
    '¿Cuál es tu dirección?',

  ASK_DRIVER:
    '¿Quién es tu repartidor?\n1 Silvio\n2 Alejandro\n3 Damian\n4 No sé',

  ORDER_REGISTERED_WITH_DRIVER: (driverName) =>
    `Pedido registrado. Tu repartidor ${driverName} lo recibirá pronto.`,

  ORDER_REGISTERED_NO_DRIVER:
    'Pedido registrado. Lo asignaremos pronto.',

  ORDER_REGISTERED:
    'Pedido registrado.',

  INVALID_DRIVER_CHOICE:
    'Respondé solo con 1, 2, 3 o 4.',

  // Mensajes hacia el repartidor
  NEW_ORDER_NOTIFICATION: (order) =>
    `Nuevo pedido #${order.id}\nCliente: ${order.client_phone}\nDirección: ${order.address}\nPedido: ${order.details}\nRespondé:\n1 Entregado\n2 No atendió\n3 Reprogramar`,

  ORDER_STATUS_UPDATED: (orderId, status) =>
    `Pedido #${orderId} actualizado a: ${status}`,

  DRIVER_AMBIGUOUS_ORDERS: (ids) =>
    `¿A qué pedido te referís? ${ids.map((id) => `#${id}`).join(', ')}`,

  DRIVER_NO_ACTIVE_ORDERS:
    'No tenés pedidos activos en este momento.',

  DRIVER_INVALID_RESPONSE:
    'Respondé con 1 (Entregado), 2 (No atendió) o 3 (Reprogramar).',

  // Recordatorio diario
  REMINDER_HEADER:
    'Recordatorio de pedidos pendientes:',

  REMINDER_LINE: (order) =>
    `#${order.id} — ${order.address} — ${order.details}`,
};

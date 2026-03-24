export interface Pedido {
  id: number;
  cliente: string | null;
  producto: string;
  direccion: string;
  driver_id: number | null;
  repartidor: string | null;
  metodo_pago: string;
  total: number;
  nota: string | null;
  estado: string;
  origen: string;
  created_at: string;
  updated_at: string;
}

export type NuevoPedidoForm = {
  cliente: string;
  cantidad: number;
  size: '20' | '12';
  direccion: string;
  repartidor: string;
  metodo_pago: string;
  nota: string;
};

// Mapeo visual de estados internos del bot
export const ESTADO_LABELS: Record<string, string> = {
  PENDING:      'Pendiente',
  ASSIGNED:     'En camino',
  DELIVERED:    'Entregado',
  NOT_ANSWERED: 'No atendió',
  UNASSIGNED:   'Sin repartidor',
};

export const ESTADO_BADGE: Record<string, string> = {
  PENDING:      'bg-amber-100 text-amber-800 border border-amber-300',
  ASSIGNED:     'bg-blue-100 text-blue-800 border border-blue-300',
  DELIVERED:    'bg-green-100 text-green-800 border border-green-300',
  NOT_ANSWERED: 'bg-red-100 text-red-800 border border-red-300',
  UNASSIGNED:   'bg-orange-100 text-orange-800 border border-orange-300',
};

// Estados que aún requieren acción
export const ESTADOS_ACTIVOS = ['PENDING', 'ASSIGNED', 'NOT_ANSWERED', 'UNASSIGNED'];

export const PRECIOS: Record<string, number> = { '20': 4000, '12': 3500 };

export const REPARTIDORES = ['Silvio', 'Alejandro', 'Damian'];

export const DRIVER_ID_MAP: Record<string, number> = {
  Silvio: 1, Alejandro: 2, Damian: 3,
};

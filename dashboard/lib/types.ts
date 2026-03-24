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

export interface ConfiguracionItem {
  clave: string;
  valor: number;
}

export interface FechaCerrada {
  fecha: string; // YYYY-MM-DD
  motivo: string;
}

export type ProductoTipo = 'sifon_soda' | 'bidon_5l' | 'bidon_8l' | 'bidon_10l' | 'bidon_12l' | 'bidon_20l';

export type NuevoPedidoForm = {
  cliente:      string;
  producto_tipo: ProductoTipo;
  cantidad:     number;
  direccion:    string;
  repartidor:   string;
  metodo_pago:  string;
  nota:         string;
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

// Precios default — el modal los reemplaza con los valores reales de Supabase
export const PRECIOS_DEFAULT: Record<ProductoTipo, number> = {
  sifon_soda: 1000,
  bidon_5l:   1800,
  bidon_8l:   2600,
  bidon_10l:  2500,
  bidon_12l:  3500,
  bidon_20l:  4000,
};

export const PRODUCTO_LABELS: Record<ProductoTipo, string> = {
  sifon_soda: 'Sifón de soda',
  bidon_5l:   'Bidón 5 litros',
  bidon_8l:   'Bidón 8 litros',
  bidon_10l:  'Bidón 10 litros',
  bidon_12l:  'Bidón 12 litros',
  bidon_20l:  'Bidón 20 litros',
};

export const PRODUCTOS_ORDEN: ProductoTipo[] = [
  'sifon_soda', 'bidon_5l', 'bidon_8l', 'bidon_10l', 'bidon_12l', 'bidon_20l',
];

/** Genera el string de producto para guardar en la BD (igual al formato del bot). */
export function buildProductoString(tipo: ProductoTipo, cantidad: number): string {
  if (tipo === 'sifon_soda') {
    const word = cantidad === 1 ? 'sifón' : 'sifones';
    return `${cantidad} ${word} de soda`;
  }
  const litrosMap: Record<string, string> = {
    bidon_5l: '5', bidon_8l: '8', bidon_10l: '10', bidon_12l: '12', bidon_20l: '20',
  };
  const word = cantidad === 1 ? 'bidón' : 'bidones';
  return `${cantidad} ${word} de ${litrosMap[tipo]} litros`;
}

export const REPARTIDORES = ['Silvio', 'Alejandro', 'Damian'];

export const DRIVER_ID_MAP: Record<string, number> = {
  Silvio: 1, Alejandro: 2, Damian: 3,
};

'use client';

import { CheckCircle, MapPin, User, CreditCard, MessageSquare, Phone, Bot } from 'lucide-react';
import {
  Pedido,
  ESTADO_LABELS,
  ESTADO_BADGE,
  ESTADOS_ACTIVOS,
} from '@/lib/types';

interface Props {
  pedido: Pedido;
  onMarkDelivered: (id: number) => void;
  loading: boolean;
}

function formatHora(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Color del borde izquierdo según estado
function getBorderColor(estado: string): string {
  const map: Record<string, string> = {
    PENDING:      'border-l-amber-400',
    ASSIGNED:     'border-l-blue-400',
    DELIVERED:    'border-l-green-400',
    NOT_ANSWERED: 'border-l-red-400',
    UNASSIGNED:   'border-l-orange-400',
  };
  return map[estado] ?? 'border-l-gray-300';
}

function getBgColor(estado: string): string {
  if (estado === 'DELIVERED') return 'bg-gray-50 opacity-70';
  if (estado === 'NOT_ANSWERED') return 'bg-red-50';
  return 'bg-amber-50';
}

export default function OrderCard({ pedido, onMarkDelivered, loading }: Props) {
  const estadoLabel = ESTADO_LABELS[pedido.estado] ?? pedido.estado;
  const estadoBadge = ESTADO_BADGE[pedido.estado] ?? 'bg-gray-100 text-gray-800';
  const borderColor = getBorderColor(pedido.estado);
  const bgColor     = getBgColor(pedido.estado);
  const esActivo    = ESTADOS_ACTIVOS.includes(pedido.estado);

  return (
    <div className={`rounded-xl border-l-8 ${borderColor} ${bgColor} shadow-sm p-5 transition-all`}>

      {/* Fila superior: hora, origen, estado */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-2xl font-bold text-gray-700">
          🕐 {formatHora(pedido.created_at)}
        </span>

        {/* Origen */}
        <span className="flex items-center gap-1 text-base text-gray-500 bg-white border rounded-full px-3 py-1">
          {pedido.origen === 'telefono'
            ? <><Phone className="w-4 h-4" /> Teléfono</>
            : <><Bot className="w-4 h-4" /> WhatsApp</>}
        </span>

        {/* Estado badge */}
        <span className={`text-base font-bold px-3 py-1 rounded-full ${estadoBadge}`}>
          {estadoLabel}
        </span>
      </div>

      {/* Datos del pedido */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">

        {/* Cliente */}
        <div className="flex items-center gap-2 text-lg text-gray-700">
          <User className="w-5 h-5 text-gray-400 shrink-0" />
          <span>{pedido.cliente || '—'}</span>
        </div>

        {/* Producto — el campo estrella, en negrita y grande */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">📦</span>
          <span className="text-xl font-bold text-gray-900">{pedido.producto}</span>
        </div>

        {/* Dirección */}
        <div className="flex items-center gap-2 text-lg text-gray-700 md:col-span-2">
          <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
          <span>{pedido.direccion}</span>
        </div>

        {/* Repartidor */}
        <div className="flex items-center gap-2 text-lg text-gray-700">
          <span className="text-xl">🛵</span>
          <span>{pedido.repartidor || 'Sin asignar'}</span>
        </div>

        {/* Pago y total */}
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="text-lg text-gray-700">
            {pedido.metodo_pago === 'transferencia' ? 'Transferencia' : 'Efectivo'}
          </span>
          <span className="text-xl font-bold text-green-700">
            ${(pedido.total ?? 0).toLocaleString('es-AR')}
          </span>
        </div>

        {/* Nota (si existe) */}
        {pedido.nota && (
          <div className="flex items-start gap-2 text-base text-gray-500 md:col-span-2">
            <MessageSquare className="w-4 h-4 mt-1 shrink-0" />
            <span className="italic">{pedido.nota}</span>
          </div>
        )}
      </div>

      {/* Botón acción */}
      {esActivo && (
        <button
          onClick={() => onMarkDelivered(pedido.id)}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                     text-white text-xl font-bold py-4 rounded-xl flex items-center justify-center gap-3
                     transition-colors shadow"
        >
          <CheckCircle className="w-7 h-7" />
          {loading ? 'Guardando...' : '✅ Marcar como ENTREGADO'}
        </button>
      )}

    </div>
  );
}

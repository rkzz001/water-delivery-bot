'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Pedido, ESTADOS_ACTIVOS } from '@/lib/types';
import OrderList from './OrderList';

function todayArgentina(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function getDayRange(dateStr: string): { start: string; end: string } {
  return {
    start: new Date(dateStr + 'T00:00:00-03:00').toISOString(),
    end:   new Date(dateStr + 'T23:59:59.999-03:00').toISOString(),
  };
}

export default function HistorialModal({ onClose }: { onClose: () => void }) {
  const [fecha,   setFecha]   = useState(todayArgentina());
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const { start, end } = getDayRange(fecha);
    supabase
      .from('pedidos')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPedidos(data ?? []); setLoading(false); });
  }, [fecha]);

  const recaudacion = pedidos
    .filter((p) => p.estado === 'DELIVERED')
    .reduce((acc, p) => acc + (p.total ?? 0), 0);
  const pendientes = pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b gap-4">
          <h2 className="text-2xl font-bold text-gray-800">📅 Historial</h2>
          <div className="flex items-center gap-3 ml-auto">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="border-2 border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-blue-400"
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-7 h-7" />
            </button>
          </div>
        </div>

        {/* KPIs del día */}
        <div className="flex gap-8 px-6 py-4 border-b bg-gray-50">
          <div className="text-center">
            <p className="text-3xl font-black text-blue-600">{pedidos.length}</p>
            <p className="text-sm text-gray-500 mt-0.5">Pedidos</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-black text-green-600">
              ${recaudacion.toLocaleString('es-AR')}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">Recaudado</p>
          </div>
          <div className="text-center">
            <p className={`text-3xl font-black ${pendientes > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
              {pendientes}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">Pendientes</p>
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="text-center py-16 text-gray-400 animate-pulse text-xl">Cargando...</div>
          ) : pedidos.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-xl">
              No hay pedidos para esta fecha.
            </div>
          ) : (
            <OrderList pedidos={pedidos} onUpdate={(updated) =>
              setPedidos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            } />
          )}
        </div>

      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, PlusCircle, DollarSign, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Pedido, ESTADOS_ACTIVOS } from '@/lib/types';
import KPICards from './KPICards';
import OrderList from './OrderList';
import NewOrderModal from './NewOrderModal';
import PreciosModal from './PreciosModal';
import CalendarioModal from './CalendarioModal';

function getTodayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Dashboard() {
  const [pedidos, setPedidos]               = useState<Pedido[]>([]);
  const [loading, setLoading]               = useState(true);
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [isPreciosOpen, setIsPreciosOpen]   = useState(false);
  const [isCalendarioOpen, setIsCalendario] = useState(false);

  // ── Carga inicial de pedidos de hoy ───────────────────────────────────────
  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .gte('created_at', getTodayStart())
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar los pedidos');
    } else {
      setPedidos(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // ── Realtime: INSERT y UPDATE en tabla pedidos ────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('pedidos-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        (payload) => {
          const nuevo = payload.new as Pedido;
          setPedidos((prev) => [nuevo, ...prev]);
          toast.success(
            `🛵 Nuevo pedido — ${nuevo.producto}`,
            { description: nuevo.direccion, duration: 6000 },
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        (payload) => {
          const actualizado = payload.new as Pedido;
          setPedidos((prev) =>
            prev.map((p) => (p.id === actualizado.id ? actualizado : p)),
          );
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Conectado a pedidos');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Actualización local cuando OrderList hace UPDATE ─────────────────────
  function handleUpdate(updated: Pedido) {
    setPedidos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const pendientes   = pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length;
  const recaudacion  = pedidos
    .filter((p) => p.estado === 'DELIVERED')
    .reduce((acc, p) => acc + (p.total ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Header ── */}
      <header className="bg-white border-b shadow-sm px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-900">🥤 Zurutuza Pedidos</h1>
            <p className="text-lg text-gray-500">Panel de Pedidos del Día</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsPreciosOpen(true)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 border rounded-xl px-4 py-2 text-base font-semibold"
            >
              <DollarSign className="w-5 h-5" />
              Precios
            </button>
            <button
              onClick={() => setIsCalendario(true)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 border rounded-xl px-4 py-2 text-base font-semibold"
            >
              <Calendar className="w-5 h-5" />
              Calendario
            </button>
            <button
              onClick={fetchPedidos}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-700 border rounded-xl px-4 py-2 text-base"
            >
              <RefreshCw className="w-5 h-5" />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ── KPIs ── */}
        <KPICards
          pedidosHoy={pedidos.length}
          pendientes={pendientes}
          recaudacion={recaudacion}
        />

        {/* ── Botón nuevo pedido + estado realtime ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700
                       text-white text-xl font-bold px-8 py-5 rounded-2xl shadow-lg transition-colors"
          >
            <PlusCircle className="w-7 h-7" />
            NUEVO PEDIDO POR TELÉFONO
          </button>

          <p className="text-base text-gray-400 text-center sm:text-right">
            🟢 Actualizando en tiempo real
          </p>
        </div>

        {/* ── Lista de pedidos ── */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-5xl mb-4 animate-pulse">⏳</p>
            <p className="text-2xl">Cargando pedidos...</p>
          </div>
        ) : (
          <OrderList pedidos={pedidos} onUpdate={handleUpdate} />
        )}

      </main>

      {/* ── Modales ── */}
      {isModalOpen && (
        <NewOrderModal
          onClose={() => setIsModalOpen(false)}
          onCreated={fetchPedidos}
        />
      )}
      {isPreciosOpen   && <PreciosModal   onClose={() => setIsPreciosOpen(false)} />}
      {isCalendarioOpen && <CalendarioModal onClose={() => setIsCalendario(false)} />}
    </div>
  );
}

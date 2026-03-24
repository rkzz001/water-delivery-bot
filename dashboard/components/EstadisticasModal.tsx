'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Pedido } from '@/lib/types';

type Periodo = 7 | 30 | 90;

function getLabel(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(day)}/${parseInt(month)}`;
}

function categorizeProduct(producto: string): string {
  if (/sif[oó]n/i.test(producto))     return 'Sifón de soda';
  if (/5 litros/i.test(producto))     return 'Bidón 5L';
  if (/8 litros/i.test(producto))     return 'Bidón 8L';
  if (/10 litros/i.test(producto))    return 'Bidón 10L';
  if (/12 litros/i.test(producto))    return 'Bidón 12L';
  if (/20 litros/i.test(producto))    return 'Bidón 20L';
  return producto;
}

export default function EstadisticasModal({ onClose }: { onClose: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>(7);

  useEffect(() => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - periodo);
    supabase
      .from('pedidos')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .then(({ data }) => { setPedidos(data ?? []); setLoading(false); });
  }, [periodo]);

  // ── Calcular métricas ──────────────────────────────────────────────────────

  const entregados = pedidos.filter((p) => p.estado === 'DELIVERED');
  const totalRecaudado = entregados.reduce((acc, p) => acc + (p.total ?? 0), 0);
  const promedioDia = periodo > 0 ? Math.round(totalRecaudado / periodo) : 0;

  // Generar array de los últimos N días (UTC date string)
  const dias: string[] = [];
  for (let i = periodo - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }

  const revByDay: Record<string, number> = {};
  const countByDay: Record<string, number> = {};
  for (const p of pedidos) {
    const day = p.created_at.slice(0, 10);
    countByDay[day] = (countByDay[day] ?? 0) + 1;
    if (p.estado === 'DELIVERED') {
      revByDay[day] = (revByDay[day] ?? 0) + (p.total ?? 0);
    }
  }
  const maxRev = Math.max(...dias.map((d) => revByDay[d] ?? 0), 1);

  // Por producto
  const byProduct: Record<string, number> = {};
  for (const p of pedidos) {
    const cat = categorizeProduct(p.producto);
    byProduct[cat] = (byProduct[cat] ?? 0) + 1;
  }
  const productEntries = Object.entries(byProduct).sort((a, b) => b[1] - a[1]);
  const maxProduct = Math.max(...productEntries.map(([, n]) => n), 1);

  // Por repartidor
  const byDriver: Record<string, number> = {};
  for (const p of entregados) {
    const name = p.repartidor ?? 'Sin asignar';
    byDriver[name] = (byDriver[name] ?? 0) + 1;
  }
  const driverEntries = Object.entries(byDriver).sort((a, b) => b[1] - a[1]);
  const maxDriver = Math.max(...driverEntries.map(([, n]) => n), 1);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">📊 Estadísticas</h2>
          <div className="flex items-center gap-3">
            {([7, 30, 90] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-4 py-1.5 rounded-xl font-semibold text-base transition-colors ${
                  periodo === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p}d
              </button>
            ))}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
              <X className="w-7 h-7" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-6">
          {loading ? (
            <div className="text-center py-20 text-gray-400 animate-pulse text-xl">Cargando...</div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-blue-600">{pedidos.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Pedidos totales</p>
                </div>
                <div className="bg-green-50 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-green-600">
                    ${totalRecaudado.toLocaleString('es-AR')}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Recaudado</p>
                </div>
                <div className="bg-purple-50 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-purple-600">
                    ${promedioDia.toLocaleString('es-AR')}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Promedio/día</p>
                </div>
              </div>

              {/* Recaudación por día */}
              <div>
                <h3 className="text-base font-bold text-gray-600 mb-3 uppercase tracking-wide">
                  Recaudación por día
                </h3>
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {dias.map((day) => {
                    const rev = revByDay[day] ?? 0;
                    const pct = Math.round((rev / maxRev) * 100);
                    return (
                      <div key={day} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-12 text-right shrink-0">
                          {getLabel(day)}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-green-500 h-5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-600 w-20 text-right shrink-0">
                          {rev > 0 ? `$${rev.toLocaleString('es-AR')}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dos columnas: productos y repartidores */}
              <div className="grid grid-cols-2 gap-6">

                {/* Por producto */}
                <div>
                  <h3 className="text-base font-bold text-gray-600 mb-3 uppercase tracking-wide">
                    Por producto
                  </h3>
                  <div className="flex flex-col gap-2">
                    {productEntries.map(([label, count]) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium">{label}</span>
                          <span className="text-gray-500 font-bold">{count}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${Math.round((count / maxProduct) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {productEntries.length === 0 && (
                      <p className="text-gray-400 text-sm">Sin datos</p>
                    )}
                  </div>
                </div>

                {/* Por repartidor */}
                <div>
                  <h3 className="text-base font-bold text-gray-600 mb-3 uppercase tracking-wide">
                    Por repartidor
                  </h3>
                  <div className="flex flex-col gap-2">
                    {driverEntries.map(([name, count]) => (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium">{name}</span>
                          <span className="text-gray-500 font-bold">{count}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-amber-500 h-2 rounded-full"
                            style={{ width: `${Math.round((count / maxDriver) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {driverEntries.length === 0 && (
                      <p className="text-gray-400 text-sm">Sin datos</p>
                    )}
                  </div>
                </div>

              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

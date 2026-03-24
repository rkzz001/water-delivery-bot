'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PRECIOS_DEFAULT, PRODUCTO_LABELS, PRODUCTOS_ORDEN, ProductoTipo } from '@/lib/types';

interface Props {
  onClose: () => void;
}

export default function PreciosModal({ onClose }: Props) {
  const [inputValues, setInputValues] = useState<Record<string, string>>(
    () => ({
      ...Object.fromEntries(Object.entries(PRECIOS_DEFAULT).map(([k, v]) => [k, String(v)])),
      hora_corte: '14',
    })
  );
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);

  useEffect(() => {
    supabase.from('configuracion').select('clave, valor').then(({ data }) => {
      if (data?.length) {
        const map: Record<string, string> = Object.fromEntries(
          Object.entries(PRECIOS_DEFAULT).map(([k, v]) => [k, String(v)])
        );
        for (const row of data) map[row.clave] = String(row.valor);
        setInputValues(map);
      }
      setLoading(false);
    });
  }, []);

  function handleChange(clave: string, value: string) {
    setInputValues((prev) => ({ ...prev, [clave]: value }));
  }

  async function handleSave() {
    const rows: { clave: string; valor: number }[] = [];
    for (const [clave, raw] of Object.entries(inputValues)) {
      const num = parseInt(raw, 10);
      if (clave === 'hora_corte') {
        if (isNaN(num) || num < 0 || num > 23) {
          toast.error('❌ La hora de corte debe ser entre 0 y 23');
          return;
        }
      } else if (isNaN(num) || num < 0) {
        toast.error(`❌ Precio inválido para ${clave}`);
        return;
      }
      rows.push({ clave, valor: num });
    }

    setSaving(true);
    const { error } = await supabase
      .from('configuracion')
      .upsert(rows, { onConflict: 'clave' });

    setSaving(false);
    if (error) {
      toast.error(`❌ Error al guardar: ${error.message}`);
    } else {
      toast.success('✅ Configuración actualizada');
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">⚙️ Precios y Horario</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-7 h-7" />
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-400 text-xl animate-pulse">Cargando...</div>
        ) : (
          <div className="p-6 flex flex-col gap-4">
            {PRODUCTOS_ORDEN.map((tipo: ProductoTipo) => (
              <div key={tipo} className="flex items-center justify-between gap-4">
                <label className="text-lg font-semibold text-gray-700 flex-1">
                  {PRODUCTO_LABELS[tipo]}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-500">$</span>
                  <input
                    type="number"
                    value={inputValues[tipo] ?? ''}
                    onChange={(e) => handleChange(tipo, e.target.value)}
                    min={0}
                    className="w-32 border-2 border-gray-200 rounded-xl px-3 py-3 text-xl font-bold text-gray-900 text-right focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            ))}

            {/* Hora de corte */}
            <div className="border-t pt-4 mt-1 flex items-center justify-between gap-4">
              <label className="text-lg font-semibold text-gray-700 flex-1">
                Atender hasta las...
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={inputValues['hora_corte'] ?? '14'}
                  onChange={(e) => handleChange('hora_corte', e.target.value)}
                  min={0} max={23}
                  className="w-20 border-2 border-gray-200 rounded-xl px-3 py-3 text-xl font-bold text-gray-900 text-right focus:outline-none focus:border-blue-400"
                />
                <span className="text-xl font-bold text-gray-500">hs</span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xl font-semibold py-4 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xl font-bold py-4 rounded-xl transition-colors"
              >
                {saving ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

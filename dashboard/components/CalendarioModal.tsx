'use client';

import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { FechaCerrada } from '@/lib/types';

interface Props {
  onClose: () => void;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarioModal({ onClose }: Props) {
  const hoy                              = new Date();
  const [year, setYear]                  = useState(hoy.getFullYear());
  const [month, setMonth]                = useState(hoy.getMonth());
  const [fechasCerradas, setFechasCerradas] = useState<FechaCerrada[]>([]);
  const [selectedDate, setSelectedDate]  = useState<string | null>(null);
  const [motivoInput, setMotivoInput]    = useState('Feriado');
  const [loading, setLoading]            = useState(true);

  useEffect(() => {
    supabase.from('fechas_cerrado').select('fecha, motivo').order('fecha')
      .then(({ data }) => {
        setFechasCerradas(data ?? []);
        setLoading(false);
      });
  }, []);

  const cerradasSet = new Set(fechasCerradas.map((f) => f.fecha));

  // Construir grilla del calendario (semanas de lunes a domingo)
  const firstDOW = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDOW).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = toDateStr(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function handleDayClick(day: number) {
    const dateStr = toDateStr(year, month, day);
    if (cerradasSet.has(dateStr)) {
      removeFecha(dateStr);
    } else {
      setSelectedDate(dateStr);
      setMotivoInput('Feriado');
    }
  }

  async function addFecha() {
    if (!selectedDate) return;
    const motivo = motivoInput.trim() || 'Feriado';
    const { error } = await supabase.from('fechas_cerrado').insert({ fecha: selectedDate, motivo });
    if (error) {
      toast.error('Error al guardar la fecha');
      return;
    }
    setFechasCerradas((prev) =>
      [...prev, { fecha: selectedDate, motivo }].sort((a, b) => a.fecha.localeCompare(b.fecha))
    );
    toast.success(`📅 ${selectedDate} marcado como no laborable`);
    setSelectedDate(null);
  }

  async function removeFecha(dateStr: string) {
    const { error } = await supabase.from('fechas_cerrado').delete().eq('fecha', dateStr);
    if (error) { toast.error('Error al eliminar la fecha'); return; }
    setFechasCerradas((prev) => prev.filter((f) => f.fecha !== dateStr));
    toast.success(`✅ ${dateStr} habilitado nuevamente`);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">📅 Días No Laborables</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-7 h-7" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-10 text-center text-gray-400 text-xl animate-pulse">Cargando...</div>
          ) : (
            <>
              {/* Navegación de mes */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>
                <span className="text-xl font-bold text-gray-800">
                  {MESES[month]} {year}
                </span>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronRight className="w-6 h-6 text-gray-600" />
                </button>
              </div>

              {/* Cabecera días */}
              <div className="grid grid-cols-7 mb-1">
                {DIAS.map((d) => (
                  <div key={d} className="text-center text-sm font-semibold text-gray-500 py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Grilla */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr  = toDateStr(year, month, day);
                  const isClosed = cerradasSet.has(dateStr);
                  const isToday  = dateStr === todayStr;
                  return (
                    <button
                      key={i}
                      onClick={() => handleDayClick(day)}
                      className={[
                        'rounded-lg py-2 text-base font-semibold transition-colors',
                        isClosed
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : isToday
                            ? 'bg-blue-100 text-blue-800 hover:bg-red-100'
                            : 'hover:bg-red-100 text-gray-700',
                      ].join(' ')}
                      title={isClosed ? `Cerrado — ${fechasCerradas.find(f => f.fecha === dateStr)?.motivo}` : 'Clic para marcar como no laborable'}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Leyenda */}
              <div className="flex gap-4 mt-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-red-500 inline-block" /> No laborable
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-blue-100 inline-block" /> Hoy
                </span>
              </div>

              {/* Panel para agregar motivo */}
              {selectedDate && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-base font-semibold text-red-800 mb-2">
                    Marcar {selectedDate} como no laborable
                  </p>
                  <input
                    type="text"
                    value={motivoInput}
                    onChange={(e) => setMotivoInput(e.target.value)}
                    placeholder="Motivo (ej: Feriado nacional)"
                    className="w-full border-2 border-red-200 rounded-xl px-4 py-2 text-base text-gray-900 focus:outline-none focus:border-red-400 mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-xl"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addFecha}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-xl"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

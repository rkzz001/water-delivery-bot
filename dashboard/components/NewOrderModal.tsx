'use client';

import { useState, FormEvent } from 'react';
import { X } from 'lucide-react';
import { NuevoPedidoForm, REPARTIDORES, PRECIOS, DRIVER_ID_MAP } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const FORM_INICIAL: NuevoPedidoForm = {
  cliente:     '',
  cantidad:    1,
  size:        '20',
  direccion:   '',
  repartidor:  'Silvio',
  metodo_pago: 'efectivo',
  nota:        '',
};

export default function NewOrderModal({ onClose, onCreated }: Props) {
  const [form, setForm]       = useState<NuevoPedidoForm>(FORM_INICIAL);
  const [loading, setLoading] = useState(false);

  const total    = form.cantidad * PRECIOS[form.size];
  const palabra  = form.cantidad === 1 ? 'bidón' : 'bidones';
  const producto = `${form.cantidad} ${palabra} de ${form.size} litros`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'cantidad' ? Math.max(1, parseInt(value) || 1) : value,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.direccion.trim()) {
      toast.error('La dirección es obligatoria');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('pedidos').insert({
      cliente:     form.cliente.trim() || 'Pedido telefónico',
      producto,
      direccion:   form.direccion.trim(),
      driver_id:   DRIVER_ID_MAP[form.repartidor] ?? null,
      repartidor:  form.repartidor,
      metodo_pago: form.metodo_pago,
      total,
      nota:        form.nota.trim() || null,
      estado:      'PENDING',
      origen:      'telefono',
    });

    setLoading(false);

    if (error) {
      toast.error('❌ Error al guardar el pedido');
      return;
    }

    toast.success(`✅ Pedido cargado: ${producto}`);
    onCreated();
    onClose();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">📞 Nuevo Pedido por Teléfono</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">

          {/* Teléfono / nombre cliente */}
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1">
              Teléfono del cliente <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              name="cliente"
              value={form.cliente}
              onChange={handleChange}
              placeholder="Ej: 5492396432617"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Cantidad + Tamaño en la misma fila */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-lg font-semibold text-gray-700 mb-1">Cantidad</label>
              <input
                type="number"
                name="cantidad"
                value={form.cantidad}
                onChange={handleChange}
                min={1}
                max={20}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-xl font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-lg font-semibold text-gray-700 mb-1">Tamaño</label>
              <select
                name="size"
                value={form.size}
                onChange={handleChange}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 focus:outline-none focus:border-blue-400"
              >
                <option value="20">20 litros — $4.000</option>
                <option value="12">12 litros — $3.500</option>
              </select>
            </div>
          </div>

          {/* Preview del pedido */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <p className="text-lg text-blue-600">Pedido:</p>
            <p className="text-2xl font-black text-blue-800">{producto}</p>
            <p className="text-2xl font-bold text-green-700 mt-1">${total.toLocaleString('es-AR')}</p>
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1">
              Dirección <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="direccion"
              value={form.direccion}
              onChange={handleChange}
              placeholder="Ej: Corrientes 1234"
              required
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Repartidor */}
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1">Repartidor</label>
            <select
              name="repartidor"
              value={form.repartidor}
              onChange={handleChange}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 focus:outline-none focus:border-blue-400"
            >
              {REPARTIDORES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Método de pago */}
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1">Método de pago</label>
            <select
              name="metodo_pago"
              value={form.metodo_pago}
              onChange={handleChange}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 focus:outline-none focus:border-blue-400"
            >
              <option value="efectivo">💵 Efectivo</option>
              <option value="transferencia">💳 Transferencia</option>
            </select>
          </div>

          {/* Nota */}
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-1">
              Nota <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              name="nota"
              value={form.nota}
              onChange={handleChange}
              rows={2}
              placeholder="Ej: Entregar después de las 14hs"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xl font-semibold py-4 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xl font-bold py-4 rounded-xl transition-colors"
            >
              {loading ? 'Guardando...' : '💾 Guardar Pedido'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

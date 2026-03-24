'use client';

import { useState } from 'react';
import { Pedido } from '@/lib/types';
import OrderCard from './OrderCard';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Props {
  pedidos: Pedido[];
  onUpdate: (updated: Pedido) => void;
}

export default function OrderList({ pedidos, onUpdate }: Props) {
  const [loadingId, setLoadingId] = useState<number | null>(null);

  async function handleMarkDelivered(id: number) {
    setLoadingId(id);
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado: 'DELIVERED', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    setLoadingId(null);

    if (error) {
      toast.error('❌ No se pudo actualizar el pedido');
      return;
    }

    onUpdate(data as Pedido);
    toast.success('✅ Pedido marcado como entregado');
  }

  if (pedidos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-4">📭</p>
        <p className="text-2xl font-semibold">No hay pedidos todavía</p>
        <p className="text-lg mt-2">Los pedidos del día aparecerán acá en tiempo real.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pedidos.map((pedido) => (
        <OrderCard
          key={pedido.id}
          pedido={pedido}
          onMarkDelivered={handleMarkDelivered}
          loading={loadingId === pedido.id}
        />
      ))}
    </div>
  );
}

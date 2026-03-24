import { Package, Clock, TrendingUp } from 'lucide-react';

interface Props {
  pedidosHoy: number;
  pendientes: number;
  recaudacion: number;
}

export default function KPICards({ pedidosHoy, pendientes, recaudacion }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">

      {/* Pedidos del día */}
      <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-md">
        <Package className="w-10 h-10 mb-3 opacity-80" />
        <p className="text-6xl font-black">{pedidosHoy}</p>
        <p className="text-xl font-semibold mt-1 opacity-90">Pedidos Hoy</p>
      </div>

      {/* Pendientes */}
      <div className={`rounded-2xl p-6 text-white shadow-md ${pendientes > 0 ? 'bg-amber-500' : 'bg-gray-400'}`}>
        <Clock className="w-10 h-10 mb-3 opacity-80" />
        <p className="text-6xl font-black">{pendientes}</p>
        <p className="text-xl font-semibold mt-1 opacity-90">Pendientes</p>
      </div>

      {/* Recaudación */}
      <div className="bg-green-600 rounded-2xl p-6 text-white shadow-md">
        <TrendingUp className="w-10 h-10 mb-3 opacity-80" />
        <p className="text-4xl font-black">
          ${recaudacion.toLocaleString('es-AR')}
        </p>
        <p className="text-xl font-semibold mt-1 opacity-90">Recaudado Hoy</p>
      </div>

    </div>
  );
}

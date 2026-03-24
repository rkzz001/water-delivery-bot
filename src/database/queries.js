// Todas las operaciones de base de datos usando el cliente de Supabase

import { supabase } from './supabaseClient.js';
import { ORDER_STATUS } from '../config.js';

// ─── Sesiones ────────────────────────────────────────────────────────────────

export async function getSession(phone) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSession(phone, step, data) {
  const { error } = await supabase
    .from('sessions')
    .upsert(
      { phone, step, data: JSON.stringify(data), updated_at: new Date().toISOString() },
      { onConflict: 'phone' },
    );
  if (error) throw error;
}

export async function deleteSession(phone) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('phone', phone);
  if (error) throw error;
}

// ─── Asignaciones cliente → repartidor ───────────────────────────────────────

export async function getClientAssignment(phone) {
  const { data, error } = await supabase
    .from('client_assignments')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertClientAssignment(phone, driverId) {
  const { error } = await supabase
    .from('client_assignments')
    .upsert(
      { phone, driver_id: driverId, updated_at: new Date().toISOString() },
      { onConflict: 'phone' },
    );
  if (error) throw error;
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export async function createOrder({
  clientPhone, driverId, address, details, status,
  paymentMethod = 'efectivo', notes = null, repartidor = null, total = 0,
}) {
  const { data, error } = await supabase
    .from('pedidos')
    .insert({
      cliente:     clientPhone,
      producto:    details,
      direccion:   address,
      driver_id:   driverId ?? null,
      repartidor:  repartidor ?? null,
      metodo_pago: paymentMethod,
      total,
      nota:        notes,
      estado:      status ?? ORDER_STATUS.PENDING,
      origen:      'bot',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOrderById(id) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(id, status) {
  const { error } = await supabase
    .from('pedidos')
    .update({ estado: status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function assignOrderToDriver(orderId, driverId) {
  const { data, error } = await supabase
    .from('pedidos')
    .update({
      driver_id:  driverId,
      estado:     ORDER_STATUS.ASSIGNED,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Pedidos activos (PENDING o ASSIGNED) de un repartidor
export async function getActiveOrdersByDriver(driverId) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('driver_id', driverId)
    .in('estado', [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Pedidos sin repartidor (UNASSIGNED)
export async function getUnassignedOrders() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('estado', ORDER_STATUS.UNASSIGNED)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Pedidos pendientes o no atendidos con repartidor asignado (para el scheduler)
export async function getPendingOrdersGroupedByDriver() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .in('estado', [ORDER_STATUS.PENDING, ORDER_STATUS.NOT_ANSWERED])
    .not('driver_id', 'is', null)
    .order('driver_id', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

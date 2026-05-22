'use client';

import { Reservation, Therapist, BlockedSlot } from './types';
import { supabase, isSupabaseConfigured } from './supabase';
import { MOCK_THERAPISTS, MAX_BEDS } from './mockData';

// ─── 치료사 ─────────────────────────────────────────
export async function getTherapists(): Promise<Therapist[]> {
  if (!isSupabaseConfigured) return MOCK_THERAPISTS;
  const { data, error } = await supabase
    .from('therapists')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) return MOCK_THERAPISTS;
  return data as Therapist[];
}

// ─── 예약 생성 ───────────────────────────────────────
export async function createReservation(params: {
  patientName: string;
  patientPhone: string;
  therapistId: string | null;
  date: string;
  startTime: string;
  duration: 30 | 50;
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    // localStorage fallback (demo mode)
    const reservations = getLocalReservations();
    const newRes: Reservation = {
      id: `res-${Date.now()}`,
      patient_name: params.patientName,
      patient_phone: params.patientPhone,
      therapist_id: params.therapistId,
      date: params.date,
      start_time: params.startTime,
      duration: params.duration,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    reservations.push(newRes);
    localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
    return { success: true };
  }

  const { error } = await supabase.from('reservations').insert({
    patient_name: params.patientName,
    patient_phone: params.patientPhone,
    therapist_id: params.therapistId,
    date: params.date,
    start_time: params.startTime,
    duration: params.duration,
    status: 'pending',
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── 예약 조회 (환자) ────────────────────────────────
export async function getPatientReservations(
  name: string,
  phone: string
): Promise<Reservation[]> {
  if (!isSupabaseConfigured) {
    return getLocalReservations().filter(
      (r) => r.patient_name === name && r.patient_phone === phone
    );
  }
  const { data, error } = await supabase
    .from('reservations')
    .select('*, therapist:therapists(*)')
    .eq('patient_name', name)
    .eq('patient_phone', phone)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) return [];
  return data as Reservation[];
}

// ─── 슬롯 예약 현황 조회 ─────────────────────────────
export async function getSlotAvailability(
  date: string,
  therapistId: string | null
): Promise<{ [time: string]: number }> {
  if (!isSupabaseConfigured) {
    const res = getLocalReservations().filter(
      (r) =>
        r.date === date &&
        r.status !== 'rejected' &&
        (therapistId ? r.therapist_id === therapistId : true)
    );
    const counts: { [time: string]: number } = {};
    res.forEach((r) => {
      counts[r.start_time] = (counts[r.start_time] || 0) + 1;
    });
    return counts;
  }

  let query = supabase
    .from('reservations')
    .select('start_time, therapist_id')
    .eq('date', date)
    .neq('status', 'rejected');
  if (therapistId) query = query.eq('therapist_id', therapistId);

  const { data, error } = await query;
  if (error) return {};
  const counts: { [time: string]: number } = {};
  (data || []).forEach((r: { start_time: string }) => {
    const t = r.start_time.slice(0, 5);
    counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
}

// ─── 치료사 예약 목록 ─────────────────────────────────
export async function getTherapistReservations(
  therapistId: string,
  date?: string
): Promise<Reservation[]> {
  if (!isSupabaseConfigured) {
    return getLocalReservations().filter(
      (r) =>
        r.therapist_id === therapistId &&
        (date ? r.date === date : true)
    );
  }
  let query = supabase
    .from('reservations')
    .select('*')
    .eq('therapist_id', therapistId)
    .order('date')
    .order('start_time');
  if (date) query = query.eq('date', date);
  const { data, error } = await query;
  if (error) return [];
  return data as Reservation[];
}

// ─── 예약 상태 업데이트 ───────────────────────────────
export async function updateReservationStatus(
  id: string,
  status: 'approved' | 'rejected' | 'done',
  note?: string
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const reservations = getLocalReservations();
    const idx = reservations.findIndex((r) => r.id === id);
    if (idx !== -1) {
      reservations[idx].status = status;
      if (note) reservations[idx].note = note;
      localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
    }
    return true;
  }
  const { error } = await supabase
    .from('reservations')
    .update({ status, note })
    .eq('id', id);
  return !error;
}

// ─── 전체 예약 (관리자) ───────────────────────────────
export async function getAllReservations(date?: string): Promise<Reservation[]> {
  if (!isSupabaseConfigured) {
    return getLocalReservations().filter((r) => (date ? r.date === date : true));
  }
  let query = supabase
    .from('reservations')
    .select('*, therapist:therapists(*)')
    .order('date')
    .order('start_time');
  if (date) query = query.eq('date', date);
  const { data, error } = await query;
  if (error) return [];
  return data as Reservation[];
}

// ─── localStorage helpers ─────────────────────────────
function getLocalReservations(): Reservation[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('jalbon_reservations') || '[]');
  } catch {
    return [];
  }
}

export function getMaxBeds(): number {
  if (typeof window === 'undefined') return MAX_BEDS;
  return parseInt(localStorage.getItem('jalbon_max_beds') || String(MAX_BEDS));
}

'use client';

import { Reservation, Therapist, BlockedSlot, AuditLog, ActionType } from './types';
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
  // 센터장이 항상 맨 위에 오도록 정렬
  const sorted = (data as Therapist[]).sort((a, b) => {
    if (a.name.includes('센터장')) return -1;
    if (b.name.includes('센터장')) return 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  return sorted;
}

// ─── 예약 생성 ───────────────────────────────────────
export async function createReservation(params: {
  patientName: string;
  patientPhone: string;
  pin: string;
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
      pin: params.pin,
      therapist_id: params.therapistId,
      date: params.date,
      start_time: params.startTime,
      duration: params.duration,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    reservations.push(newRes);
    localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
    insertAuditLog('PATIENT_BOOKING', params.patientName, { date: params.date, time: params.startTime });
    return { success: true };
  }

  const { error } = await supabase.from('reservations').insert({
    patient_name: params.patientName,
    patient_phone: params.patientPhone,
    pin: params.pin,
    therapist_id: params.therapistId,
    date: params.date,
    start_time: params.startTime,
    duration: params.duration,
    status: 'pending',
  });
  if (!error) {
    insertAuditLog('PATIENT_BOOKING', params.patientName, { date: params.date, time: params.startTime });
  }
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── 예약 조회 (환자) ────────────────────────────────
export async function getPatientReservations(
  name: string,
  phone: string,
  pin: string
): Promise<{ data: Reservation[]; error?: 'not_found' | 'wrong_pin' }> {
  if (!isSupabaseConfigured) {
    const allMatchingNamePhone = getLocalReservations().filter(
      (r) => r.patient_name === name && r.patient_phone === phone
    );
    if (allMatchingNamePhone.length === 0) return { data: [], error: 'not_found' };
    const matchingPin = allMatchingNamePhone.filter((r) => r.pin === pin);
    if (matchingPin.length === 0) return { data: [], error: 'wrong_pin' };
    return { data: matchingPin };
  }
  
  // 먼저 이름과 전화번호로 모두 찾음
  const { data, error } = await supabase
    .from('reservations')
    .select('*, therapist:therapists(*)')
    .eq('patient_name', name)
    .eq('patient_phone', phone)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
    
  if (error || !data || data.length === 0) return { data: [], error: 'not_found' };
  
  // 비밀번호 일치하는 것만 필터링 (여러 예약 중 하나라도 맞으면 그 PIN으로 된 예약만 반환, 또는 모두 반환할 수 있으나 보통 PIN은 동일함)
  const matchingPin = data.filter((r: Reservation) => r.pin === pin);
  if (matchingPin.length === 0) return { data: [], error: 'wrong_pin' };
  
  return { data: matchingPin as Reservation[] };
}

// ─── 슬롯 가용성 조회 (해당 날짜/치료사의 예약 목록 반환) ───
export async function getSlotAvailability(
  date: string,
  therapistId: string | null
): Promise<{ id: string; start_time: string; duration: number }[]> {
  if (!isSupabaseConfigured) {
    return getLocalReservations()
      .filter(
        (r) =>
          r.date === date &&
          r.status !== 'rejected' &&
          (therapistId ? r.therapist_id === therapistId : true)
      )
      .map(r => ({ id: r.id, start_time: r.start_time, duration: r.duration }));
  }

  let query = supabase
    .from('reservations')
    .select('id, start_time, duration')
    .eq('date', date)
    .neq('status', 'rejected');
  if (therapistId) query = query.eq('therapist_id', therapistId);

  const { data, error } = await query;
  if (error) return [];
  return (data || []).map((r: any) => ({
    id: r.id,
    start_time: r.start_time.slice(0, 5),
    duration: r.duration
  }));
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
  let resToUpdate: any = null;
  if (!isSupabaseConfigured) {
    const reservations = getLocalReservations();
    resToUpdate = reservations.find((r) => r.id === id);
    if (resToUpdate) {
      resToUpdate.status = status;
      if (note) resToUpdate.note = note;
      localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
      if (status === 'rejected') {
        insertAuditLog('RESERVATION_CANCELED', '치료사', { patientName: resToUpdate.patient_name, reason: '거절됨', date: resToUpdate.date, time: resToUpdate.start_time });
      }
    }
    return true;
  }

  const { data } = await supabase.from('reservations').select('*, therapist:therapists(name)').eq('id', id).single();
  resToUpdate = data;

  const { error } = await supabase
    .from('reservations')
    .update({ status, note })
    .eq('id', id);
    
  if (!error && status === 'rejected' && resToUpdate) {
    const thName = resToUpdate.therapist?.name || '치료사';
    insertAuditLog('RESERVATION_CANCELED', thName, { patientName: resToUpdate.patient_name, reason: '거절됨', date: resToUpdate.date, time: resToUpdate.start_time });
  }
  return !error;
}

// ─── 예약 날짜/시간 수정 ──────────────────────────────
export async function updateReservationDateTime(
  id: string,
  date: string,
  startTime: string,
  duration: 30 | 50
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const reservations = getLocalReservations();
    const idx = reservations.findIndex((r) => r.id === id);
    if (idx !== -1) {
      reservations[idx].date = date;
      reservations[idx].start_time = startTime;
      reservations[idx].duration = duration;
      localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
    }
    return true;
  }
  const { error } = await supabase
    .from('reservations')
    .update({ date, start_time: startTime, duration })
    .eq('id', id);
  return !error;
}

// ─── 예약 삭제 ─────────────────────────────────────────
export async function deleteReservation(id: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    let reservations = getLocalReservations();
    const resToDelete = reservations.find((r) => r.id === id);
    if (resToDelete) {
      reservations = reservations.filter((r) => r.id !== id);
      localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
      insertAuditLog('RESERVATION_CANCELED', '관리자/치료사', { patientName: resToDelete.patient_name, reason: '삭제됨', date: resToDelete.date, time: resToDelete.start_time });
    }
    return { success: true };
  }

  const { data: resToDelete } = await supabase.from('reservations').select('*, therapist:therapists(name)').eq('id', id).single();

  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  if (resToDelete) {
    const thName = resToDelete.therapist?.name || '관리자/치료사';
    insertAuditLog('RESERVATION_CANCELED', thName, { patientName: resToDelete.patient_name, reason: '삭제됨', date: resToDelete.date, time: resToDelete.start_time });
  }
  return { success: true };
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
  return parseInt(localStorage.getItem('jalbon_max_beds') || String(MAX_BEDS), 10);
}

// ─── 감사 로그 (Audit Logs) ───────────────────────────
export async function insertAuditLog(
  actionType: ActionType,
  actorName: string,
  details: any
) {
  if (!isSupabaseConfigured) {
    const logs = getLocalAuditLogs();
    logs.push({
      id: `log-${Date.now()}`,
      action_type: actionType,
      actor_name: actorName,
      details,
      created_at: new Date().toISOString()
    });
    localStorage.setItem('jalbon_audit_logs', JSON.stringify(logs));
    return;
  }
  await supabase.from('audit_logs').insert({
    action_type: actionType,
    actor_name: actorName,
    details
  });
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (!isSupabaseConfigured) {
    return getLocalAuditLogs().reverse();
  }
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false });
  return (data || []) as AuditLog[];
}

function getLocalAuditLogs(): AuditLog[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('jalbon_audit_logs') || '[]');
  } catch {
    return [];
  }
}

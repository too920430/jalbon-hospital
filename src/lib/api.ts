'use client';

import { Reservation, Therapist, BlockedSlot, AuditLog, ActionType } from './types';
import { supabase, isSupabaseConfigured } from './supabase';
import { MOCK_THERAPISTS, MAX_BEDS } from './mockData';
import { isSlotOverlapping } from './slots';

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
  let ip = 'unknown';
  let userAgent = 'unknown';
  if (typeof window !== 'undefined') {
    userAgent = navigator.userAgent;
    try {
      const res = await fetch('/api/ip');
      const data = await res.json();
      if (data.ip) ip = data.ip;
    } catch (e) {
      console.error('Failed to fetch IP', e);
    }
  }

  const auditDetails = { 
    date: params.date, 
    time: params.startTime, 
    ip, 
    userAgent 
  };

  if (!isSupabaseConfigured) {
    // localStorage fallback (demo mode)
    const reservations = getLocalReservations();
    
    // 신환 여부 및 비밀번호 체크
    const pastRes = reservations.filter(r => r.patient_phone === params.patientPhone);
    if (pastRes.length > 0) {
      // 최신 예약의 PIN과 일치하는지 확인
      const latest = pastRes[pastRes.length - 1];
      if (latest.pin !== params.pin) {
        return { success: false, error: '이전에 사용하신 예약 비밀번호와 다릅니다. 동일한 번호를 입력해주세요.' };
      }
    }

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
    insertAuditLog('PATIENT_BOOKING', params.patientName, auditDetails);
    return { success: true };
  }

  // 신환 여부 및 비밀번호 체크
  const { data: pastRes, error: fetchError } = await supabase
    .from('reservations')
    .select('pin')
    .eq('patient_phone', params.patientPhone)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.error('Failed to fetch past reservations:', fetchError);
    return { success: false, error: '이전 예약 내역을 확인하는 중 오류가 발생했습니다: ' + fetchError.message };
  }

  if (pastRes && pastRes.length > 0) {
    if (pastRes[0].pin !== params.pin) {
      return { success: false, error: '이전에 사용하신 예약 비밀번호와 다릅니다. 동일한 번호를 입력해주세요.' };
    }
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
    insertAuditLog('PATIENT_BOOKING', params.patientName, auditDetails);
  }
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── 기존 환자 비밀번호(PIN) 사전 검증 ────────────────────────
export async function checkPatientPin(phone: string, pin: string): Promise<{ valid: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const reservations = getLocalReservations();
    const pastRes = reservations.filter(r => r.patient_phone === phone);
    if (pastRes.length > 0) {
      const latest = pastRes[pastRes.length - 1];
      if (latest.pin !== pin) {
        return { valid: false, error: '이전에 사용하신 예약 비밀번호와 다릅니다.' };
      }
    }
    return { valid: true };
  }

  const { data: pastRes } = await supabase
    .from('reservations')
    .select('pin')
    .eq('patient_phone', phone)
    .order('created_at', { ascending: false })
    .limit(1);

  if (pastRes && pastRes.length > 0) {
    if (pastRes[0].pin !== pin) {
      return { valid: false, error: '이전에 사용하신 예약 비밀번호와 다릅니다.' };
    }
  }
  return { valid: true };
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
  let reservations: Reservation[] = [];
  if (!isSupabaseConfigured) {
    reservations = getLocalReservations().filter(
      (r) =>
        (r.therapist_id === therapistId || r.therapist_id === null) &&
        (date ? r.date === date : true)
    );
  } else {
    let query = supabase
      .from('reservations')
      .select('*')
      .or(`therapist_id.eq.${therapistId},therapist_id.is.null`)
      .order('date')
      .order('start_time');
    if (date) query = query.eq('date', date);
    const { data, error } = await query;
    if (!error && data) {
      reservations = data as Reservation[];
    }
  }

  // 필터링: therapist_id가 null(상관없음)인 예약 중, 
  // 치료사 본인의 예약과 시간이 겹치는 것은 보이지 않게 함
  const myRes = reservations.filter(r => r.therapist_id === therapistId && r.status !== 'rejected');
  const validReservations = reservations.filter(r => {
    if (r.therapist_id === therapistId) return true; // 본인 예약은 항상 보임
    // 상관없음(null) 예약인 경우 겹치는지 확인
    const overlaps = myRes.some(mr => mr.date === r.date && isSlotOverlapping(r.start_time, r.duration, mr.start_time, mr.duration));
    return !overlaps; // 겹치지 않으면 보임
  });

  return validReservations;
}

// ─── 예약 상태 업데이트 ───────────────────────────────
export async function updateReservationStatus(
  id: string,
  status: 'approved' | 'rejected' | 'done' | 'paid',
  note?: string,
  assignTherapistId?: string
): Promise<boolean> {
  let resToUpdate: any = null;
  if (!isSupabaseConfigured) {
    const reservations = getLocalReservations();
    resToUpdate = reservations.find((r) => r.id === id);
    if (resToUpdate) {
      resToUpdate.status = status;
      if (note) resToUpdate.note = note;
      if (assignTherapistId && !resToUpdate.therapist_id) {
        resToUpdate.therapist_id = assignTherapistId;
      }
      localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
      if (status === 'rejected') {
        insertAuditLog('RESERVATION_CANCELED', '치료사', { patientName: resToUpdate.patient_name, reason: '거절됨', date: resToUpdate.date, time: resToUpdate.start_time });
      } else if (status === 'done') {
        insertAuditLog('TREATMENT_COMPLETED', '치료사', { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
      } else if (status === 'paid') {
        insertAuditLog('PAYMENT_COMPLETED', '관리자', { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
      }
    }
    return true;
  }

  const { data } = await supabase.from('reservations').select('*, therapist:therapists(name)').eq('id', id).single();
  resToUpdate = data;

  const updateData: any = { status };
  if (note !== undefined) updateData.note = note;
  if (assignTherapistId && !resToUpdate.therapist_id) {
    updateData.therapist_id = assignTherapistId;
  }

  const { error } = await supabase
    .from('reservations')
    .update(updateData)
    .eq('id', id);
    
  if (!error && resToUpdate) {
    const thName = resToUpdate.therapist?.name || '치료사';
    if (status === 'rejected') {
      insertAuditLog('RESERVATION_CANCELED', thName, { patientName: resToUpdate.patient_name, reason: '거절됨', date: resToUpdate.date, time: resToUpdate.start_time });
    } else if (status === 'done') {
      insertAuditLog('TREATMENT_COMPLETED', thName, { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
    } else if (status === 'paid') {
      insertAuditLog('PAYMENT_COMPLETED', '관리자', { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
    }
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
export async function deleteReservation(id: string, actorName: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    let reservations = getLocalReservations();
    const resToDelete = reservations.find((r) => r.id === id);
    if (resToDelete) {
      reservations = reservations.filter((r) => r.id !== id);
      localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
      insertAuditLog('RESERVATION_CANCELED', actorName, { patientName: resToDelete.patient_name, reason: '삭제됨', date: resToDelete.date, time: resToDelete.start_time });
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
    insertAuditLog('RESERVATION_CANCELED', actorName, { patientName: resToDelete.patient_name, reason: '삭제됨', date: resToDelete.date, time: resToDelete.start_time });
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

// ─── 환자 비밀번호 원격 변경 ──────────────────────────
export async function updatePatientPin(phone: string, newPin: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const reservations = getLocalReservations();
    reservations.forEach(r => {
      if (r.patient_phone === phone) r.pin = newPin;
    });
    localStorage.setItem('jalbon_reservations', JSON.stringify(reservations));
    return { success: true };
  }

  const { error } = await supabase
    .from('reservations')
    .update({ pin: newPin })
    .eq('patient_phone', phone);
    
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── 치료사 인센티브 설정 변경 ────────────────────────
export async function updateTherapistIncentive(therapistId: string, incentive: number): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    // mockData.ts의 내용을 런타임에 바꾸기는 어려우므로 localStorage 활용 방식을 쓰거나 스킵
    return { success: true };
  }

  const { error } = await supabase
    .from('therapists')
    .update({ incentive })
    .eq('id', therapistId);
    
  if (error) return { success: false, error: error.message };
  return { success: true };
}

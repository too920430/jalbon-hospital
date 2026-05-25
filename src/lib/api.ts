'use client';

import { Reservation, Therapist, BlockedSlot, AuditLog, ActionType, SmsLog } from './types';
import { supabase, isSupabaseConfigured } from './supabase';
import { MOCK_THERAPISTS } from './mockData';
import { isSlotOverlapping } from './slots';
import { sendAligoSms } from './aligo';

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

  const blacklisted = await getBlacklistedPhones();
  if (blacklisted.includes(params.patientPhone)) {
    return { success: false, error: '현재 온라인 예약을 이용하실 수 없습니다. 병원으로 직접 문의해 주세요.' };
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

  // 신환 여부 및 비밀번호 체크 (안전한 RPC 호출 활용)
  const pinCheck = await checkPatientPin(params.patientPhone, params.pin);
  if (!pinCheck.valid) {
    // pinCheck.error 에는 블랙리스트 차단, 무차별 대입 차단, 비밀번호 틀림 에러 등이 담겨옵니다.
    return { success: false, error: pinCheck.error };
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
    const blacklisted = await getBlacklistedPhones();
    if (blacklisted.includes(phone)) {
      return { valid: false, error: '현재 온라인 예약을 이용하실 수 없습니다. 병원으로 직접 문의해 주세요.' };
    }
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

  // 안전한 서버 사이드 RPC 호출 (무차별 대입 방지 및 블랙리스트 검증 포함)
  const { data, error } = await supabase.rpc('check_patient_pin_with_rate_limit', {
    p_phone: phone,
    p_pin: pin
  });

  if (error) {
    console.error('Failed to check pin via RPC:', error);
    return { valid: false, error: '서버 통신 오류가 발생했습니다.' };
  }

  // data는 JSON 객체 반환 { "valid": true/false, "error": "메시지" }
  return data as { valid: boolean; error?: string };
}

// ─── 예약 조회 (환자) ────────────────────────────────
export async function getPatientReservations(
  name: string,
  phone: string,
  pin: string
): Promise<{ data: Reservation[]; error?: 'not_found' | 'wrong_pin' | 'rate_limit' | string }> {
  if (!isSupabaseConfigured) {
    const allMatchingNamePhone = getLocalReservations().filter(
      (r) => r.patient_name === name && r.patient_phone === phone
    );
    if (allMatchingNamePhone.length === 0) return { data: [], error: 'not_found' };
    const matchingPin = allMatchingNamePhone.filter((r) => r.pin === pin);
    if (matchingPin.length === 0) return { data: [], error: 'wrong_pin' };
    return { data: matchingPin.filter(r => r.status !== 'paid') };
  }
  
  // 1단계: PIN 검증 + Rate Limiting (무조건 먼저 실행)
  const pinCheck = await checkPatientPin(phone, pin);
  if (!pinCheck.valid) {
    return { data: [], error: pinCheck.error };
  }

  // 2단계: PIN 통과 후 예약 데이터 조회
  const { data, error } = await supabase
    .from('reservations')
    .select('*, therapist:therapists(*)')
    .eq('patient_name', name)
    .eq('patient_phone', phone)
    .neq('status', 'paid');

  if (error) {
    console.error('Failed to get patient reservations:', error);
    return { data: [], error: 'not_found' };
  }

  if (!data || data.length === 0) {
    return { data: [], error: 'not_found' };
  }

  return { data: data as Reservation[] };
}

// ─── 슬롯 가용성 조회 (해당 날짜/치료사의 예약 목록 반환) ───
export async function getSlotAvailability(
  date: string,
  therapistId: string | null
): Promise<{ id: string; start_time: string; duration: number }[]> {
  if (!isSupabaseConfigured) {
    const reservations: { id: string; start_time: string; duration: number }[] = getLocalReservations()
      .filter(
        (r) =>
          r.date === date &&
          r.status !== 'rejected' &&
          (therapistId ? r.therapist_id === therapistId : true)
      )
      .map(r => ({ id: r.id, start_time: r.start_time, duration: r.duration as number }));
      
    // 휴가 블록 추가
    const leaves = await getTherapistLeaves();
    const activeLeaves = leaves.filter(l => l.date === date && (therapistId ? l.therapist_id === therapistId : true));
    
    for (const leave of activeLeaves) {
      const startMins = parseInt(leave.start_time.split(':')[0]) * 60 + parseInt(leave.start_time.split(':')[1]);
      const endMins = parseInt(leave.end_time.split(':')[0]) * 60 + parseInt(leave.end_time.split(':')[1]);
      const duration = endMins - startMins;
      if (duration > 0) {
        reservations.push({
          id: `leave-${leave.id}`,
          start_time: leave.start_time.slice(0, 5),
          duration
        });
      }
    }
    
    return reservations.map((r: any) => ({ ...r, duration: r.duration as number }));
  }

  let query = supabase
    .from('reservations')
    .select('id, start_time, duration')
    .eq('date', date)
    .neq('status', 'rejected');
  if (therapistId) query = query.eq('therapist_id', therapistId);

  const { data, error } = await query;
  if (error) return [];
  
  const reservations: { id: string; start_time: string; duration: number }[] = (data || []).map((r: any) => ({
    id: r.id,
    start_time: r.start_time.slice(0, 5),
    duration: r.duration
  }));

  let leaveQuery = supabase
    .from('therapist_leaves')
    .select('*')
    .eq('date', date);
  if (therapistId) leaveQuery = leaveQuery.eq('therapist_id', therapistId);
  
  const { data: leaves } = await leaveQuery;
  if (leaves) {
    for (const leave of leaves) {
      const startMins = parseInt(leave.start_time.split(':')[0]) * 60 + parseInt(leave.start_time.split(':')[1]);
      const endMins = parseInt(leave.end_time.split(':')[0]) * 60 + parseInt(leave.end_time.split(':')[1]);
      const duration = endMins - startMins;
      if (duration > 0) {
        reservations.push({
          id: `leave-${leave.id}`,
          start_time: leave.start_time.slice(0, 5),
          duration
        });
      }
    }
  }

  return reservations;
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
  status: 'approved' | 'rejected' | 'done' | 'paid' | 'no_show',
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
        await insertAuditLog('RESERVATION_CANCELED', '치료사', { patientName: resToUpdate.patient_name, reason: '거절됨', date: resToUpdate.date, time: resToUpdate.start_time });
      } else if (status === 'done') {
        await insertAuditLog('TREATMENT_COMPLETED', '치료사', { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
      } else if (status === 'paid') {
        await insertAuditLog('PAYMENT_COMPLETED', '관리자', { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
      } else if (status === 'approved') {
        await insertAuditLog('RESERVATION_APPROVED', '치료사', { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
        const msg = `[본앤밸런스] ${resToUpdate.patient_name}님의 예약(${resToUpdate.date} ${resToUpdate.start_time.slice(0,5)})이 확정되었습니다.`;
        await insertSmsLog(resToUpdate.patient_name, resToUpdate.patient_phone, msg, '치료사');
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
      await insertAuditLog('RESERVATION_CANCELED', thName, { patientName: resToUpdate.patient_name, reason: '거절됨', date: resToUpdate.date, time: resToUpdate.start_time });
    } else if (status === 'done') {
      await insertAuditLog('TREATMENT_COMPLETED', thName, { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
    } else if (status === 'approved') {
      await insertAuditLog('RESERVATION_APPROVED', thName, { patientName: resToUpdate.patient_name, date: resToUpdate.date, time: resToUpdate.start_time });
      const msg = `[본앤밸런스] ${resToUpdate.patient_name}님의 예약(${resToUpdate.date} ${resToUpdate.start_time.slice(0,5)})이 ${thName}님께 확정되었습니다.`;
      await sendAligoSms(resToUpdate.patient_phone, msg);
      await insertSmsLog(resToUpdate.patient_name, resToUpdate.patient_phone, msg, thName);
    }
    // PAYMENT_COMPLETED 로그는 admin page에서 직접 삽입 (중복 방지)
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
  const { error } = await supabase.from('audit_logs').insert({
    action_type: actionType,
    actor_name: actorName,
    details
  });
  if (error) {
    console.error('Failed to insert audit log:', error);
  }
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

export async function deleteAuditLogs(actionType?: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    if (actionType) {
      const logs = getLocalAuditLogs().filter(l => l.action_type !== actionType);
      localStorage.setItem('jalbon_audit_logs', JSON.stringify(logs));
    } else {
      localStorage.setItem('jalbon_audit_logs', JSON.stringify([]));
    }
    return true;
  }

  let query = supabase.from('audit_logs').delete();
  if (actionType) {
    query = query.eq('action_type', actionType);
  } else {
    // Supabase requires some filter to delete all rows unless configured otherwise.
    // eq('id', id) is usually used, but we can do neq('id', '00000000-0000-0000-0000-000000000000') to delete all
    query = query.neq('id', '00000000-0000-0000-0000-000000000000');
  }
  
  const { error } = await query;
  return !error;
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

// ─── SMS/알림톡 발송 모의 API ─────────────────────────
export async function insertSmsLog(
  patientName: string,
  patientPhone: string,
  message: string,
  sentBy: string
): Promise<void> {
  if (!isSupabaseConfigured) {
    const logs = getLocalSmsLogs();
    logs.push({
      id: `sms-${Date.now()}`,
      patient_name: patientName,
      patient_phone: patientPhone,
      message,
      sent_by: sentBy,
      status: 'success',
      created_at: new Date().toISOString()
    });
    localStorage.setItem('jalbon_sms_logs', JSON.stringify(logs));
    return;
  }
  
  await supabase.from('sms_logs').insert({
    patient_name: patientName,
    patient_phone: patientPhone,
    message,
    sent_by: sentBy
  });
}

export async function getSmsLogs(): Promise<SmsLog[]> {
  if (!isSupabaseConfigured) {
    return getLocalSmsLogs().reverse();
  }
  const { data } = await supabase
    .from('sms_logs')
    .select('*')
    .order('created_at', { ascending: false });
  return (data || []) as SmsLog[];
}

export async function deleteSmsLogs(): Promise<boolean> {
  if (!isSupabaseConfigured) {
    localStorage.setItem('jalbon_sms_logs', JSON.stringify([]));
    return true;
  }
  const { error } = await supabase.from('sms_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  return !error;
}

function getLocalSmsLogs(): SmsLog[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('jalbon_sms_logs') || '[]');
  } catch {
    return [];
  }
}

// ─── 치료사 휴무 관리 API ─────────────────────────────
export async function getTherapistLeaves(): Promise<import('./types').TherapistLeave[]> {
  if (!isSupabaseConfigured) {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('jalbon_therapist_leaves') || '[]');
    } catch {
      return [];
    }
  }
  const { data } = await supabase.from('therapist_leaves').select('*').order('date');
  return (data || []) as import('./types').TherapistLeave[];
}

export async function insertTherapistLeave(
  therapistId: string,
  date: string,
  startTime: string,
  endTime: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const leaves = await getTherapistLeaves();
    leaves.push({
      id: `leave-${Date.now()}`,
      therapist_id: therapistId,
      date,
      start_time: startTime,
      end_time: endTime,
      reason,
      created_at: new Date().toISOString()
    });
    localStorage.setItem('jalbon_therapist_leaves', JSON.stringify(leaves));
    
    const therapists = await getTherapists();
    const th = therapists.find(t => t.id === therapistId);
    let actor = '알수없음';
    try {
      if (typeof window !== 'undefined') {
        if (sessionStorage.getItem('jalbon_role') === 'admin') actor = '관리자';
        else if (sessionStorage.getItem('jalbon_therapist')) actor = JSON.parse(sessionStorage.getItem('jalbon_therapist')!).name;
      }
    } catch {}
    await insertAuditLog('THERAPIST_LEAVE', actor, { action: 'create', therapistName: th?.name, date, time: `${startTime}~${endTime}`, reason });
    
    return { success: true };
  }

  const { error } = await supabase.from('therapist_leaves').insert({
    therapist_id: therapistId,
    date,
    start_time: startTime,
    end_time: endTime,
    reason
  });
  if (error) return { success: false, error: error.message };
  
  const therapists = await getTherapists();
  const th = therapists.find(t => t.id === therapistId);
  let actor = '알수없음';
  try {
    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('jalbon_role') === 'admin') actor = '관리자';
      else if (sessionStorage.getItem('jalbon_therapist')) actor = JSON.parse(sessionStorage.getItem('jalbon_therapist')!).name;
    }
  } catch {}
  await insertAuditLog('THERAPIST_LEAVE', actor, { action: 'create', therapistName: th?.name, date, time: `${startTime}~${endTime}`, reason });
  
  return { success: true };
}

export async function updateTherapistLeave(
  id: string,
  startTime: string,
  endTime: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const leaves = await getTherapistLeaves();
    const target = leaves.find(l => l.id === id);
    if (target) {
      target.start_time = startTime;
      target.end_time = endTime;
      target.reason = reason;
      localStorage.setItem('jalbon_therapist_leaves', JSON.stringify(leaves));
      
      const therapists = await getTherapists();
      const th = therapists.find(t => t.id === target.therapist_id);
      let actor = '알수없음';
      try {
        if (typeof window !== 'undefined') {
          actor = sessionStorage.getItem('jalbon_role') === 'admin' ? '관리자' : (sessionStorage.getItem('jalbon_therapist') ? JSON.parse(sessionStorage.getItem('jalbon_therapist')!).name : '알수없음');
        }
      } catch {}
      await insertAuditLog('THERAPIST_LEAVE', actor, { action: 'update', therapistName: th?.name, date: target.date, time: `${startTime}~${endTime}`, reason });
    }
    return { success: true };
  }
  
  const leaves = await getTherapistLeaves();
  const target = leaves.find(l => l.id === id);
  const { error } = await supabase
    .from('therapist_leaves')
    .update({ start_time: startTime, end_time: endTime, reason })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  
  if (target) {
    const therapists = await getTherapists();
    const th = therapists.find(t => t.id === target.therapist_id);
    let actor = '알수없음';
    try {
      if (typeof window !== 'undefined') {
        actor = sessionStorage.getItem('jalbon_role') === 'admin' ? '관리자' : (sessionStorage.getItem('jalbon_therapist') ? JSON.parse(sessionStorage.getItem('jalbon_therapist')!).name : '알수없음');
      }
    } catch {}
    await insertAuditLog('THERAPIST_LEAVE', actor, { action: 'update', therapistName: th?.name, date: target.date, time: `${startTime}~${endTime}`, reason });
  }

  return { success: true };
}

export async function deleteTherapistLeave(id: string): Promise<{ success: boolean; error?: string }> {
  const leaves = await getTherapistLeaves();
  const target = leaves.find(l => l.id === id);

  if (!isSupabaseConfigured) {
    const newLeaves = leaves.filter(l => l.id !== id);
    localStorage.setItem('jalbon_therapist_leaves', JSON.stringify(newLeaves));
    
    if (target) {
      const therapists = await getTherapists();
      const th = therapists.find(t => t.id === target.therapist_id);
      let actor = '알수없음';
      try {
        if (typeof window !== 'undefined') {
          actor = sessionStorage.getItem('jalbon_role') === 'admin' ? '관리자' : (sessionStorage.getItem('jalbon_therapist') ? JSON.parse(sessionStorage.getItem('jalbon_therapist')!).name : '알수없음');
        }
      } catch {}
      await insertAuditLog('THERAPIST_LEAVE', actor, { action: 'delete', therapistName: th?.name, date: target.date, time: `${target.start_time.slice(0,5)}~${target.end_time.slice(0,5)}`, reason: target.reason });
    }
    return { success: true };
  }

  const { error } = await supabase.from('therapist_leaves').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  
  if (target) {
    const therapists = await getTherapists();
    const th = therapists.find(t => t.id === target.therapist_id);
    let actor = '알수없음';
    try {
      if (typeof window !== 'undefined') {
        actor = sessionStorage.getItem('jalbon_role') === 'admin' ? '관리자' : (sessionStorage.getItem('jalbon_therapist') ? JSON.parse(sessionStorage.getItem('jalbon_therapist')!).name : '알수없음');
      }
    } catch {}
    await insertAuditLog('THERAPIST_LEAVE', actor, { action: 'delete', therapistName: th?.name, date: target.date, time: `${target.start_time.slice(0,5)}~${target.end_time.slice(0,5)}`, reason: target.reason });
  }

  return { success: true };
}

// ─── 환자 블랙리스트 관리 ─────────────────────────
export async function getBlacklistedPhones(): Promise<string[]> {
  if (!isSupabaseConfigured) {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('jalbon_blacklist') || '[]');
    } catch {
      return [];
    }
  }
  
  // Supabase 연동 시 blacklisted_patients 테이블이 없으면 에러가 날 수 있으므로 localStorage 우선 폴백 적용
  const { data, error } = await supabase.from('blacklisted_patients').select('phone');
  if (error) {
    console.warn('Blacklist table might not exist, falling back to localStorage:', error.message);
    if (typeof window !== 'undefined') {
      try { return JSON.parse(localStorage.getItem('jalbon_blacklist') || '[]'); } catch {}
    }
    return [];
  }
  return (data || []).map((b: any) => b.phone);
}

export async function toggleBlacklist(phone: string, isBlacklisted: boolean): Promise<boolean> {
  // localStorage에도 항상 상태 업데이트 (폴백 목적)
  if (typeof window !== 'undefined') {
    try {
      let list = JSON.parse(localStorage.getItem('jalbon_blacklist') || '[]');
      if (isBlacklisted) {
        if (!list.includes(phone)) list.push(phone);
      } else {
        list = list.filter((p: string) => p !== phone);
      }
      localStorage.setItem('jalbon_blacklist', JSON.stringify(list));
    } catch {}
  }

  if (!isSupabaseConfigured) return true;

  if (isBlacklisted) {
    const { error } = await supabase.from('blacklisted_patients').insert({ phone });
    return !error;
  } else {
    const { error } = await supabase.from('blacklisted_patients').delete().eq('phone', phone);
    return !error;
  }
}

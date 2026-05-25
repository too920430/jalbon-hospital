/**
 * 예약 가능한 시간 슬롯 생성
 * 평일: 09:00~18:00 (점심 12:30~13:30 제외)
 * 토요일: 09:00~13:00 (점심 없음)
 * 일요일: 휴무
 */
export function getAvailableSlots(date: Date, duration: 30 | 50): string[] {
  const dayOfWeek = date.getDay(); // 0=일, 1=월 ... 6=토

  if (dayOfWeek === 0) return []; // 일요일 휴무

  const slots: string[] = [];
  const addSlot = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const interval = 30;
  if (dayOfWeek === 6) {
    // 토요일: 09:00 ~ 12:30 시작 가능
    for (let t = 9 * 60; t <= 13 * 60 - 30; t += interval) {
      addSlot(t);
    }
  } else {
    // 평일: 오전 09:00 ~ 12:00 시작 가능, 오후 13:30 ~ 17:30 시작 가능
    for (let t = 9 * 60; t <= 12 * 60; t += interval) {
      addSlot(t);
    }
    for (let t = 13 * 60 + 30; t <= 18 * 60 - 30; t += interval) {
      addSlot(t);
    }
  }

  return slots;
}

export function getSlotError(time: string, duration: number, date: Date): string | null {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return '휴무일';
  const isSaturday = dayOfWeek === 6;

  const [h, m] = time.split(':').map(Number);
  const startMins = h * 60 + m;
  const endMins = startMins + duration;

  // 과거 시간 체크 (오늘일 경우)
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    const currentMins = today.getHours() * 60 + today.getMinutes();
    if (startMins < currentMins) {
      return '예약불가';
    }
  }

  // 점심시간 겹침 체크 (평일 12:30 ~ 13:30)
  if (!isSaturday) {
    const lunchStart = 12 * 60 + 30; // 750
    const lunchEnd = 13 * 60 + 30;   // 810
    if (Math.max(startMins, lunchStart) < Math.min(endMins, lunchEnd)) {
      return '점심시간 겹침';
    }
  }

  // 영업종료 겹침 체크 (평일 18:00, 토요일 13:00)
  const closeMins = isSaturday ? 13 * 60 : 18 * 60;
  if (endMins > closeMins) {
    return '영업종료';
  }

  return null;
}

/** HH:MM -> 오전/오후 h:mm 형식 */
export function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr);
  const m = parseInt(mStr);
  const period = h < 12 ? '오전' : '오후';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${period} ${displayH}:${String(m).padStart(2, '0')}`;
}

/** YYYY-MM-DD -> M월 D일 (요일) */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = days[date.getDay()];
  return `${month}월 ${day}일 (${dayName})`;
}

// ─── 유틸리티 함수 ──────────────────────────────────────────────
export function formatTherapistName(name: string): string {
  // 이름에 공백이 있으면(예: "서영준 팀장") 그대로 반환, 아니면 "치료사" 붙임
  return name.includes(' ') ? name : `${name} 치료사`;
}

/** 오늘 날짜 YYYY-MM-DD */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Date -> YYYY-MM-DD */
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 영업일 여부
export function isOpenDay(date: Date): boolean {
  return date.getDay() !== 0; // 일요일만 휴무
}

// ─── 슬롯 겹침 체크 로직 ──────────────────────────────────────
export function isSlotOverlapping(
  slotTime: string,
  slotDuration: number,
  reservationStartTime: string,
  reservationDuration: number
): boolean {
  const [h1, m1] = slotTime.split(':').map(Number);
  const start1 = h1 * 60 + m1;
  const end1 = start1 + slotDuration;

  const [h2, m2] = reservationStartTime.split(':').map(Number);
  const start2 = h2 * 60 + m2;
  const end2 = start2 + reservationDuration;

  // 겹치는지 확인 (시작이나 끝이 맞물리는 건 안 겹친다고 봄)
  return Math.max(start1, start2) < Math.min(end1, end2);
}

export function getOccupiedCountForSlot(
  slotTime: string,
  slotDuration: number,
  reservations: { id: string; start_time: string; duration: number }[],
  ignoreId?: string // 수정 시 자기 자신의 예약은 무시
): number {
  let count = 0;
  for (const res of reservations) {
    if (ignoreId && res.id === ignoreId) continue;
    if (isSlotOverlapping(slotTime, slotDuration, res.start_time, res.duration)) {
      count++;
    }
  }
  return count;
}

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

  if (dayOfWeek === 6) {
    // 토요일: 09:00 ~ 13:00, 점심 없음
    const interval = duration === 30 ? 30 : 60;
    for (let t = 9 * 60; t + duration <= 13 * 60; t += interval) {
      addSlot(t);
    }
  } else {
    // 평일: 오전 09:00 ~ (점심 전) + 오후 13:30 ~18:00
    const interval = duration === 30 ? 30 : 60;
    // 오전
    for (let t = 9 * 60; t + duration <= 12 * 60 + 30; t += interval) {
      addSlot(t);
    }
    // 오후
    for (let t = 13 * 60 + 30; t + duration <= 18 * 60; t += interval) {
      addSlot(t);
    }
  }

  return slots;
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

/** 영업일 여부 */
export function isOpenDay(date: Date): boolean {
  return date.getDay() !== 0; // 일요일만 휴무
}

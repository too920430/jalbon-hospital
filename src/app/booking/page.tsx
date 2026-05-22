'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookingFormData, Therapist } from '@/lib/types';
import { getAvailableSlots, formatTime, formatDate, toDateStr, isOpenDay, formatTherapistName } from '@/lib/slots';
import { getTherapists, createReservation, getSlotAvailability, getMaxBeds } from '@/lib/api';

const STEPS = ['내 정보', '치료 시간', '치료사', '날짜', '시간', '확인'];

export default function BookingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [availability, setAvailability] = useState<{ [time: string]: number }>({});
  const [maxBeds, setMaxBeds] = useState(5);
  const [form, setForm] = useState<BookingFormData>({
    patientName: '',
    patientPhone: '',
    duration: null,
    therapistId: null,
    date: null,
    startTime: null,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    getTherapists().then(setTherapists);
    setMaxBeds(getMaxBeds());
  }, []);

  // 날짜/치료사 변경 시 예약 현황 조회
  useEffect(() => {
    if (form.date && step >= 5) {
      getSlotAvailability(form.date, form.therapistId).then(setAvailability);
    }
  }, [form.date, form.therapistId, step]);

  // 캘린더 상태
  const today = new Date();
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const calDays = useCallback(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [calMonth]);

  const selectDate = (date: Date) => {
    if (!isOpenDay(date) || date < today) return;
    setForm((f) => ({ ...f, date: toDateStr(date), startTime: null }));
  };

  const timeSlots = form.date && form.duration
    ? getAvailableSlots(new Date(form.date + 'T00:00:00'), form.duration)
    : [];

  const getSlotStatus = (time: string): 'available' | 'selected' | 'full' => {
    if (form.startTime === time) return 'selected';
    const count = availability[time] || 0;
    if (form.therapistId) {
      return count >= 1 ? 'full' : 'available';
    }
    return count >= maxBeds ? 'full' : 'available';
  };

  const canNext = (): boolean => {
    if (step === 1) return form.patientName.trim().length >= 2 && form.patientPhone.replace(/\D/g, '').length >= 10;
    if (step === 2) return form.duration !== null;
    if (step === 3) return true; // 치료사는 선택 안 해도 됨 (상관없음)
    if (step === 4) return form.date !== null;
    if (step === 5) return form.startTime !== null;
    return true;
  };

  const handlePhoneInput = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length >= 4 && digits.length <= 7) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    } else if (digits.length >= 8) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    setForm((f) => ({ ...f, patientPhone: formatted }));
  };

  const handleSubmit = async () => {
    if (!form.date || !form.startTime || !form.duration) return;
    setLoading(true);
    setError('');
    const result = await createReservation({
      patientName: form.patientName.trim(),
      patientPhone: form.patientPhone,
      therapistId: form.therapistId,
      date: form.date,
      startTime: form.startTime,
      duration: form.duration,
    });
    setLoading(false);
    if (result.success) {
      router.push('/booking/complete');
    } else {
      setError(result.error || '예약 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  };

  const selectedTherapist = therapists.find((t) => t.id === form.therapistId);

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex flex-col">
      {/* Header */}
      <header className="page-header">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" id="back-to-home" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-600">
            ←
          </Link>
          <div>
            <h1 className="font-bold text-slate-800 text-base">도수치료 예약</h1>
            <p className="text-xs text-slate-400">마산 잘본병원</p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300
                ${i + 1 <= step ? 'bg-sky-500' : 'bg-slate-200'}`} />
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {step} / {STEPS.length} — {STEPS[step - 1]}
          </p>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {/* STEP 1: 환자 정보 */}
        {step === 1 && (
          <div className="animate-fade-in-up space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">환자 정보를 입력해 주세요</h2>
              <p className="text-slate-500 text-sm">예약 확인에 사용됩니다</p>
            </div>
            <div className="card space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-600 mb-1.5 block" htmlFor="patient-name">
                  이름 *
                </label>
                <input
                  id="patient-name"
                  className="input-field"
                  placeholder="홍길동"
                  value={form.patientName}
                  onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
                  maxLength={20}
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-600 mb-1.5 block" htmlFor="patient-phone">
                  휴대폰 번호 *
                </label>
                <input
                  id="patient-phone"
                  className="input-field"
                  placeholder="010-0000-0000"
                  type="tel"
                  value={form.patientPhone}
                  onChange={(e) => handlePhoneInput(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: 치료 시간 선택 */}
        {step === 2 && (
          <div className="animate-fade-in-up space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">치료 시간을 선택하세요</h2>
              <p className="text-slate-500 text-sm">담당 의사 처방에 따라 선택해 주세요</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([30, 50] as const).map((dur) => (
                <button
                  key={dur}
                  id={`duration-${dur}`}
                  onClick={() => setForm((f) => ({ ...f, duration: dur }))}
                  className={`card cursor-pointer transition-all duration-200 text-center p-6
                    ${form.duration === dur
                      ? 'border-2 border-sky-500 bg-sky-50 shadow-lg shadow-sky-100'
                      : 'border-2 border-transparent hover:border-sky-200'}`}
                >
                  <div className="text-4xl font-extrabold text-sky-500 mb-1">{dur}</div>
                  <div className="text-slate-600 font-medium">분</div>
                  {form.duration === dur && (
                    <div className="mt-2 text-xs text-sky-600 font-semibold">✓ 선택됨</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: 치료사 선택 */}
        {step === 3 && (
          <div className="animate-fade-in-up space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">치료사를 선택하세요</h2>
              <p className="text-slate-500 text-sm">선택하지 않으면 가능한 치료사로 배정됩니다</p>
            </div>
            <div className="space-y-2">
              {/* 상관없음 */}
              <button
                id="therapist-any"
                onClick={() => setForm((f) => ({ ...f, therapistId: null }))}
                className={`w-full card cursor-pointer transition-all duration-200 flex items-center gap-4 p-4
                  ${form.therapistId === null
                    ? 'border-2 border-sky-500 bg-sky-50'
                    : 'border-2 border-transparent hover:border-sky-100'}`}
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-300 to-slate-400
                                flex items-center justify-center text-xl">
                  👥
                </div>
                <div className="text-left">
                  <div className="font-bold text-slate-800">상관없음</div>
                  <div className="text-xs text-slate-500">가능한 치료사 자동 배정</div>
                </div>
                {form.therapistId === null && (
                  <div className="ml-auto text-sky-500 font-bold">✓</div>
                )}
              </button>

              {therapists.map((t) => (
                <button
                  key={t.id}
                  id={`therapist-${t.id}`}
                  onClick={() => setForm((f) => ({ ...f, therapistId: t.id }))}
                  className={`w-full card cursor-pointer transition-all duration-200 flex items-center gap-4 p-4
                    ${form.therapistId === t.id
                      ? 'border-2 border-sky-500 bg-sky-50'
                      : 'border-2 border-transparent hover:border-sky-100'}`}
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-bold"
                       style={{ backgroundColor: t.color }}>
                    {t.name[0]}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-800">{formatTherapistName(t.name)}</div>
                  </div>
                  {form.therapistId === t.id && (
                    <div className="ml-auto text-sky-500 font-bold">✓</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: 날짜 선택 */}
        {step === 4 && (
          <div className="animate-fade-in-up space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">날짜를 선택하세요</h2>
              <p className="text-slate-500 text-sm">일요일은 휴무입니다</p>
            </div>
            <div className="card">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button
                  id="prev-month"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                  className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-600"
                >
                  ‹
                </button>
                <span className="font-bold text-slate-700">
                  {calMonth.getFullYear()}년 {calMonth.getMonth() + 1}월
                </span>
                <button
                  id="next-month"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                  className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-600"
                >
                  ›
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <div key={d} className={`text-center text-xs font-semibold py-1
                    ${i === 0 ? 'text-red-400' : i === 6 ? 'text-sky-500' : 'text-slate-400'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-y-1">
                {calDays().map((date, i) => {
                  if (!date) return <div key={`empty-${i}`} />;
                  const dateStr = toDateStr(date);
                  const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const isClosed = !isOpenDay(date);
                  const isToday = dateStr === toDateStr(today);
                  const isSelected = form.date === dateStr;
                  const disabled = isPast || isClosed;

                  return (
                    <div key={dateStr} className="flex justify-center">
                      <button
                        id={`day-${dateStr}`}
                        onClick={() => !disabled && selectDate(date)}
                        className={`calendar-day
                          ${isSelected ? 'calendar-day-selected' : ''}
                          ${isToday && !isSelected ? 'calendar-day-today' : ''}
                          ${disabled ? 'calendar-day-disabled' : ''}
                          ${date.getDay() === 0 && !disabled ? 'text-red-400' : ''}
                          ${date.getDay() === 6 && !disabled && !isSelected ? 'text-sky-500' : ''}
                        `}
                      >
                        {date.getDate()}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {form.date && (
              <div className="bg-sky-50 rounded-2xl px-4 py-3 text-sky-700 text-sm font-semibold text-center">
                📅 {formatDate(form.date)} 선택됨
              </div>
            )}
          </div>
        )}

        {/* STEP 5: 시간 선택 */}
        {step === 5 && (
          <div className="animate-fade-in-up space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">시간을 선택하세요</h2>
              <p className="text-slate-500 text-sm">
                {form.date && formatDate(form.date)} · {form.duration}분
              </p>
            </div>

            {timeSlots.length === 0 ? (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-slate-500">이 날은 예약이 불가합니다</p>
              </div>
            ) : (
              <div className="card">
                {/* 오전 */}
                {timeSlots.some(t => parseInt(t.split(':')[0]) < 12) && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">오전</p>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.filter(t => parseInt(t.split(':')[0]) < 12).map(time => {
                        const status = getSlotStatus(time);
                        return (
                          <button
                            key={time}
                            id={`slot-${time}`}
                            onClick={() => status !== 'full' && setForm(f => ({ ...f, startTime: time }))}
                            className={`slot-btn ${
                              status === 'selected' ? 'slot-selected' :
                              status === 'full' ? 'slot-full' : 'slot-available'
                            }`}
                          >
                            {formatTime(time)}
                            {status === 'full' && <div className="text-xs">마감</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 오후 */}
                {timeSlots.some(t => parseInt(t.split(':')[0]) >= 12) && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">오후</p>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.filter(t => parseInt(t.split(':')[0]) >= 12).map(time => {
                        const status = getSlotStatus(time);
                        return (
                          <button
                            key={time}
                            id={`slot-${time}`}
                            onClick={() => status !== 'full' && setForm(f => ({ ...f, startTime: time }))}
                            className={`slot-btn ${
                              status === 'selected' ? 'slot-selected' :
                              status === 'full' ? 'slot-full' : 'slot-available'
                            }`}
                          >
                            {formatTime(time)}
                            {status === 'full' && <div className="text-xs">마감</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 text-xs text-slate-500 items-center">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-sky-100 border-2 border-sky-200" /> 예약 가능
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-sky-500" /> 선택됨
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-100 border-2 border-slate-100" /> 마감
              </span>
            </div>
          </div>
        )}

        {/* STEP 6: 최종 확인 */}
        {step === 6 && (
          <div className="animate-fade-in-up space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">예약 내용을 확인해 주세요</h2>
              <p className="text-slate-500 text-sm">아래 내용이 맞으면 예약을 신청하세요</p>
            </div>
            <div className="card space-y-4">
              <InfoRow icon="👤" label="이름" value={form.patientName} />
              <InfoRow icon="📱" label="휴대폰" value={form.patientPhone} />
              <InfoRow icon="⏱️" label="치료 시간" value={`${form.duration}분`} />
              <InfoRow
                icon="👨‍⚕️"
                label="치료사"
                value={selectedTherapist ? formatTherapistName(selectedTherapist.name) : '상관없음 (자동 배정)'}
              />
              <InfoRow icon="📅" label="날짜" value={form.date ? formatDate(form.date) : ''} />
              <InfoRow icon="🕐" label="시간" value={form.startTime ? formatTime(form.startTime) : ''} />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-600 text-sm">
                ⚠️ {error}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-amber-700 text-sm">
              💡 예약 신청 후 치료사 승인이 필요합니다
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <button
              id="prev-step-btn"
              onClick={() => setStep(s => s - 1)}
              className="btn-secondary flex-shrink-0 w-auto px-5"
            >
              ←
            </button>
          )}
          {step < 6 ? (
            <button
              id="next-step-btn"
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="btn-primary"
            >
              다음
            </button>
          ) : (
            <button
              id="submit-booking-btn"
              onClick={handleSubmit}
              disabled={loading || !canNext()}
              className="btn-primary"
            >
              {loading ? '예약 신청 중...' : '예약 신청하기 ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xl w-7 text-center">{icon}</span>
      <span className="text-slate-500 text-sm w-16 flex-shrink-0">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

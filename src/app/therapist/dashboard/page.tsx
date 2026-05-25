'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Reservation, Therapist } from '@/lib/types';
import { getTherapistReservations, updateReservationStatus, updateReservationDateTime, getSlotAvailability, deleteReservation, getTherapistLeaves, insertTherapistLeave, deleteTherapistLeave, updateReservationMemo } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatDate, formatTime, toDateStr, formatTherapistName, getAvailableSlots, isOpenDay, getOccupiedCountForSlot, getSlotError } from '@/lib/slots';

const STATUS_MAP = {
  pending:  { label: '승인 대기',      color: 'bg-amber-100 text-amber-700'   },
  approved: { label: '예약 확정',      color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '거절됨',         color: 'bg-red-100 text-red-600'       },
  done:     { label: '수납 대기',      color: 'bg-blue-100 text-blue-600'     },
  paid:     { label: '수납/치료 완료', color: 'bg-slate-100 text-slate-600'   },
  no_show:  { label: '노쇼', color: 'bg-rose-100 text-rose-700' },
};

type TabType = 'today' | 'pending' | 'approved' | 'all' | 'leaves';

export default function TherapistDashboard() {
  const router = useRouter();
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [leaves, setLeaves] = useState<import('@/lib/types').TherapistLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>('today');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 전체 예약 탭 년/월 picker
  const [allYear, setAllYear] = useState(new Date().getFullYear());
  const [allMonth, setAllMonth] = useState(new Date().getMonth() + 1);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);

  // 날짜/시간 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState<30 | 50>(50);
  const [editSlotAvailability, setEditSlotAvailability] = useState<{ id: string; start_time: string; duration: number }[]>([]);

  // 휴가 관리 폼 상태
  const [leaveCalYear, setLeaveCalYear] = useState(new Date().getFullYear());
  const [leaveCalMonth, setLeaveCalMonth] = useState(new Date().getMonth());
  const [selectedLeaveDate, setSelectedLeaveDate] = useState<string | null>(null);
  
  const [leaveDate, setLeaveDate] = useState(toDateStr(new Date()));
  const [leaveType, setLeaveType] = useState('연차');
  const [leaveReason, setLeaveReason] = useState('');

  const [newResCount, setNewResCount] = useState(0);
  const [memoTarget, setMemoTarget] = useState<{id: string; memo: string} | null>(null);
  const [memoInput, setMemoInput] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('jalbon_therapist');
    const role = sessionStorage.getItem('jalbon_role');
    if (!stored || role !== 'therapist') { router.push('/therapist/login'); return; }

    const loginTime = sessionStorage.getItem('jalbon_login_time');
    if (loginTime && Date.now() - parseInt(loginTime) > 8 * 60 * 60 * 1000) {
      sessionStorage.clear();
      document.cookie = 'jalbon_auth=; path=/; max-age=0';
      router.push('/therapist/login');
      return;
    }

    const t = JSON.parse(stored) as Therapist;
    setTherapist(t);
    loadReservations(t.id);

    const channel = supabase
      .channel(`therapist-reservations-${t.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations', filter: `therapist_id=eq.${t.id}` }, () => {
        setNewResCount(c => c + 1);
        loadReservations(t.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 외부 클릭 시 picker 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadReservations = async (therapistId: string) => {
    setLoading(true);
    const data = await getTherapistReservations(therapistId);
    setReservations(data);
    const leavesData = await getTherapistLeaves();
    setLeaves(leavesData.filter(l => l.therapist_id === therapistId));
    setLoading(false);
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected' | 'done') => {
    setActionLoading(id);
    await updateReservationStatus(id, status, undefined, status === 'approved' ? therapist?.id : undefined);
    if (therapist) await loadReservations(therapist.id);
    setActionLoading(null);
  };

  const startEdit = (res: Reservation) => {
    setEditingId(res.id);
    setEditDate(res.date);
    setEditTime(res.start_time.slice(0, 5));
    setEditDuration(res.duration);
    if (therapist) getSlotAvailability(res.date, therapist.id).then(setEditSlotAvailability);
  };

  const handleEditDateChange = (date: string) => {
    setEditDate(date);
    setEditTime('');
    if (date && therapist) getSlotAvailability(date, therapist.id).then(setEditSlotAvailability);
  };

  const handleEditDurationChange = (dur: 30 | 50) => {
    setEditDuration(dur);
    setEditTime('');
  };

  const handleEditSave = async (res: Reservation) => {
    if (!editDate || !editTime) return;
    setActionLoading(res.id);
    const time = editTime.includes(':') && editTime.length === 5 ? editTime + ':00' : editTime;
    await updateReservationDateTime(res.id, editDate, time, editDuration);
    if (therapist) await loadReservations(therapist.id);
    setEditingId(null);
    setActionLoading(null);
  };

  const handleDelete = async (resId: string) => {
    if (!confirm('정말로 이 예약을 삭제하시겠습니까?')) return;
    setActionLoading(resId);
    const result = await deleteReservation(resId, therapist?.name || '치료사');
    if (!result.success) alert('예약 삭제에 실패했습니다.');
    else if (therapist) await loadReservations(therapist.id);
    setActionLoading(null);
  };

  const logout = () => { sessionStorage.clear(); document.cookie = 'jalbon_auth=; path=/; max-age=0'; router.push('/therapist/login'); };

  const todayStr = toDateStr(new Date());
  const todayRes = reservations.filter(r => r.date === todayStr);
  const pendingRes = reservations.filter(r => r.status === 'pending');
  const approvedRes = reservations.filter(r => r.status === 'approved');

  const allMonthStr = `${allYear}-${String(allMonth).padStart(2, '0')}`;
  const allMonthRes = reservations.filter(r => r.date.startsWith(allMonthStr));

  const displayedMap: Partial<Record<TabType, Reservation[]>> = {
    today: todayRes,
    pending: pendingRes,
    approved: approvedRes,
    all: allMonthRes,
  };
  const displayed = (displayedMap[tab] || []).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  if (!therapist) return null;

  return (
    <div className="min-h-screen bg-[#F0F9FF]">
      {/* Header */}
      <header className="page-header">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-lg"
                 style={{ backgroundColor: therapist.color }}>
              {therapist.name[0]}
            </div>
            <div>
              <h1 className="font-bold text-slate-800">{formatTherapistName(therapist.name)}</h1>
              <p className="text-xs text-slate-400">도수치료실 관리</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {newResCount > 0 && (
              <button
                onClick={() => { setNewResCount(0); setTab('pending'); }}
                className="text-xs text-white font-semibold px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 transition-colors animate-pulse-soft"
              >
                🔔 신규 {newResCount}건
              </button>
            )}
            <Link href="/" id="patient-view-link"
                  className="text-xs text-sky-500 font-semibold px-3 py-1.5 rounded-xl border border-sky-200 hover:bg-sky-50 transition-colors">
              환자화면
            </Link>
            <button id="logout-btn" onClick={logout}
                    className="text-xs text-slate-500 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Tabs: 오늘 예약 / 승인대기 / 치료확정 / 전체 예약 / 휴가 관리 */}
        <div className="grid grid-cols-5 gap-2">
          {([
            { id: 'today',    label: '오늘 예약',  count: todayRes.length,    color: 'text-sky-600'   },
            { id: 'pending',  label: '예약 승인 대기', count: pendingRes.length,  color: 'text-amber-600' },
            { id: 'approved', label: '치료 완료',  count: approvedRes.length, color: 'text-emerald-600' },
            { id: 'all',      label: `${allMonth}월 예약`,  count: allMonthRes.length, color: 'text-slate-600' },
            { id: 'leaves',   label: '휴가 관리',  count: leaves.length,      color: 'text-indigo-600' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id as TabType); setEditingId(null); }}
              className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1
                ${tab === t.id
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-200'
                  : `bg-white ${t.color} border border-slate-200 hover:border-sky-200`}
                ${t.id === 'pending' && pendingRes.length > 0 && tab !== 'pending' ? 'border-amber-300 bg-amber-50' : ''}`}
            >
              <span className={`text-lg font-extrabold leading-none ${tab === t.id ? 'text-white' : t.color}`}>{t.count}</span>
              <span className={`leading-tight ${tab === t.id ? 'text-white' : 'text-slate-500'}`}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* 전체 예약 탭 - 년/월 picker */}
        {tab === 'all' && (
          <div className="flex items-center justify-between card py-3 px-4 animate-fade-in-up relative z-50">
            <div className="flex items-center gap-2">
              <button onClick={() => { const d = new Date(allYear, allMonth - 2); setAllYear(d.getFullYear()); setAllMonth(d.getMonth() + 1); }}
                className="text-slate-400 hover:text-sky-500 font-bold text-lg transition-colors">◀</button>
              <button
                onClick={() => { setPickerYear(allYear); setShowPicker(v => !v); }}
                className="font-extrabold text-lg text-slate-700 hover:text-sky-600 transition-colors cursor-pointer"
              >
                {allYear}년 {allMonth}월
              </button>
              <button onClick={() => { const d = new Date(allYear, allMonth); setAllYear(d.getFullYear()); setAllMonth(d.getMonth() + 1); }}
                className="text-slate-400 hover:text-sky-500 font-bold text-lg transition-colors">▶</button>
            </div>
            <span className="text-xs text-slate-400">{allMonthRes.length}건</span>

            {/* 피커 팝업 */}
            {showPicker && (
              <div ref={pickerRef} className="absolute top-auto mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-64"
                style={{ left: '50%', transform: 'translateX(-50%)', top: 'auto', marginTop: '60px' }}>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setPickerYear(y => y - 1)} className="text-slate-400 hover:text-sky-500 font-bold">◀</button>
                  <span className="font-bold text-slate-700">{pickerYear}년</span>
                  <button onClick={() => setPickerYear(y => y + 1)} className="text-slate-400 hover:text-sky-500 font-bold">▶</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((m, i) => (
                    <button key={i}
                      onClick={() => { setAllYear(pickerYear); setAllMonth(i + 1); setShowPicker(false); }}
                      className={`py-2 rounded-xl text-sm font-semibold transition-all
                        ${allYear === pickerYear && allMonth === i + 1
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-50 text-slate-600 hover:bg-sky-50'}`}
                    >{m}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 휴가 관리 탭 (달력 UI) */}
        {tab === 'leaves' && (() => {
          const firstDay = new Date(leaveCalYear, leaveCalMonth, 1).getDay();
          const daysInMonth = new Date(leaveCalYear, leaveCalMonth + 1, 0).getDate();
          const calendarDays = [];
          for (let i = 0; i < firstDay; i++) calendarDays.push(null);
          for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

          return (
            <div className="space-y-4 animate-fade-in-up">
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <button onClick={() => {
                    if (leaveCalMonth === 0) { setLeaveCalYear(y => y-1); setLeaveCalMonth(11); }
                    else setLeaveCalMonth(m => m-1);
                  }} className="p-2 text-slate-400 hover:text-sky-500 font-bold">◀</button>
                  <h2 className="font-bold text-lg text-slate-800">{leaveCalYear}년 {leaveCalMonth + 1}월 휴무 관리</h2>
                  <button onClick={() => {
                    if (leaveCalMonth === 11) { setLeaveCalYear(y => y+1); setLeaveCalMonth(0); }
                    else setLeaveCalMonth(m => m+1);
                  }} className="p-2 text-slate-400 hover:text-sky-500 font-bold">▶</button>
                </div>
                
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일','월','화','수','목','금','토'].map((d, i) => (
                    <div key={d} className={`text-xs font-bold py-2 ${i===0 ? 'text-rose-500' : i===6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
                  ))}
                  {calendarDays.map((d, i) => {
                    if (!d) return <div key={`empty-${i}`} className="p-2" />;
                    const dateStr = `${leaveCalYear}-${String(leaveCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dayLeaves = leaves.filter(l => l.date === dateStr);
                    const isToday = dateStr === toDateStr(new Date());
                    return (
                      <div key={d} onClick={() => { setLeaveDate(dateStr); setSelectedLeaveDate(dateStr); }}
                           className={`min-h-[80px] border border-slate-100 rounded-xl p-1 cursor-pointer transition-colors relative flex flex-col items-center hover:border-sky-300 hover:shadow-sm ${isToday ? 'bg-sky-50/50 ring-1 ring-sky-200' : 'bg-white'}`}>
                        <span className={`text-xs font-bold mt-1 ${i%7===0 ? 'text-rose-500' : i%7===6 ? 'text-blue-500' : 'text-slate-700'}`}>{d}</span>
                        <div className="mt-1 w-full flex flex-col gap-1 px-0.5">
                          {dayLeaves.map(l => (
                            <div key={l.id} className="bg-indigo-100 text-indigo-700 text-[9px] px-1 py-0.5 rounded font-bold truncate" title={`${l.start_time}~${l.end_time}`}>
                              {(() => {
                                const match = l.reason?.match(/^\[(.*?)\]/);
                                return match ? match[1] : (l.start_time === '00:00' ? '연차' : l.start_time === '09:00' ? '오전반차' : l.start_time === '12:30' ? '오후반차' : '휴무');
                              })()}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedLeaveDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                  <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-slate-800 text-lg">{selectedLeaveDate.split('-')[1]}월 {selectedLeaveDate.split('-')[2]}일 휴무 등록</h3>
                      <button onClick={() => setSelectedLeaveDate(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-600 block mb-1">날짜</label>
                        <input type="date" className="input-field" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-600 block mb-1">휴무 종류</label>
                        <select className="input-field" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                          <option value="오전반차">오전반차</option>
                          <option value="오후반차">오후반차</option>
                          <option value="연차">연차</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-600 block mb-1">사유</label>
                        <input type="text" placeholder="사유 (선택)" className="input-field" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} />
                      </div>
                    </div>
                    <button 
                      className="btn-primary w-full mt-2 py-3"
                      onClick={async () => {
                        if (!therapist) return;
                        
                        let startT = '00:00';
                        let endT = '23:59';
                        if (leaveType === '오전반차') {
                          startT = '09:00';
                          endT = '13:30';
                        } else if (leaveType === '오후반차') {
                          startT = '12:30';
                          endT = '23:59';
                        }
                        
                        const existingLeavesOnDate = leaves.filter(l => l.date === leaveDate);
                        const hasAnnual = existingLeavesOnDate.some(l => l.reason?.includes('연차') || l.start_time === '00:00');
                        const hasMorning = existingLeavesOnDate.some(l => l.reason?.includes('오전반차') || l.start_time === '09:00');
                        const hasAfternoon = existingLeavesOnDate.some(l => l.reason?.includes('오후반차') || l.start_time === '12:30');

                        if (leaveType === '연차' && existingLeavesOnDate.length > 0) {
                          return alert('이미 해당 날짜에 다른 휴무가 등록되어 있어 연차를 추가할 수 없습니다.');
                        }
                        if (leaveType === '오전반차' && (hasAnnual || hasMorning)) {
                          return alert('이미 해당 날짜에 연차 또는 오전반차가 등록되어 있습니다.');
                        }
                        if (leaveType === '오후반차' && (hasAnnual || hasAfternoon)) {
                          return alert('이미 해당 날짜에 연차 또는 오후반차가 등록되어 있습니다.');
                        }
                        
                        const overlappingRes = reservations.filter(r => {
                          if (r.date !== leaveDate) return false;
                          if (r.status === 'rejected' || r.status === 'no_show') return false;
                          const rStart = r.start_time.slice(0, 5);
                          return rStart >= startT && rStart < endT;
                        });

                        if (overlappingRes.length > 0) {
                          const patientListStr = overlappingRes.map(r => `${r.patient_name}(${r.start_time.slice(0,5)})`).join(', ');
                          alert(`해당 시간에 예약된 환자가 있습니다: ${patientListStr}\n예약을 먼저 취소하거나 변경한 후 휴무를 등록해주세요.`);
                          return;
                        }

                        setActionLoading('leave');
                        const res = await insertTherapistLeave(therapist.id, leaveDate, startT, endT, `[${leaveType}] ${leaveReason}`.trim());
                        if (res.success) {
                          setLeaveReason('');
                          setSelectedLeaveDate(null);
                          await loadReservations(therapist.id);
                        } else {
                          alert('휴가 등록에 실패했습니다.');
                        }
                        setActionLoading(null);
                      }}
                      disabled={actionLoading === 'leave'}
                    >
                      {actionLoading === 'leave' ? '등록 중...' : '휴가 등록하기'}
                    </button>
                    
                    {/* 해당 날짜의 기존 휴무 내역 리스트 */}
                    {(() => {
                      const existingLeaves = leaves.filter(l => l.date === leaveDate);
                      if (existingLeaves.length > 0) {
                        return (
                          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                            <h4 className="text-xs font-bold text-slate-500 mb-2">이 날짜의 등록된 휴무</h4>
                            {existingLeaves.map(l => (
                              <div key={l.id} className="bg-slate-50 p-2.5 rounded-xl flex justify-between items-center border border-slate-100">
                                <div>
                                  {(() => {
                                    const match = l.reason?.match(/^\[(.*?)\]/);
                                    const typeStr = match ? match[1] : (l.start_time === '00:00' ? '연차' : l.start_time === '09:00' ? '오전반차' : l.start_time === '12:30' ? '오후반차' : '휴무');
                                    const reasonStr = l.reason?.replace(/^\[.*?\]\s*/, '');
                                    return (
                                      <>
                                        <div className="text-sm font-bold text-indigo-600">{typeStr}</div>
                                        <div className="text-[10px] text-slate-500 font-medium">{reasonStr || '사유 없음'}</div>
                                      </>
                                    );
                                  })()}
                                </div>
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">등록됨</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 예약 목록 */}
        {tab !== 'leaves' && (
          loading ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3 animate-pulse-soft">⏳</div>
            <p className="text-slate-400">불러오는 중...</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="card text-center py-12 animate-fade-in-up">
            <div className="text-4xl mb-3">📭</div>
            <p className="font-semibold text-slate-700">
              {tab === 'pending' ? '승인 대기 중인 예약이 없습니다' :
               tab === 'approved' ? '치료 확정된 예약이 없습니다' :
               tab === 'today' ? '오늘 예약이 없습니다' : '예약이 없습니다'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in-up">
            {displayed.map(res => {
              const statusInfo = STATUS_MAP[res.status];
              const isEditing = editingId === res.id;
              return (
                <div key={res.id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-slate-800 text-lg">
                        {formatTime(res.start_time)}
                        <span className="text-sm text-slate-400 font-normal ml-2">{res.duration}분</span>
                      </p>
                      <p className="text-slate-500 text-sm">{formatDate(res.date)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`status-badge ${statusInfo.color}`}>{statusInfo.label}</span>
                      {!res.therapist_id && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-bold">치료사 미지정</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-slate-600 mb-3">
                    <p>👤 <strong>{res.patient_name}</strong></p>
                    <p>📱 {res.patient_phone}</p>
                    {res.pin && <p className="text-xs text-slate-400 mt-1">🔒 PIN: {res.pin}</p>}
                    {res.internal_memo && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 font-medium">
                        📝 {res.internal_memo}
                      </div>
                    )}
                  </div>

                  {/* 날짜/시간 변경 섹션 */}
                  {isEditing ? (
                    <div className="mt-2 p-3 bg-sky-50 rounded-2xl border border-sky-100 space-y-3">
                      <p className="text-xs font-bold text-sky-700">📅 날짜/시간 변경</p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 mb-1 block">날짜</label>
                          <input type="date" className="input-field text-sm" value={editDate}
                            onChange={e => handleEditDateChange(e.target.value)} />
                        </div>
                        <div className="w-24">
                          <label className="text-xs text-slate-500 mb-1 block">치료 시간</label>
                          <select className="input-field text-sm" value={editDuration}
                            onChange={e => handleEditDurationChange(Number(e.target.value) as 30 | 50)}>
                            <option value={30}>30분</option>
                            <option value={50}>50분</option>
                          </select>
                        </div>
                      </div>
                      {editDate && (() => {
                        const dateObj = new Date(editDate + 'T00:00:00');
                        const slots = getAvailableSlots(dateObj, editDuration);
                        if (!isOpenDay(dateObj)) return <p className="text-xs text-red-400 text-center py-2">해당 날짜는 휴무입니다</p>;
                        if (slots.length === 0) return <p className="text-xs text-slate-400 text-center py-2">예약 가능한 시간이 없습니다</p>;
                        const amSlots = slots.filter(t => parseInt(t.split(':')[0]) < 12);
                        const pmSlots = slots.filter(t => parseInt(t.split(':')[0]) >= 12);
                        return (
                          <div className="space-y-2">
                            <label className="text-xs text-slate-500 block">시작 시간 선택</label>
                            {amSlots.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 mb-1">오전</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {amSlots.map(time => {
                                    const err = getSlotError(time, editDuration, dateObj);
                                    const count = getOccupiedCountForSlot(time, editDuration, editSlotAvailability, res.id);
                                    const isDisabled = count >= 1 || err !== null;
                                    const isSelected = editTime === time;
                                    return (
                                      <button key={time} disabled={isDisabled} onClick={() => !isDisabled && setEditTime(time)}
                                        className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${isSelected ? 'bg-sky-500 text-white' : isDisabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border border-sky-200 text-slate-700 hover:bg-sky-50'}`}>
                                        {formatTime(time)}
                                        {isDisabled && !isSelected && <div className="text-[9px]">{err || '마감'}</div>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {pmSlots.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 mb-1">오후</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {pmSlots.map(time => {
                                    const err = getSlotError(time, editDuration, dateObj);
                                    const count = getOccupiedCountForSlot(time, editDuration, editSlotAvailability, res.id);
                                    const isDisabled = count >= 1 || err !== null;
                                    const isSelected = editTime === time;
                                    return (
                                      <React.Fragment key={time}>
                                        <button disabled={isDisabled} onClick={() => !isDisabled && setEditTime(time)}
                                          className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${isSelected ? 'bg-sky-500 text-white' : isDisabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border border-sky-200 text-slate-700 hover:bg-sky-50'}`}>
                                          {formatTime(time)}
                                          {isDisabled && !isSelected && <div className="text-[9px]">{err || '마감'}</div>}
                                        </button>
                                        {time === '12:00' && dateObj.getDay() !== 6 && (
                                          <div className="col-span-2 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-xs font-medium">
                                            점심시간 12:30 ~ 1:30
                                          </div>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleEditSave(res)} disabled={actionLoading === res.id || !editDate || !editTime}
                          className="btn-success flex-1 text-sm py-2">
                          {actionLoading === res.id ? '저장 중...' : '✓ 저장'}
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary flex-1 text-sm py-2">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {res.status !== 'done' && res.status !== 'paid' && (
                        <>
                          <button onClick={() => startEdit(res)}
                            className="w-full py-1.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200">
                            📅 날짜/시간 변경
                          </button>
                          <button onClick={() => handleDelete(res.id)} disabled={actionLoading === res.id}
                            className="w-full py-1.5 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors border border-red-200">
                            {actionLoading === res.id ? '삭제 중...' : '🗑 예약 삭제'}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { setMemoTarget({ id: res.id, memo: res.internal_memo || '' }); setMemoInput(res.internal_memo || ''); }}
                        className={`w-full py-1.5 rounded-xl text-xs font-semibold transition-colors border ${res.internal_memo ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                      >
                        {res.internal_memo ? '📝 메모 수정' : '📝 메모 추가'}
                      </button>
                    </div>
                  )}

                  {/* 승인/거절 버튼 (승인대기 탭) */}
                  {res.status === 'pending' && (
                    <div className="flex gap-2">
                      <button id={`approve-${res.id}`} onClick={() => handleAction(res.id, 'approved')} disabled={actionLoading === res.id}
                        className="btn-success flex-1">
                        {actionLoading === res.id ? '처리 중...' : '✓ 승인'}
                      </button>
                      <button id={`reject-${res.id}`} onClick={() => handleAction(res.id, 'rejected')} disabled={actionLoading === res.id}
                        className="btn-danger flex-1">
                        ✕ 거절
                      </button>
                    </div>
                  )}
                  {/* 치료 완료 처리 버튼 (치료확정 탭) */}
                  {res.status === 'approved' && (
                    <button id={`done-${res.id}`} onClick={() => handleAction(res.id, 'done')} disabled={actionLoading === res.id}
                      className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-colors">
                      {actionLoading === res.id ? '처리 중...' : '치료 완료 처리'}
                    </button>
                  )}
                  {res.status === 'rejected' && (
                    <button onClick={() => handleAction(res.id, 'approved')} disabled={actionLoading === res.id}
                      className="w-full py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-sm font-semibold transition-colors mt-2">
                      {actionLoading === res.id ? '처리 중...' : '↺ 다시 승인하기'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          )
        )}
      </div>

      {/* 메모 편집 모달 */}
      {memoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
            <h3 className="font-bold text-slate-800 text-lg">📝 내부 메모</h3>
            <p className="text-xs text-slate-400">환자에게는 표시되지 않는 내부 메모입니다.</p>
            <textarea
              className="input-field min-h-[120px] resize-none"
              placeholder="내부 메모를 입력하세요..."
              value={memoInput}
              onChange={(e) => setMemoInput(e.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={async () => {
                  setMemoSaving(true);
                  await updateReservationMemo(memoTarget.id, memoInput);
                  setMemoSaving(false);
                  setMemoTarget(null);
                  if (therapist) loadReservations(therapist.id);
                }}
                disabled={memoSaving}
                className="btn-primary flex-1 py-2 text-sm"
              >
                {memoSaving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setMemoTarget(null)} className="btn-secondary flex-1 py-2 text-sm">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

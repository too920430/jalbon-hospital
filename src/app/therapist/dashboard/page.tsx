'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Reservation, Therapist } from '@/lib/types';
import { getTherapistReservations, updateReservationStatus, updateReservationDateTime, getSlotAvailability, getMaxBeds } from '@/lib/api';
import { formatDate, formatTime, toDateStr, formatTherapistName, getAvailableSlots, isOpenDay } from '@/lib/slots';

const STATUS_MAP = {
  pending:  { label: '승인 대기', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '예약 확정', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '거절됨',   color: 'bg-red-100 text-red-600'      },
  done:     { label: '치료 완료', color: 'bg-slate-100 text-slate-600'  },
};

export default function TherapistDashboard() {
  const router = useRouter();
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [tab, setTab] = useState<'today' | 'all' | 'calendar'>('today');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // 날짜/시간 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState<30 | 50>(50);
  const [editSlotAvailability, setEditSlotAvailability] = useState<{ [time: string]: number }>({});
  const [editMaxBeds, setEditMaxBeds] = useState(5);

  // 스탯 카드 필터 상태
  const [showAll, setShowAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem('jalbon_therapist');
    const role = sessionStorage.getItem('jalbon_role');
    if (!stored || role !== 'therapist') {
      router.push('/therapist/login');
      return;
    }
    const t = JSON.parse(stored) as Therapist;
    setTherapist(t);
    loadReservations(t.id);
  }, []);

  const loadReservations = async (therapistId: string) => {
    setLoading(true);
    const data = await getTherapistReservations(therapistId);
    setReservations(data);
    setLoading(false);
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected' | 'done') => {
    setActionLoading(id);
    await updateReservationStatus(id, status);
    if (therapist) await loadReservations(therapist.id);
    setActionLoading(null);
  };

  const startEdit = (res: Reservation) => {
    setEditingId(res.id);
    setEditDate(res.date);
    setEditTime(res.start_time.slice(0, 5));
    setEditDuration(res.duration);
    setEditMaxBeds(getMaxBeds());
    // 해당 날짜 슬롯 가용성 조회
    getSlotAvailability(res.date, null).then(setEditSlotAvailability);
  };

  // 편집 날짜/치료시간 변경 시 슬롯 재조회
  const handleEditDateChange = (date: string) => {
    setEditDate(date);
    setEditTime(''); // 날짜 바뀌면 시간 초기화
    if (date) getSlotAvailability(date, null).then(setEditSlotAvailability);
  };

  const handleEditDurationChange = (dur: 30 | 50) => {
    setEditDuration(dur);
    setEditTime(''); // 치료시간 바뀌면 시간 초기화
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

  // 스탯 카드 클릭 핸들러
  const handleStatClick = (type: 'today' | 'pending' | 'all') => {
    setEditingId(null);
    if (type === 'today') {
      setTab('today');
      setShowAll(false);
      setStatusFilter('');
    } else if (type === 'pending') {
      setTab('all');
      setShowAll(true);
      setStatusFilter('pending');
    } else {
      setTab('all');
      setShowAll(true);
      setStatusFilter('');
    }
  };

  const logout = () => {
    sessionStorage.clear();
    router.push('/therapist/login');
  };

  const todayStr = toDateStr(new Date());
  const todayRes = reservations.filter((r) => r.date === todayStr);
  const pendingCount = reservations.filter((r) => r.status === 'pending').length;

  const allDateRes = showAll
    ? reservations
    : reservations.filter((r) => r.date === selectedDate);
  const baseDisplayed = tab === 'today' ? todayRes : allDateRes;
  const displayed = statusFilter
    ? baseDisplayed.filter((r) => r.status === statusFilter)
    : baseDisplayed;

  // Calendar logic
  const calYear = currentMonth.getFullYear();
  const calMonth = currentMonth.getMonth();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  const prevMonth = () => setCurrentMonth(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(calYear, calMonth + 1, 1));

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

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

        {/* Stats - 클릭 가능 */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="오늘 예약"
            value={todayRes.length}
            color="text-sky-600"
            active={tab === 'today' && !statusFilter}
            onClick={() => handleStatClick('today')}
          />
          <StatCard
            label="승인 대기"
            value={pendingCount}
            color="text-amber-600"
            highlight={pendingCount > 0}
            active={statusFilter === 'pending'}
            onClick={() => handleStatClick('pending')}
          />
          <StatCard
            label="전체 예약"
            value={reservations.length}
            color="text-slate-600"
            active={tab === 'all' && showAll && !statusFilter}
            onClick={() => handleStatClick('all')}
          />
        </div>

        {/* 필터 배지 */}
        {statusFilter && (
          <div className="flex items-center gap-2 animate-fade-in-up">
            <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
              {STATUS_MAP[statusFilter as keyof typeof STATUS_MAP]?.label} 필터 적용 중
            </span>
            <button
              onClick={() => setStatusFilter('')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              ✕ 필터 해제
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            id="tab-today"
            onClick={() => { setTab('today'); setShowAll(false); setStatusFilter(''); setEditingId(null); }}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${tab === 'today' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            오늘 예약 {todayRes.length > 0 && `(${todayRes.length})`}
          </button>
          <button
            id="tab-all"
            onClick={() => { setTab('all'); setShowAll(false); setStatusFilter(''); setEditingId(null); }}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${tab === 'all' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            날짜별 조회
          </button>
          <button
            id="tab-calendar"
            onClick={() => { setTab('calendar'); setShowAll(false); setStatusFilter(''); setEditingId(null); }}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${tab === 'calendar' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            월별 조회
          </button>
        </div>

        {/* Calendar View */}
        {tab === 'calendar' && (
          <div className="card animate-fade-in-up p-4">
            <div className="flex items-center justify-between mb-4 px-2">
              <button onClick={prevMonth} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors">◀</button>
              <h2 className="font-bold text-lg text-slate-700">{calYear}년 {calMonth + 1}월</h2>
              <button onClick={nextMonth} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors">▶</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2 text-xs font-semibold text-slate-400">
              <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-sky-400">토</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} className="h-16 rounded-xl bg-slate-50" />;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayRes = reservations.filter(r => r.date === dateStr);
                const isToday = dateStr === todayStr;
                return (
                  <div
                    key={day}
                    onClick={() => { setSelectedDate(dateStr); setTab('all'); setShowAll(false); setStatusFilter(''); }}
                    className={`h-16 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      isToday ? 'border-sky-500 bg-sky-50' : 'border-slate-100 bg-white hover:bg-slate-50 hover:border-sky-200'
                    }`}
                  >
                    <span className={`text-xs font-bold ${isToday ? 'text-sky-600' : 'text-slate-600'}`}>{day}</span>
                    {dayRes.length > 0 && (
                      <span className="mt-1 text-[10px] font-bold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">
                        {dayRes.length}건
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 text-center mt-4">날짜를 클릭하면 해당 일자의 예약 현황을 볼 수 있습니다.</p>
          </div>
        )}

        {/* Date picker for 'all' tab */}
        {tab === 'all' && !showAll && (
          <div className="card animate-fade-in-up">
            <label className="text-sm font-semibold text-slate-600 mb-2 block">날짜 선택</label>
            <input
              id="date-picker"
              type="date"
              className="input-field"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        )}

        {tab === 'all' && showAll && (
          <div className="flex items-center gap-2 px-1 animate-fade-in-up">
            <span className="text-xs text-slate-500 font-medium">전체 날짜 조회 중</span>
            <button
              onClick={() => { setShowAll(false); setStatusFilter(''); }}
              className="text-xs text-sky-500 font-semibold hover:underline"
            >
              날짜별 조회로 전환
            </button>
          </div>
        )}

        {/* Reservations list */}
        {tab !== 'calendar' && (
          loading ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3 animate-pulse-soft">⏳</div>
              <p className="text-slate-400">불러오는 중...</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-semibold text-slate-700">예약이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in-up">
              {displayed
                .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
                .map((res) => {
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
                        <span className={`status-badge ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-slate-600 mb-3">
                        <p>👤 <strong>{res.patient_name}</strong></p>
                        <p>📱 {res.patient_phone}</p>
                        {res.pin && <p className="text-xs text-slate-400 mt-1">🔒 PIN: {res.pin}</p>}
                      </div>

                      {/* 날짜/시간 변경 섹션 */}
                      {isEditing ? (
                        <div className="mt-2 p-3 bg-sky-50 rounded-2xl border border-sky-100 space-y-3">
                          <p className="text-xs font-bold text-sky-700">📅 날짜/시간 변경</p>
                          {/* 날짜 + 치료시간 */}
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-xs text-slate-500 mb-1 block">날짜</label>
                              <input
                                type="date"
                                className="input-field text-sm"
                                value={editDate}
                                onChange={(e) => handleEditDateChange(e.target.value)}
                              />
                            </div>
                            <div className="w-24">
                              <label className="text-xs text-slate-500 mb-1 block">치료 시간</label>
                              <select
                                className="input-field text-sm"
                                value={editDuration}
                                onChange={(e) => handleEditDurationChange(Number(e.target.value) as 30 | 50)}
                              >
                                <option value={30}>30분</option>
                                <option value={50}>50분</option>
                              </select>
                            </div>
                          </div>

                          {/* 시간 슬롯 그리드 */}
                          {editDate && (() => {
                            const dateObj = new Date(editDate + 'T00:00:00');
                            const slots = getAvailableSlots(dateObj, editDuration);
                            if (!isOpenDay(dateObj)) return (
                              <p className="text-xs text-red-400 text-center py-2">해당 날짜는 휴무입니다</p>
                            );
                            if (slots.length === 0) return (
                              <p className="text-xs text-slate-400 text-center py-2">예약 가능한 시간이 없습니다</p>
                            );

                            const amSlots = slots.filter(t => parseInt(t.split(':')[0]) < 12);
                            const pmSlots = slots.filter(t => parseInt(t.split(':')[0]) >= 12);

                            return (
                              <div className="space-y-2">
                                <label className="text-xs text-slate-500 block">시작 시간 선택</label>
                                {amSlots.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">오전</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {amSlots.map(time => {
                                        const count = editSlotAvailability[time] || 0;
                                        // 현재 수정 중인 예약의 원래 슬롯은 1개 빼서 계산 (본인 자리 제외)
                                        const occupied = (res.date === editDate && res.start_time.slice(0,5) === time)
                                          ? Math.max(0, count - 1) : count;
                                        const isFull = occupied >= editMaxBeds;
                                        const isSelected = editTime === time;
                                        return (
                                          <button
                                            key={time}
                                            disabled={isFull}
                                            onClick={() => !isFull && setEditTime(time)}
                                            className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                              isSelected
                                                ? 'bg-sky-500 text-white shadow-sm'
                                                : isFull
                                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                                  : 'bg-white border border-sky-200 text-slate-700 hover:bg-sky-50'
                                            }`}
                                          >
                                            {formatTime(time)}
                                            {isFull && <div className="text-[9px] leading-tight">마감</div>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {pmSlots.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">오후</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {pmSlots.map(time => {
                                        const count = editSlotAvailability[time] || 0;
                                        const occupied = (res.date === editDate && res.start_time.slice(0,5) === time)
                                          ? Math.max(0, count - 1) : count;
                                        const isFull = occupied >= editMaxBeds;
                                        const isSelected = editTime === time;
                                        return (
                                          <button
                                            key={time}
                                            disabled={isFull}
                                            onClick={() => !isFull && setEditTime(time)}
                                            className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                              isSelected
                                                ? 'bg-sky-500 text-white shadow-sm'
                                                : isFull
                                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                                  : 'bg-white border border-sky-200 text-slate-700 hover:bg-sky-50'
                                            }`}
                                          >
                                            {formatTime(time)}
                                            {isFull && <div className="text-[9px] leading-tight">마감</div>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* 범례 */}
                                <div className="flex gap-3 text-[10px] text-slate-400 pt-1">
                                  <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded bg-white border border-sky-200" /> 예약 가능
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded bg-sky-500" /> 선택됨
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded bg-slate-100" /> 마감
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleEditSave(res)}
                              disabled={actionLoading === res.id || !editDate || !editTime}
                              className="btn-success flex-1 text-sm py-2"
                            >
                              {actionLoading === res.id ? '저장 중...' : '✓ 저장'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="btn-secondary flex-1 text-sm py-2"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(res)}
                          className="w-full mb-2 py-1.5 rounded-xl text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200"
                        >
                          📅 날짜/시간 변경
                        </button>
                      )}

                      {/* 승인/거절/완료 버튼 */}
                      {res.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            id={`approve-${res.id}`}
                            onClick={() => handleAction(res.id, 'approved')}
                            disabled={actionLoading === res.id}
                            className="btn-success flex-1"
                          >
                            {actionLoading === res.id ? '처리 중...' : '✓ 승인'}
                          </button>
                          <button
                            id={`reject-${res.id}`}
                            onClick={() => handleAction(res.id, 'rejected')}
                            disabled={actionLoading === res.id}
                            className="btn-danger flex-1"
                          >
                            ✕ 거절
                          </button>
                        </div>
                      )}
                      {res.status === 'approved' && (
                        <button
                          id={`done-${res.id}`}
                          onClick={() => handleAction(res.id, 'done')}
                          disabled={actionLoading === res.id}
                          className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-colors"
                        >
                          치료 완료 처리
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, highlight, active, onClick }: {
  label: string; value: number; color: string; highlight?: boolean; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card text-center py-4 w-full cursor-pointer transition-all hover:shadow-md
        ${highlight ? 'border-2 border-amber-300 bg-amber-50' : ''}
        ${active ? 'ring-2 ring-sky-400 shadow-md bg-sky-50' : ''}`}
    >
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">클릭하여 조회</div>
    </button>
  );
}

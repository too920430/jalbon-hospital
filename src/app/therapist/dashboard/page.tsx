'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Reservation, Therapist } from '@/lib/types';
import { getTherapistReservations, updateReservationStatus } from '@/lib/api';
import { formatDate, formatTime, toDateStr, formatTherapistName } from '@/lib/slots';

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

  const logout = () => {
    sessionStorage.clear();
    router.push('/therapist/login');
  };

  const todayRes = reservations.filter((r) => r.date === toDateStr(new Date()));
  const dateRes  = reservations.filter((r) => r.date === selectedDate);
  const displayed = tab === 'today' ? todayRes : dateRes;
  const pendingCount = todayRes.filter((r) => r.status === 'pending').length;

  // Calendar logic
  const calYear = currentMonth.getFullYear();
  const calMonth = currentMonth.getMonth();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  const prevMonth = () => setCurrentMonth(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(calYear, calMonth + 1, 1));

  const days = [];
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
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="오늘 예약" value={todayRes.length} color="text-sky-600" />
          <StatCard label="승인 대기" value={pendingCount} color="text-amber-600" highlight={pendingCount > 0} />
          <StatCard label="전체 예약" value={reservations.length} color="text-slate-600" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            id="tab-today"
            onClick={() => setTab('today')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${tab === 'today' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            오늘 예약 {todayRes.length > 0 && `(${todayRes.length})`}
          </button>
          <button
            id="tab-all"
            onClick={() => setTab('all')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${tab === 'all' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            날짜별 조회
          </button>
          <button
            id="tab-calendar"
            onClick={() => setTab('calendar')}
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
                const isToday = dateStr === toDateStr(new Date());

                return (
                  <div
                    key={day}
                    onClick={() => { setSelectedDate(dateStr); setTab('all'); }}
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
        {tab === 'all' && (
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
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((res) => {
                const statusInfo = STATUS_MAP[res.status];
                return (
                  <div key={res.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-slate-800 text-lg">
                          {formatTime(res.start_time)}
                          <span className="text-sm text-slate-400 font-normal ml-2">{res.duration}분</span>
                        </p>
                        {tab === 'all' && (
                          <p className="text-slate-500 text-sm">{formatDate(res.date)}</p>
                        )}
                      </div>
                      <span className={`status-badge ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-slate-600 mb-3">
                      <p>👤 <strong>{res.patient_name}</strong></p>
                      <p>📱 {res.patient_phone}</p>
                    </div>

                    {/* Action buttons */}
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

function StatCard({ label, value, color, highlight }: {
  label: string; value: number; color: string; highlight?: boolean;
}) {
  return (
    <div className={`card text-center py-4 ${highlight ? 'border-2 border-amber-300 bg-amber-50' : ''}`}>
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

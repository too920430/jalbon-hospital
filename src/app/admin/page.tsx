'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Reservation, Therapist } from '@/lib/types';
import { getAllReservations, getTherapists } from '@/lib/api';
import { formatDate, formatTime, toDateStr } from '@/lib/slots';

const STATUS_MAP = {
  pending:  { label: '승인 대기', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '확정',      color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '거절',      color: 'bg-red-100 text-red-600'      },
  done:     { label: '완료',      color: 'bg-slate-100 text-slate-600'  },
};

export default function AdminPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Existing state
  const [filterTherapist, setFilterTherapist] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [maxBeds, setMaxBeds] = useState(5);

  // New state
  const [adminTab, setAdminTab] = useState<'overview' | 'monthly'>('overview');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null);

  useEffect(() => {
    const role = sessionStorage.getItem('jalbon_role');
    if (role !== 'admin') {
      router.push('/therapist/login');
      return;
    }
    setMaxBeds(parseInt(localStorage.getItem('jalbon_max_beds') || '5'));
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [res, ths] = await Promise.all([getAllReservations(), getTherapists()]);
    setReservations(res);
    setTherapists(ths);
    setLoading(false);
  };

  const saveMaxBeds = (v: number) => {
    setMaxBeds(v);
    localStorage.setItem('jalbon_max_beds', String(v));
  };

  const logout = () => {
    sessionStorage.clear();
    router.push('/therapist/login');
  };

  const filtered = reservations.filter((r) => {
    if (filterTherapist && r.therapist_id !== filterTherapist) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const today = toDateStr(new Date());
  const todayAll = reservations.filter((r) => r.date === today);
  const todayPending = todayAll.filter((r) => r.status === 'pending').length;

  const currentMonthString = today.slice(0, 7);
  const thisMonthReservations = reservations.filter((r) => r.date.startsWith(currentMonthString));

  // overview: this month vs total
  const therapistStats = therapists.map((t) => ({
    therapist: t,
    thisMonth: thisMonthReservations.filter((r) => r.therapist_id === t.id).length,
    total: reservations.filter((r) => r.therapist_id === t.id).length,
  }));

  // Monthly tab logic
  const calYear = currentMonth.getFullYear();
  const calMonth = currentMonth.getMonth();
  const selectedMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const monthlyReservations = reservations.filter(r => r.date.startsWith(selectedMonthStr));

  const monthlyTherapistStats = therapists.map((t) => ({
    therapist: t,
    count: monthlyReservations.filter((r) => r.therapist_id === t.id).length,
  }));

  const prevMonth = () => setCurrentMonth(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(calYear, calMonth + 1, 1));

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  return (
    <div className="min-h-screen bg-[#F0F9FF]">
      <header className="page-header">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700
                            flex items-center justify-center text-white text-lg">
              ⚙️
            </div>
            <div>
              <h1 className="font-bold text-slate-800">관리자 대시보드</h1>
              <p className="text-xs text-slate-400">마산 잘본병원 도수치료실</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="text-xs text-sky-500 font-semibold px-3 py-1.5 rounded-xl border border-sky-200 hover:bg-sky-50 transition-colors">
              환자화면
            </Link>
            <button id="admin-logout" onClick={logout}
                    className="text-xs text-slate-500 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        
        {/* Tab Controls */}
        <div className="flex gap-2">
          <button
            onClick={() => setAdminTab('overview')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${adminTab === 'overview' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            대시보드 요약
          </button>
          <button
            onClick={() => setAdminTab('monthly')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${adminTab === 'monthly' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            월간 치료사 통계
          </button>
        </div>

        {adminTab === 'overview' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Overview stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="오늘 전체" value={todayAll.length} color="text-sky-600" />
              <StatCard label="승인 대기" value={todayPending} color="text-amber-600" highlight={todayPending > 0} />
              <StatCard label="전체 예약" value={reservations.length} color="text-slate-700" />
              <StatCard label="치료실 침대" value={maxBeds} color="text-emerald-600" />
            </div>

            {/* Therapist stats (This Month) */}
            <div className="card">
              <h2 className="font-bold text-slate-700 mb-3">치료사별 현황 (이번 달)</h2>
              <div className="grid grid-cols-2 gap-3">
                {therapistStats.map(({ therapist: t, thisMonth, total }) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                         style={{ backgroundColor: t.color }}>
                      {t.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">{t.name}</p>
                      <p className="text-xs text-slate-500">이번 달 <strong className="text-sky-600">{thisMonth}</strong>건 · 전체 {total}건</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settings */}
            <div className="card">
              <h2 className="font-bold text-slate-700 mb-3">⚙️ 설정</h2>
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-slate-600 flex-shrink-0">도수치료실 침대 수</label>
                <input
                  id="max-beds-input"
                  type="number"
                  min={1} max={20}
                  value={maxBeds}
                  onChange={(e) => saveMaxBeds(parseInt(e.target.value) || 5)}
                  className="input-field w-24 text-center text-lg font-bold"
                />
                <span className="text-slate-500 text-sm">개</span>
              </div>
            </div>

            {/* All reservations */}
            <div className="card">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="font-bold text-slate-700 flex-1">전체 예약 목록</h2>
                <select id="filter-therapist" className="input-field w-auto text-sm py-2"
                        value={filterTherapist} onChange={(e) => setFilterTherapist(e.target.value)}>
                  <option value="">전체 치료사</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select id="filter-status" className="input-field w-auto text-sm py-2"
                        value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">전체 상태</option>
                  <option value="pending">승인 대기</option>
                  <option value="approved">확정</option>
                  <option value="rejected">거절</option>
                  <option value="done">완료</option>
                </select>
              </div>

              {loading ? (
                <div className="text-center py-8 text-slate-400 animate-pulse-soft">불러오는 중...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-slate-400 text-sm">예약이 없습니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-6 py-2">날짜 · 시간</th>
                        <th className="px-4 py-2">환자</th>
                        <th className="px-4 py-2">치료사</th>
                        <th className="px-4 py-2">시간</th>
                        <th className="px-4 py-2">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered
                        .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
                        .map((res) => {
                          const statusInfo = STATUS_MAP[res.status];
                          const th = therapists.find((t) => t.id === res.therapist_id);
                          return (
                            <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-3">
                                <p className="font-semibold text-slate-700">{formatDate(res.date)}</p>
                                <p className="text-slate-400 text-xs">{formatTime(res.start_time)}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-700">{res.patient_name}</p>
                                <p className="text-slate-400 text-xs">{res.patient_phone}</p>
                              </td>
                              <td className="px-4 py-3">
                                {th ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: th.color }} />
                                    {th.name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">미정</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{res.duration}분</td>
                              <td className="px-4 py-3">
                                <span className={`status-badge ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {adminTab === 'monthly' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Month selector */}
            <div className="card flex items-center justify-between px-6">
              <button onClick={prevMonth} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors">◀</button>
              <h2 className="font-extrabold text-2xl text-slate-700">{calYear}년 {calMonth + 1}월</h2>
              <button onClick={nextMonth} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors">▶</button>
            </div>

            {/* Therapist month summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {monthlyTherapistStats.map(({ therapist: t, count }) => {
                const isSelected = selectedTherapistId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTherapistId(isSelected ? null : t.id)}
                    className={`card text-center py-4 cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-sky-400 shadow-md bg-sky-50' : 'hover:border-sky-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-white font-bold mb-2 shadow-sm"
                         style={{ backgroundColor: t.color }}>
                      {t.name[0]}
                    </div>
                    <p className="font-semibold text-slate-700 text-sm">{t.name}</p>
                    <p className="text-sky-600 font-bold mt-1 text-lg">{count}<span className="text-xs text-slate-400 font-normal ml-0.5">건</span></p>
                  </div>
                );
              })}
            </div>

            {/* Calendar */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-700">
                  일별 예약 현황
                  {selectedTherapistId && (
                    <span className="ml-2 text-sm font-medium text-sky-600">
                      ({therapists.find(t => t.id === selectedTherapistId)?.name} 치료사 기준)
                    </span>
                  )}
                  {!selectedTherapistId && (
                    <span className="ml-2 text-sm font-medium text-slate-400">
                      (전체 합산)
                    </span>
                  )}
                </h3>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2 text-xs font-semibold text-slate-400">
                <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-sky-400">토</div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className="h-20 rounded-xl bg-slate-50/50" />;
                  
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  let dayRes = monthlyReservations.filter(r => r.date === dateStr);
                  
                  if (selectedTherapistId) {
                    dayRes = dayRes.filter(r => r.therapist_id === selectedTherapistId);
                  }

                  const count = dayRes.length;
                  const isToday = dateStr === today;

                  return (
                    <div
                      key={day}
                      className={`h-20 rounded-xl border flex flex-col p-1.5 transition-all ${
                        isToday ? 'border-sky-400 bg-sky-50' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className={`text-xs font-semibold ${isToday ? 'text-sky-600' : 'text-slate-500'}`}>{day}</span>
                      {count > 0 && (
                        <div className="mt-auto self-center bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">
                          {count}건
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 text-center mt-4">
                치료사 카드를 클릭하면 해당 치료사의 일자별 건수만 확인할 수 있습니다.
              </p>
            </div>
          </div>
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
      <div className={`text-3xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

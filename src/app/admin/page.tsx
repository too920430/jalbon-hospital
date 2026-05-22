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
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [filterTherapist, setFilterTherapist] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [maxBeds, setMaxBeds] = useState(5);

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

  // stats by therapist
  const therapistStats = therapists.map((t) => ({
    therapist: t,
    today: reservations.filter((r) => r.date === today && r.therapist_id === t.id).length,
    total: reservations.filter((r) => r.therapist_id === t.id).length,
  }));

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
        {/* Overview stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="오늘 전체" value={todayAll.length} color="text-sky-600" />
          <StatCard label="승인 대기" value={todayPending} color="text-amber-600" highlight={todayPending > 0} />
          <StatCard label="전체 예약" value={reservations.length} color="text-slate-700" />
          <StatCard label="치료실 침대" value={maxBeds} color="text-emerald-600" />
        </div>

        {/* Therapist stats */}
        <div className="card">
          <h2 className="font-bold text-slate-700 mb-3">치료사별 현황 (오늘)</h2>
          <div className="grid grid-cols-2 gap-3">
            {therapistStats.map(({ therapist: t, today: tod, total }) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                     style={{ backgroundColor: t.color }}>
                  {t.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{t.name}</p>
                  <p className="text-xs text-slate-500">오늘 <strong className="text-sky-600">{tod}</strong>건 · 전체 {total}건</p>
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

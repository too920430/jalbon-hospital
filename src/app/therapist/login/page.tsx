'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTherapists, insertAuditLog } from '@/lib/api';
import { Therapist } from '@/lib/types';
import { formatTherapistName } from '@/lib/slots';

export default function TherapistLoginPage() {
  const router = useRouter();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTherapists, setLoadingTherapists] = useState(true);

  useEffect(() => {
    getTherapists().then((data) => {
      setTherapists(data);
      setLoadingTherapists(false);
    });
  }, []);

  const handleLogin = async () => {
    if (!selectedId || !pin) return;
    setLoading(true);
    setError('');

    // 관리자 로그인 처리
    if (selectedId === 'admin') {
      if (pin !== 'wkfqhs2022!@#') {
        setError('비밀번호가 올바르지 않습니다.');
        setLoading(false);
        return;
      }
      sessionStorage.setItem('jalbon_role', 'admin');
      sessionStorage.setItem('jalbon_therapist', JSON.stringify({ id: 'admin', name: '관리자', color: '#64748b' }));
      insertAuditLog('THERAPIST_LOGIN', '관리자', {});
      router.push('/admin');
      return;
    }

    // 일반 치료사 로그인 처리
    const therapist = therapists.find((t) => t.id === selectedId);
    if (!therapist) { setError('치료사를 선택하세요.'); setLoading(false); return; }

    if (pin !== 'wkfqhs' && pin !== therapist.pin) {
      setError('비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    sessionStorage.setItem('jalbon_role', 'therapist');
    sessionStorage.setItem('jalbon_therapist', JSON.stringify(therapist));
    localStorage.setItem('jalbon_is_therapist_device', 'true');
    insertAuditLog('THERAPIST_LOGIN', therapist.name, {});
    router.push('/therapist/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6 animate-fade-in-up">
        <div className="text-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-sky-400 to-sky-600
                          flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-sky-200">
            🏥
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">직원 로그인</h1>
          <p className="text-slate-500 text-sm mt-1">창원 본앤밸런스 도수치료실</p>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-600 mb-1.5 block">치료사 선택</label>
            <select
              id="therapist-select"
              className="input-field"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loadingTherapists}
            >
              <option value="">
                {loadingTherapists ? '⏳ 치료사 목록 불러오는 중...' : '치료사를 선택하세요'}
              </option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{formatTherapistName(t.name)}</option>
              ))}
              <option value="admin">관리자</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 mb-1.5 block">비밀번호</label>
            <input
              id="pin-input"
              className="input-field tracking-widest text-center text-xl"
              type="password"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-600 text-sm text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            id="login-btn"
            onClick={handleLogin}
            disabled={loading || !selectedId || !pin}
            className="btn-primary"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">
          관리자 로그인 시 메뉴에서 '관리자'를 선택하세요.
        </p>

        <div className="text-center">
          <a href="/" className="text-slate-400 text-sm hover:text-sky-500 transition-colors">
            ← 환자 예약 화면으로
          </a>
        </div>
      </div>
    </div>
  );
}

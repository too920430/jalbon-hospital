'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTherapists } from '@/lib/api';
import { Therapist } from '@/lib/types';
import { formatTherapistName } from '@/lib/slots';

export default function TherapistLoginPage() {
  const router = useRouter();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getTherapists().then(setTherapists);
  }, []);

  const handleLogin = async () => {
    if (!selectedId || !pin) return;
    setLoading(true);
    setError('');

    const therapist = therapists.find((t) => t.id === selectedId);
    if (!therapist) { setError('치료사를 선택하세요.'); setLoading(false); return; }

    // Admin check
    if (pin === '0000') {
      sessionStorage.setItem('jalbon_role', 'admin');
      sessionStorage.setItem('jalbon_therapist', JSON.stringify(therapist));
      router.push('/admin');
      return;
    }

    if (therapist.pin !== pin) {
      setError('PIN 번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    sessionStorage.setItem('jalbon_role', 'therapist');
    sessionStorage.setItem('jalbon_therapist', JSON.stringify(therapist));
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
          <p className="text-slate-500 text-sm mt-1">마산 잘본병원 도수치료실</p>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-600 mb-1.5 block">치료사 선택</label>
            <select
              id="therapist-select"
              className="input-field"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">치료사를 선택하세요</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{formatTherapistName(t.name)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 mb-1.5 block">PIN 번호</label>
            <input
              id="pin-input"
              className="input-field tracking-widest text-center text-xl"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
            disabled={loading || !selectedId || pin.length < 4}
            className="btn-primary"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">
          관리자: PIN <strong>0000</strong> 입력
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Reservation } from '@/lib/types';
import { getPatientReservations } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/slots';

const STATUS_MAP = {
  pending:  { label: '승인 대기', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '예약 확정', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '거절됨',   color: 'bg-red-100 text-red-600'      },
  done:     { label: '치료 완료', color: 'bg-slate-100 text-slate-600'  },
};

export default function MyBookingPage() {
  const [name, setName]           = useState('');
  const [phone, setPhone]         = useState('');
  const [searched, setSearched]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const handlePhoneInput = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length >= 4 && digits.length <= 7) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    } else if (digits.length >= 8) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    setPhone(formatted);
  };

  const handleSearch = async () => {
    if (!name.trim() || phone.replace(/\D/g, '').length < 10) return;
    setLoading(true);
    const data = await getPatientReservations(name.trim(), phone);
    setReservations(data);
    setSearched(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F0F9FF]">
      {/* Header */}
      <header className="page-header">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" id="back-to-home" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-600">
            ←
          </Link>
          <div>
            <h1 className="font-bold text-slate-800 text-base">내 예약 확인</h1>
            <p className="text-xs text-slate-400">마산 잘본병원</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Search card */}
        <div className="card animate-fade-in-up space-y-4">
          <h2 className="font-bold text-slate-700">예약 조회</h2>
          <div>
            <label className="text-sm font-semibold text-slate-600 mb-1.5 block" htmlFor="search-name">이름</label>
            <input
              id="search-name"
              className="input-field"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-600 mb-1.5 block" htmlFor="search-phone">휴대폰 번호</label>
            <input
              id="search-phone"
              className="input-field"
              placeholder="010-0000-0000"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => handlePhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            id="search-btn"
            onClick={handleSearch}
            disabled={loading || !name.trim() || phone.replace(/\D/g, '').length < 10}
            className="btn-primary"
          >
            {loading ? '조회 중...' : '예약 조회하기'}
          </button>
        </div>

        {/* Results */}
        {searched && !loading && (
          <div className="animate-fade-in-up space-y-3">
            {reservations.length === 0 ? (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">📭</div>
                <p className="font-semibold text-slate-700 mb-1">예약 내역이 없습니다</p>
                <p className="text-slate-400 text-sm">이름과 휴대폰 번호를 다시 확인해 주세요</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 font-medium">
                  총 {reservations.length}건의 예약이 있습니다
                </p>
                {reservations.map((res) => {
                  const statusInfo = STATUS_MAP[res.status];
                  return (
                    <div key={res.id} className="card animate-fade-in-up">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-slate-800 text-base">
                            {formatDate(res.date)}
                          </p>
                          <p className="text-sky-600 font-semibold">
                            {formatTime(res.start_time)} · {res.duration}분
                          </p>
                        </div>
                        <span className={`status-badge ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-slate-500">
                        <p>
                          👨‍⚕️ {res.therapist?.name
                            ? `${res.therapist.name} 치료사`
                            : '치료사 미정'}
                        </p>
                        {res.note && (
                          <p className="text-slate-600 bg-slate-50 rounded-xl px-3 py-2 mt-2">
                            💬 {res.note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        <div className="text-center pt-2 animate-fade-in-up">
          <Link href="/booking" id="new-booking-link" className="text-sky-500 text-sm font-semibold hover:underline">
            + 새 예약하기
          </Link>
        </div>
      </div>
    </div>
  );
}

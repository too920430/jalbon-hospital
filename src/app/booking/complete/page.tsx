import Link from 'next/link';

export default function BookingCompletePage() {
  return (
    <div className="min-h-screen bg-[#F0F9FF] flex flex-col items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6 animate-fade-in-up">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center text-5xl mx-auto
                        shadow-lg shadow-emerald-100">
          ✅
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 mb-2">예약 신청 완료!</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            예약 신청이 접수되었습니다.<br />
            치료사 승인 후 최종 확정됩니다.
          </p>
        </div>
        <div className="card text-left">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div className="text-sm text-slate-600 leading-relaxed">
              <strong className="text-slate-800">예약 확인 방법</strong><br />
              &apos;내 예약 확인&apos;에서 이름과 휴대폰 번호로 예약 현황을 확인할 수 있습니다.
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <Link href="/my-booking" id="check-my-booking-btn" className="block">
            <button className="btn-primary">내 예약 확인하기</button>
          </Link>
          <Link href="/" id="back-home-btn" className="block">
            <button className="btn-secondary">홈으로 돌아가기</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

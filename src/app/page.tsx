import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-cyan-600 text-white">
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-white/10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-white/5" />
        </div>

        <div className="relative z-10 px-6 pt-16 pb-24 max-w-lg mx-auto text-center">
          {/* Hospital badge */}
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm
                          px-4 py-1.5 rounded-full text-sm font-medium mb-6 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            재활의학과 도수치료
          </div>

          {/* Hospital name */}
          <h1 className="text-4xl font-extrabold mb-2 animate-fade-in-up"
              style={{ animationDelay: '0.05s' }}>
            잘본병원
          </h1>
          <p className="text-sky-100 text-lg mb-1 animate-fade-in-up"
             style={{ animationDelay: '0.1s' }}>
            마산 양덕동
          </p>
          <p className="text-sky-200 text-sm animate-fade-in-up"
             style={{ animationDelay: '0.15s' }}>
            도수치료실 온라인 예약 시스템
          </p>
        </div>
      </div>

      {/* Cards Section */}
      <div className="flex-1 -mt-12 px-4 pb-8 max-w-lg mx-auto w-full">
        {/* Main booking card */}
        <div className="card shadow-xl shadow-sky-100 mb-4 animate-fade-in-up"
             style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-2xl">
              📅
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">도수치료 예약</h2>
              <p className="text-slate-500 text-sm">원하시는 날짜와 시간을 선택하세요</p>
            </div>
          </div>
          <Link href="/booking" id="booking-btn">
            <button className="btn-primary">
              지금 예약하기 →
            </button>
          </Link>
        </div>

        {/* Check booking card */}
        <div className="card mb-4 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-2xl">
              🔍
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">내 예약 확인</h2>
              <p className="text-slate-500 text-sm">예약 현황과 승인 여부를 확인하세요</p>
            </div>
          </div>
          <Link href="/my-booking" id="my-booking-btn">
            <button className="btn-secondary">
              예약 확인하기
            </button>
          </Link>
        </div>

        {/* Operating hours card */}
        <div className="card animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span>🕐</span> 운영 시간
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-slate-50">
              <span className="text-slate-600">평일 (월 ~ 금)</span>
              <span className="font-semibold text-slate-800">09:00 ~ 18:00</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-50">
              <span className="text-slate-500 text-xs ml-2">점심 시간</span>
              <span className="text-slate-400 text-xs">12:30 ~ 13:30</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-50">
              <span className="text-slate-600">토요일</span>
              <span className="font-semibold text-slate-800">09:00 ~ 13:00</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-600">일요일</span>
              <span className="text-red-400 font-semibold">휴무</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

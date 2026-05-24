import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '창원 본앤밸런스 도수치료 예약',
  description: '창원 본앤밸런스 도수치료실 온라인 예약 시스템입니다. 편리하게 예약하세요.',
  keywords: '도수치료, 창원, 본앤밸런스, 재활의학과, 예약',
  openGraph: {
    title: '창원 본앤밸런스 도수치료 예약',
    description: '도수치료실 온라인 예약',
    locale: 'ko_KR',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-[#F0F9FF] min-h-screen">
        {children}
      </body>
    </html>
  );
}

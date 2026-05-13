import type { Metadata } from 'next';
import './globals.css';
import { TopBar } from '@/components/top-bar';

export const metadata: Metadata = {
  title: 'Trend Finder',
  description: 'TikTok / Instagram / YouTube 에셋 채널 트렌드 영상 파인더',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark">
      <head>
        {/* 댓글 생성기에서 폰트 선택용 — preconnect + 가벼운 weight subset */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&family=Roboto:wght@400;500;700&family=Gowun+Dodum&family=Nanum+Pen+Script&family=Oswald:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <TopBar />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TopBar, THEME_KEY } from '@/components/top-bar';

export const metadata: Metadata = {
  title: '새로이 대시보드',
  description: 'TikTok / Instagram / YouTube 에셋 채널 트렌드 영상 파인더',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: '새로이 대시보드',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark">
      <head>
        {/*
          저장해 둔 테마를 페인트 전에 적용한다. body 렌더 뒤에 붙이면
          다크로 한 번 그려진 뒤 라이트로 바뀌어 깜빡인다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('${THEME_KEY}')==='light')document.documentElement.classList.add('light')}catch(e){}`,
          }}
        />
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
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}`,
          }}
        />
      </body>
    </html>
  );
}

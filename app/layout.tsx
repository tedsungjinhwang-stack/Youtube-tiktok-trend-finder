import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TopBar, THEME_KEY } from '@/components/top-bar';
import { PlanSidebar } from '@/components/plan-sidebar';

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
        {/* 본문 폰트 — globals.css 의 @import 에서 옮겨왔다 (직렬 → 병렬) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">
        <TopBar />
        {/*
          계획 사이드바는 모든 탭 공통. 넓은 화면에서만 열리고, 좁으면 본문이
          지금까지처럼 전체 폭을 그대로 쓴다.
        */}
        <div className="xl:mx-auto xl:grid xl:max-w-[1544px] xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start xl:gap-6 xl:px-5 xl:pt-5">
          <PlanSidebar />
          <main className="min-h-[calc(100vh-3.5rem)] min-w-0">{children}</main>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}`,
          }}
        />
      </body>
    </html>
  );
}

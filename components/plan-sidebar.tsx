'use client';

import { usePathname } from 'next/navigation';
import { PlansCard } from './plan-pane';

/**
 * 계획 사이드바를 띄우는 탭 — 전체 현황 · 유튜브 · 인스타 · 네이버클립.
 * 나머지(스레드·트렌드·꿀통레이더·설정·공유 링크 등)는 본문이 전체 폭을 쓴다.
 * /shopping-dashboard 는 인스타의 예전 주소.
 */
const SHOW_ON = ['/', '/channel-dashboard', '/instagram-dashboard', '/shopping-dashboard', '/naverclip-dashboard'];

export function showsPlanSidebar(pathname: string): boolean {
  return SHOW_ON.includes(pathname);
}

/**
 * 앱 본문 틀. 계획 사이드바를 띄우는 탭에서만 넓은 화면에 [사이드바 | 본문] 두 칸으로 나눈다.
 * 사이드바가 없는 탭에서 두 칸 틀을 그대로 쓰면 본문이 300px 칸으로 밀려 들어가서 틀 자체를 바꾼다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const withSidebar = showsPlanSidebar(pathname);
  return (
    <div
      className={
        'xl:mx-auto xl:max-w-[1544px] xl:px-5 xl:pt-5 ' +
        (withSidebar ? 'xl:grid xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start xl:gap-6' : '')
      }
    >
      {withSidebar && (
        // 넓은 화면에서만 연다. 좁으면 300px 를 끼울 수 없어서 렌더하지 않는다
        // (전체 현황에서는 좁을 때 본문 안에 가로로 나온다).
        <aside className="hidden xl:sticky xl:top-[76px] xl:block xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto">
          <PlansCard vertical />
        </aside>
      )}
      <main className="min-h-[calc(100vh-3.5rem)] min-w-0">{children}</main>
    </div>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { PlansCard } from './plan-pane';

/**
 * 앱 껍데기가 아닌 화면 — 로그인과 외부 공유 링크.
 * 여기서는 계획을 띄우지 않는다. 남에게 보내는 화면이고, 로그인 전에는
 * 어차피 API 도 못 부른다.
 */
const HIDDEN = ['/login', '/share', '/channels/share', '/my-schedule/share', '/v/'];

/**
 * 모든 탭 좌측에 붙는 계획 사이드바.
 *
 * 넓은 화면에서만 열린다. 좁으면 아예 렌더하지 않는데, 300px 를 억지로 끼우면
 * 본문이 못 쓸 만큼 좁아지기 때문이다 (전체 현황에서는 좁을 때 본문 안에 가로로 나온다).
 */
export function PlanSidebar() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(p))) return null;

  return (
    <aside className="hidden xl:sticky xl:top-[76px] xl:block xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto">
      <PlansCard vertical />
    </aside>
  );
}

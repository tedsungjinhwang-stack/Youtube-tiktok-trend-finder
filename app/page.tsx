import { OverviewClient } from './overview/overview-client';

export const dynamic = 'force-dynamic';

/** 홈 = 전체 현황 (오늘 발행할 것 · 업로드 필요 · 예약 현황 · 최근 발행된 글) */
export default function RootPage() {
  return <OverviewClient />;
}

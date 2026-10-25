import { RadarClient } from './radar-client';
import { RADAR_MOCK } from './mock';

export const dynamic = 'force-dynamic';

/** 꿀통레이더 — 지금은 시안(예시 데이터). 감시 채널 수집이 붙으면 실제 데이터로 바꾼다 */
export default function Page() {
  return <RadarClient data={RADAR_MOCK} />;
}

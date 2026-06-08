import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 비활성화 — 수기 관리 모드.
 * YT 자동 동기화가 사용자가 직접 수정한 예약 영상을 덮어쓰는 문제 때문에 차단.
 * 채널 추가/예약은 /my-schedule UI 에서 수기 입력.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    data: {
      ytChannels: 0,
      ytSynced: 0,
      totalVideos: 0,
      calChannels: 0,
      calSynced: 0,
      synced: 0,
      total: 0,
      disabled: true,
    },
  });
}

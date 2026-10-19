import { NextResponse } from 'next/server';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 키워드 직접 조회 — ?kw=닥터X,김지원 (쉼표·줄바꿈 구분, 최대 30개) */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('kw') ?? '';
  const kws = [...new Set(raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  if (kws.length === 0) return NextResponse.json({ success: true, data: { naverEnabled: true, items: [] } });
  try {
    const { map, enabled } = await getVolumes(kws);
    return NextResponse.json({
      success: true,
      data: { naverEnabled: enabled, items: kws.map((k) => ({ keyword: k, naver: map[volumeKey(k)] ?? null })) },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'NAVER_FAILED', message: (e as Error).message } }, { status: 502 });
  }
}

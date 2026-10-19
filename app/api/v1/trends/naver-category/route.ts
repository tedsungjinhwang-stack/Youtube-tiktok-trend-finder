import { NextResponse } from 'next/server';
import { shoppingCategory } from '@/lib/trends/naver-shopping';

export const dynamic = 'force-dynamic';

/** 쇼핑 분야의 상위 경로와 하위 분야. ?cid=50000000 */
export async function GET(req: Request) {
  const cid = new URL(req.url).searchParams.get('cid') ?? '';
  if (!/^\d{8}$/.test(cid)) return NextResponse.json({ success: false, error: { code: 'BAD_CID', message: '분야 번호 오류' } }, { status: 400 });
  try {
    return NextResponse.json({ success: true, data: await shoppingCategory(cid) });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'NAVER_FAILED', message: (e as Error).message } }, { status: 502 });
  }
}

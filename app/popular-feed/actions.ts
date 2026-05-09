'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  addHashtag,
  removeHashtag,
  toggleHashtag,
} from '@/lib/hashtags';
import { discoverByHashtag, type DiscoverPeriod } from '@/lib/scraper/hashtag-discover';

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | { ok: false; error: string };

export async function addHashtagAction(
  formData: FormData
): Promise<ActionResult> {
  const platform = formData.get('platform') as 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | null;
  const tag = String(formData.get('tag') ?? '').trim();
  if (!platform || !['YOUTUBE', 'TIKTOK', 'INSTAGRAM'].includes(platform)) {
    return { ok: false, error: '플랫폼이 올바르지 않습니다.' };
  }
  if (!tag) return { ok: false, error: '해시태그 입력 필요' };

  try {
    await addHashtag({ platform, tag });
    revalidatePath('/popular-feed');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '추가 실패' };
  }
}

export async function removeHashtagAction(id: string): Promise<ActionResult> {
  try {
    // 해시태그를 지우면 그 태그로 발견된 영상도 함께 삭제 — 카운트와 결과가 일관됨.
    // 채널 자체는 유지(다른 데서 참조될 수 있음).
    const h = await prisma.hashtag
      .findUnique({ where: { id }, select: { platform: true, tag: true } })
      .catch(() => null);
    if (h) {
      await prisma.video
        .deleteMany({ where: { platform: h.platform, sourceHashtag: h.tag } })
        .catch(() => null);
    }
    await removeHashtag(id);
    revalidatePath('/popular-feed');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '삭제 실패' };
  }
}

export async function toggleHashtagAction(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    await toggleHashtag(id, isActive);
    revalidatePath('/popular-feed');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '토글 실패' };
  }
}

export async function searchHashtagAction(
  hashtag: string,
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM',
  period: DiscoverPeriod = 'all'
): Promise<ActionResult<{ saved: number; fetched: number; skipped: number }>> {
  try {
    const r = await discoverByHashtag(hashtag, platform, 100, period);
    revalidatePath('/popular-feed');
    return {
      ok: true,
      data: { saved: r.saved, fetched: r.fetched, skipped: r.skipped },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '검색 실패' };
  }
}

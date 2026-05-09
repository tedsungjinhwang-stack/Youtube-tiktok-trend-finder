'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

type ActionResult = { ok: true; count?: number } | { ok: false; error: string };
type StarResult = { ok: true; starred: boolean } | { ok: false; error: string };

export async function toggleStarVideoAction(id: string): Promise<StarResult> {
  try {
    const v = await prisma.video.findUnique({
      where: { id },
      select: { isStarred: true },
    });
    if (!v) return { ok: false, error: '영상 없음' };
    const next = !v.isStarred;
    await prisma.video.update({ where: { id }, data: { isStarred: next } });
    revalidatePath('/');
    revalidatePath('/youtube');
    revalidatePath('/social');
    revalidatePath('/popular-feed');
    return { ok: true, starred: next };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '실패' };
  }
}

export async function deleteVideoAction(id: string): Promise<ActionResult> {
  try {
    await prisma.video.delete({ where: { id } });
    revalidatePath('/');
    revalidatePath('/youtube');
    revalidatePath('/social');
    revalidatePath('/popular-feed');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '삭제 실패' };
  }
}

export async function deleteVideosAction(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return { ok: true, count: 0 };
  try {
    const result = await prisma.video.deleteMany({ where: { id: { in: ids } } });
    revalidatePath('/');
    revalidatePath('/youtube');
    revalidatePath('/social');
    revalidatePath('/popular-feed');
    return { ok: true, count: result.count };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '일괄 삭제 실패' };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

type ActionResult = { ok: true; count?: number } | { ok: false; error: string };

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

'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function deleteVideoAction(id: string): Promise<ActionResult> {
  try {
    await prisma.video.delete({ where: { id } });
    // 영상이 노출되는 모든 페이지 갱신
    revalidatePath('/');
    revalidatePath('/youtube');
    revalidatePath('/social');
    revalidatePath('/popular-feed');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '삭제 실패' };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { parseChannelInput } from '@/lib/url-parser';
import { scrapeChannel } from '@/lib/scraper';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addChannelAction(formData: FormData): Promise<ActionResult> {
  const input = String(formData.get('input') ?? '').trim();
  const folderId = String(formData.get('folderId') ?? '').trim();
  const platformHint = (formData.get('platform') as string) || undefined;

  if (!input) return { ok: false, error: '핸들 또는 URL을 입력하세요.' };
  if (!folderId) return { ok: false, error: '폴더를 선택하세요.' };

  const r = parseChannelInput(
    input,
    platformHint as 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN' | undefined
  );
  if ('error' in r) return { ok: false, error: r.error };

  try {
    await prisma.channel.create({
      data: {
        platform: r.platform,
        externalId: r.externalId,
        handle: r.handle,
        folderId,
      },
    });
    revalidatePath('/channels');
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'P2002') return { ok: false, error: '이미 등록된 채널입니다.' };
    if (e?.code === 'P2003') return { ok: false, error: '폴더를 찾을 수 없습니다.' };
    return { ok: false, error: 'DB 오류: ' + (e?.message ?? 'unknown') };
  }
}

export async function deleteChannelAction(id: string): Promise<ActionResult> {
  try {
    await prisma.channel.delete({ where: { id } });
    revalidatePath('/channels');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '삭제 실패' };
  }
}

export async function scrapeChannelAction(id: string): Promise<ActionResult> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) return { ok: false, error: '채널 없음' };
    await scrapeChannel(channel);
    revalidatePath('/channels');
    revalidatePath('/');
    revalidatePath('/youtube');
    revalidatePath('/social');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '스크래핑 실패' };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { parseChannelInput } from '@/lib/url-parser';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addChannelAction(formData: FormData): Promise<ActionResult> {
  const input = String(formData.get('input') ?? '').trim();
  const folderId = String(formData.get('folderId') ?? '').trim();
  const platformHint = (formData.get('platform') as string) || undefined;
  const kindInput = (formData.get('kind') as string) || 'REFERENCE';
  const kind = kindInput === 'SOURCE' ? 'SOURCE' : 'REFERENCE';

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
        kind,
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

export async function updateChannelKindAction(
  id: string,
  kind: 'REFERENCE' | 'SOURCE'
): Promise<ActionResult> {
  try {
    await prisma.channel.update({
      where: { id },
      data: { kind: kind === 'SOURCE' ? 'SOURCE' : 'REFERENCE' },
    });
    revalidatePath('/channels');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '변경 실패' };
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

/* ─────────────── 목록 불러오기 (채널이 수만 개라 폴더를 펼칠 때 그 폴더만) ─────────────── */

export type ChannelListRow = {
  id: string;
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';
  externalId: string;
  handle: string | null;
  displayName: string | null;
  folder: string;
  folderId: string;
  subscriberCount: number | null;
  kind: 'REFERENCE' | 'SOURCE';
};

const LIST_SELECT = {
  id: true,
  platform: true,
  externalId: true,
  handle: true,
  displayName: true,
  folderId: true,
  subscriberCount: true,
  kind: true,
  folder: { select: { name: true } },
} as const;

type RawRow = {
  id: string;
  platform: string;
  externalId: string;
  handle: string | null;
  displayName: string | null;
  folderId: string;
  subscriberCount: number | null;
  kind: string;
  folder: { name: string };
};

function toRow(r: RawRow): ChannelListRow {
  return {
    id: r.id,
    platform: r.platform as ChannelListRow['platform'],
    externalId: r.externalId,
    handle: r.handle,
    displayName: r.displayName,
    folder: r.folder.name,
    folderId: r.folderId,
    subscriberCount: r.subscriberCount,
    kind: r.kind === 'SOURCE' ? 'SOURCE' : 'REFERENCE',
  };
}

/** 한 폴더의 채널 (구독자 많은 순, 200개씩). platform 'ALL' 이면 플랫폼 구분 없이 */
export async function listFolderChannelsAction(input: {
  folderId: string;
  platform: string;
  kind: 'ALL' | 'REFERENCE' | 'SOURCE';
  offset?: number;
}): Promise<{ rows: ChannelListRow[]; hasMore: boolean }> {
  const take = 200;
  const rows = await prisma.channel.findMany({
    where: {
      isActive: true,
      folderId: input.folderId,
      ...(input.platform === 'ALL' ? {} : { platform: input.platform as ChannelListRow['platform'] }),
      ...(input.kind === 'ALL' ? {} : { kind: input.kind }),
    },
    select: LIST_SELECT,
    orderBy: [{ subscriberCount: { sort: 'desc', nulls: 'last' } }, { addedAt: 'desc' }],
    skip: input.offset ?? 0,
    take: take + 1,
  });
  return { rows: rows.slice(0, take).map(toRow), hasMore: rows.length > take };
}

/** 이름·핸들 검색 (최대 100개) */
export async function searchChannelsAction(q: string): Promise<ChannelListRow[]> {
  const s = q.trim();
  if (s.length < 1) return [];
  const rows = await prisma.channel.findMany({
    where: {
      isActive: true,
      OR: [
        { displayName: { contains: s, mode: 'insensitive' } },
        { handle: { contains: s, mode: 'insensitive' } },
        { externalId: { contains: s } },
      ],
    },
    select: LIST_SELECT,
    orderBy: { subscriberCount: { sort: 'desc', nulls: 'last' } },
    take: 100,
  });
  return rows.map(toRow);
}

/** CSV 내보내기용 — 조건에 맞는 활성 채널 전부 */
export async function exportChannelsAction(input: { platform: string; kind: 'ALL' | 'REFERENCE' | 'SOURCE' }): Promise<ChannelListRow[]> {
  const rows = await prisma.channel.findMany({
    where: {
      isActive: true,
      ...(input.platform === 'ALL' ? {} : { platform: input.platform as ChannelListRow['platform'] }),
      ...(input.kind === 'ALL' ? {} : { kind: input.kind }),
    },
    select: LIST_SELECT,
    orderBy: [{ folderId: 'asc' }, { subscriberCount: { sort: 'desc', nulls: 'last' } }],
  });
  return rows.map(toRow);
}

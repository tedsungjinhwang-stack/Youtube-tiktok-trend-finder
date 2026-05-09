'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | { ok: false; error: string };

export async function createFolderAction(
  rawName: string
): Promise<ActionResult<{ id: string; name: string }>> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: '이름을 입력하세요' };
  if (name.length > 50) return { ok: false, error: '50자 이하로 입력하세요' };
  if (name.startsWith('__'))
    return { ok: false, error: '__ 로 시작하는 이름은 예약됨' };

  try {
    const last = await prisma.folder.findFirst({
      orderBy: { sortOrder: 'desc' },
    });
    const folder = await prisma.folder.create({
      data: { name, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    revalidatePath('/folders');
    return { ok: true, data: { id: folder.id, name: folder.name } };
  } catch (e: any) {
    if (e?.code === 'P2002')
      return { ok: false, error: '같은 이름의 폴더가 있습니다' };
    return { ok: false, error: e?.message ?? '생성 실패' };
  }
}

export async function renameFolderAction(
  id: string,
  rawName: string
): Promise<ActionResult> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: '이름을 입력하세요' };
  if (name.length > 50) return { ok: false, error: '50자 이하로 입력하세요' };
  if (name.startsWith('__'))
    return { ok: false, error: '__ 로 시작하는 이름은 예약됨' };

  try {
    await prisma.folder.update({ where: { id }, data: { name } });
    revalidatePath('/folders');
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'P2002')
      return { ok: false, error: '같은 이름의 폴더가 있습니다' };
    if (e?.code === 'P2025')
      return { ok: false, error: '폴더를 찾을 수 없습니다' };
    return { ok: false, error: e?.message ?? '변경 실패' };
  }
}

export async function deleteFolderAction(id: string): Promise<ActionResult> {
  try {
    const channelCount = await prisma.channel.count({
      where: { folderId: id },
    });
    if (channelCount > 0) {
      return {
        ok: false,
        error: `채널 ${channelCount}개가 연결되어 있어 삭제할 수 없습니다 — 먼저 채널을 옮기거나 삭제하세요`,
      };
    }
    await prisma.folder.delete({ where: { id } });
    revalidatePath('/folders');
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'P2025')
      return { ok: false, error: '폴더를 찾을 수 없습니다' };
    return { ok: false, error: e?.message ?? '삭제 실패' };
  }
}


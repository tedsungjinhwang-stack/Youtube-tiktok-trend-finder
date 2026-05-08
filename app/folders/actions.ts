'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { FOLDER_SEED } from './seed-list';

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | { ok: false; error: string };

export async function reseedFoldersAction(): Promise<
  ActionResult<{ created: number; updated: number }>
> {
  let created = 0;
  let updated = 0;
  try {
    for (const [i, name] of FOLDER_SEED.entries()) {
      const existing = await prisma.folder.findUnique({ where: { name } });
      if (existing) {
        await prisma.folder.update({
          where: { name },
          data: { sortOrder: i, isSeeded: true },
        });
        updated++;
      } else {
        await prisma.folder.create({
          data: { name, sortOrder: i, isSeeded: true },
        });
        created++;
      }
    }
    revalidatePath('/folders');
    return { ok: true, data: { created, updated } };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '시드 실패' };
  }
}

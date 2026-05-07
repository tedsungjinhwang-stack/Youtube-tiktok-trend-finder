'use server';

import { revalidatePath } from 'next/cache';
import { setAutoScrapeEnabled } from '@/lib/system-settings';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function setAutoScrapeAction(enabled: boolean): Promise<ActionResult> {
  try {
    await setAutoScrapeEnabled(enabled);
    revalidatePath('/settings');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '저장 실패' };
  }
}

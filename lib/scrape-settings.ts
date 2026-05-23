import { prisma } from './db';

export type ScrapeSettingsValue = {
  recencyDays: number;
  minViews: number;
};

const DEFAULTS: ScrapeSettingsValue = { recencyDays: 10, minViews: 50000 };

export async function getScrapeSettings(): Promise<ScrapeSettingsValue> {
  try {
    const row = await prisma.scrapeSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return { recencyDays: row.recencyDays, minViews: row.minViews };
  } catch {
    return DEFAULTS;
  }
}

export async function setScrapeSettings(v: ScrapeSettingsValue): Promise<void> {
  const recencyDays = Math.max(1, Math.min(365, Math.floor(v.recencyDays)));
  const minViews = Math.max(0, Math.floor(v.minViews));
  await prisma.scrapeSettings.upsert({
    where: { id: 'default' },
    update: { recencyDays, minViews },
    create: { id: 'default', recencyDays, minViews },
  });
}

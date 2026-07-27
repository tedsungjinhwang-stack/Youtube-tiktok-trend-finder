import { NextRequest } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MOCK = [
  { platform: 'YOUTUBE',   handle: '@gunbong_tv',  displayName: '건봉이티비',   folder: '영드짜',                 subscribers: 62_000 },
  { platform: 'YOUTUBE',   handle: '@yagjjaeng',   displayName: '야그쟁이',     folder: '영드짜',                 subscribers: 34_000 },
  { platform: 'YOUTUBE',   handle: '@variety_zip', displayName: 'variety_zip',  folder: '예능짜집기',             subscribers: 88_000 },
  { platform: 'YOUTUBE',   handle: '@kookpong',    displayName: '국뽕TV',       folder: '국뽕',                   subscribers: 410_000 },
  { platform: 'TIKTOK',    handle: '@ydb_compile', displayName: 'ydb_compile',  folder: '영드짜',                 subscribers: 12_400 },
  { platform: 'TIKTOK',    handle: '@meme_kr',     displayName: 'meme_kr',      folder: '인스타 틱톡 짜집기',     subscribers: 21_300 },
  { platform: 'TIKTOK',    handle: '@animal_zip',  displayName: 'animal_zip',   folder: '해짜 (동물)',            subscribers: 21_300 },
  { platform: 'INSTAGRAM', handle: '@movie_kr',    displayName: 'movie_kr',     folder: '영드짜',                 subscribers: 8_900 },
  { platform: 'INSTAGRAM', handle: '@cats_daily',  displayName: 'cats_daily',   folder: '해짜 (동물)',            subscribers: 14_200 },
];

export async function GET(req: NextRequest) {
  // cron secret 도 허용 (CSV 백업/외부 스크립트용)
  const qSecret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  const secretOk = !!cronSecret && qSecret === cronSecret;
  if (!secretOk && !checkApiKey(req)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Bearer token required' },
      }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  const platform = req.nextUrl.searchParams.get('platform');
  const folder = req.nextUrl.searchParams.get('folder');

  let rows: { platform: string; handle: string | null; displayName: string | null; folder: string; subscribers: number | null; url: string }[];
  try {
    const channels = await prisma.channel.findMany({
      where: {
        isActive: true,
        ...(platform ? { platform: platform.toUpperCase() as any } : {}),
        ...(folder ? { folder: { name: { contains: folder } } } : {}),
      },
      include: { folder: { select: { name: true } } },
      orderBy: [{ folderId: 'asc' }, { addedAt: 'desc' }],
    });
    rows = channels.map((c) => ({
      platform: c.platform,
      handle: c.handle,
      displayName: c.displayName,
      folder: c.folder.name,
      subscribers: c.subscriberCount,
      url: channelUrl(c.platform, c.handle, c.externalId),
    }));
  } catch {
    rows = MOCK
      .filter((r) => !platform || r.platform === platform.toUpperCase())
      .filter((r) => !folder || r.folder.includes(folder))
      .map((r) => ({ ...r, url: '' }));
  }

  const header = ['platform', 'handle', 'displayName', 'folder', 'subscribers', 'url'];
  const csv = [
    header,
    ...rows.map((r) => [r.platform, r.handle ?? '', r.displayName ?? '', r.folder, String(r.subscribers ?? ''), r.url]),
  ]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');

  const date = new Date().toISOString().slice(0, 10);
  const tag = platform ? platform.toLowerCase() : 'all';

  return new Response('\uFEFF' + csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="trend-finder_channels_${tag}_${date}.csv"`,
    },
  });
}

/** 플랫폼별 채널 URL 복원 (핸들 우선, 없으면 externalId). */
function channelUrl(platform: string, handle: string | null, externalId: string): string {
  const h = handle?.replace(/^@/, '') ?? '';
  switch (platform) {
    case 'YOUTUBE':
      if (h) return `https://www.youtube.com/@${h}`;
      return externalId ? `https://www.youtube.com/channel/${externalId}` : '';
    case 'TIKTOK':
      return h ? `https://www.tiktok.com/@${h}` : '';
    case 'INSTAGRAM':
      return h ? `https://www.instagram.com/${h}/` : '';
    default:
      return h;
  }
}

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

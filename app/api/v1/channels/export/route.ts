import { NextRequest } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Mock until DB connected. Real impl: prisma.channel.findMany() with folder.name join.
const mock = [
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
  if (!checkApiKey(req)) {
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

  let rows = mock;
  if (platform) rows = rows.filter((r) => r.platform === platform.toUpperCase());
  if (folder) rows = rows.filter((r) => r.folder === folder);

  const header = ['platform', 'handle', 'displayName', 'folder', 'subscribers'];
  const csv = [
    header,
    ...rows.map((r) => [r.platform, r.handle, r.displayName, r.folder, String(r.subscribers)]),
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

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

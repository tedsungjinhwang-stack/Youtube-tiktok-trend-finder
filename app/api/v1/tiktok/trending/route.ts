import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchTiktokTrending } from '@/lib/scraper/tiktok-trending';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 마지막 TikTok 스냅샷이 이 시간보다 오래되면 백그라운드로 새 스냅샷 */
const SNAPSHOT_STALE_HOURS = 6;
/** 캐시 윈도우 점진 확장 — 트렌딩 결과가 적을 때 자동 확장 */
const WINDOW_STEPS_HOURS = [72, 168, 336, 720];
const MIN_TARGET = 100;

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') ?? 'KR').toUpperCase();

  // 캐시 먼저
  let cached;
  try {
    cached = await fetchFromCache(country);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }

  if (cached.length > 0) {
    // 캐시 있으면 즉시 반환 + 백그라운드로 갱신 (오래된 경우)
    maybeTakeSnapshotInBackground(country).catch((e) =>
      console.error('[tiktok bg snapshot]', e)
    );
    return NextResponse.json({
      success: true,
      data: cached,
      meta: { total: cached.length, country, platform: 'TIKTOK', source: 'cache' },
    });
  }

  // 캐시 비어있으면 동기적으로 한 번 가져와서 결과 + 에러 보여줌
  try {
    await takeSnapshotNow(country);
    const after = await fetchFromCache(country);
    return NextResponse.json({
      success: true,
      data: after,
      meta: { total: after.length, country, platform: 'TIKTOK', source: 'apify-live' },
    });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'APIFY_ERROR',
          message: `TikTok 트렌딩 가져오기 실패: ${msg.slice(0, 300)}`,
        },
      },
      { status: 502 }
    );
  }
}

async function takeSnapshotNow(region: string): Promise<void> {
  const videos = await fetchTiktokTrending(region, 200);
  if (videos.length === 0) {
    throw new Error('Apify 결과 0개 — actor 응답 비어있음. APIFY_API_TOKEN 확인 또는 actor 입력 검토');
  }
  const capturedAt = new Date();
  await prisma.trendingSnapshot.createMany({
    data: videos.map((v) => ({
      platform: 'TIKTOK',
      region,
      videoId: v.videoId,
      url: v.url,
      title: v.title,
      channelId: v.channelId,
      channelName: v.channelName,
      thumbnailUrl: v.thumbnailUrl || null,
      viewCount: BigInt(v.viewCount),
      likeCount: v.likeCount != null ? BigInt(v.likeCount) : null,
      commentCount: v.commentCount != null ? BigInt(v.commentCount) : null,
      durationSeconds: v.durationSeconds,
      isShorts: true,
      publishedAt: new Date(v.publishedAt),
      capturedAt,
    })),
    skipDuplicates: true,
  });
}

async function maybeTakeSnapshotInBackground(region: string): Promise<void> {
  try {
    const last = await prisma.trendingSnapshot.findFirst({
      where: { platform: 'TIKTOK', region },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true },
    });
    const isStale =
      !last ||
      Date.now() - last.capturedAt.getTime() > SNAPSHOT_STALE_HOURS * 3600_000;
    if (!isStale) return;

    const videos = await fetchTiktokTrending(region, 30);
    if (videos.length === 0) return;

    const capturedAt = new Date();
    await prisma.trendingSnapshot.createMany({
      data: videos.map((v) => ({
        platform: 'TIKTOK',
        region,
        videoId: v.videoId,
        url: v.url,
        title: v.title,
        channelId: v.channelId,
        channelName: v.channelName,
        thumbnailUrl: v.thumbnailUrl || null,
        viewCount: BigInt(v.viewCount),
        likeCount: v.likeCount != null ? BigInt(v.likeCount) : null,
        commentCount: v.commentCount != null ? BigInt(v.commentCount) : null,
        durationSeconds: v.durationSeconds,
        isShorts: true,
        publishedAt: new Date(v.publishedAt),
        capturedAt,
      })),
      skipDuplicates: true,
    });

    // 30일 넘은 행 정리
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    await prisma.trendingSnapshot.deleteMany({
      where: { platform: 'TIKTOK', capturedAt: { lt: monthAgo } },
    });
  } catch (e) {
    console.error('[tiktok snapshot bg]', (e as Error).message);
  }
}

async function fetchFromCache(region: string) {
  let dedupe: Awaited<ReturnType<typeof queryCacheRows>> = [];
  for (const hours of WINDOW_STEPS_HOURS) {
    dedupe = await queryCacheRows(region, hours);
    if (dedupe.length >= MIN_TARGET) break;
  }

  return dedupe.map((r, i) => ({
    rank: i + 1,
    videoId: r.videoId,
    url: r.url ?? '',
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    channelId: r.channelId,
    channelName: r.channelName,
    publishedAt: r.publishedAt.toISOString(),
    viewCount: Number(r.viewCount),
    likeCount: r.likeCount != null ? Number(r.likeCount) : null,
    commentCount: r.commentCount != null ? Number(r.commentCount) : null,
    durationSeconds: r.durationSeconds,
    isShorts: r.isShorts,
    region,
  }));
}

async function queryCacheRows(region: string, hours: number) {
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.trendingSnapshot.findMany({
    where: { platform: 'TIKTOK', region, capturedAt: { gte: cutoff } },
    orderBy: [{ capturedAt: 'desc' }, { viewCount: 'desc' }],
    take: 5000,
  });
  const seen = new Set<string>();
  const dedupe: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.videoId)) continue;
    seen.add(r.videoId);
    dedupe.push(r);
  }
  dedupe.sort((a, b) => Number(b.viewCount) - Number(a.viewCount));
  return dedupe;
}

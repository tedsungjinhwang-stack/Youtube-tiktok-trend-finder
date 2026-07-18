/**
 * 디스커버리(픽셀링 클론) 수집기.
 * 의존성 없이 fetch + 정규식 파싱. 각 소스는 독립적으로 실패해도 나머지는 진행.
 *
 *  🇰🇷 한국 커뮤니티 : 뽐뿌 hot.php 인기글 (게시판/순위/댓글/조회수) — aagag 는 Cloudflare 차단
 *  🇯🇵 일본          : matomedane.jp 홈 인기글 (썸네일+제목)
 *  🇩🇪 독일 / 글로벌  : Reddit JSON (r/de, r/popular)
 *  📰 뉴스           : Google News RSS (KR)
 */

export type DiscoveryTab = 'community' | 'news' | 'reddit';
export type DiscoveryCountry = 'KR' | 'JP' | 'DE' | 'GLOBAL';

export type DiscoveryItem = {
  tab: DiscoveryTab;
  country: DiscoveryCountry;
  source: string;
  sourceLabel?: string | null;
  sourceKey: string;
  rank: number;
  title: string;
  url: string;
  thumbnailUrl?: string | null;
  commentCount?: number | null;
  viewCount?: number | null;
  score?: number | null;
  lang?: string | null;
  publishedAt?: Date | null;
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko,ja,en;q=0.8', ...(init?.headers || {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** EUC-KR 페이지 (뽐뿌 등) 디코딩. */
async function fetchTextEuckr(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...(init?.headers || {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('euc-kr').decode(buf);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''));
}

/* ----------------------------- 🇰🇷 한국 ----------------------------- */

/**
 * 뽐뿌 핫게시물(hot.php) — 여러 게시판의 인기글이 순위로 모임. EUC-KR.
 * aagag 가 Cloudflare 봇차단(2026)으로 막혀 대체.
 * 각 행: <tr class="baseList" data-bbs_id="stock" data-bbs_no="405724"> ...
 *   게시판명 <a href="/zboard/zboard.php?id=..">증권포럼</a>
 *   제목 <a class="baseList-title">..</a> + <span class="list_comment2">61</span>
 *   마지막 board_date 셀 = 조회수
 */
export async function scrapeKorea(): Promise<DiscoveryItem[]> {
  const html = await fetchTextEuckr('https://www.ppomppu.co.kr/hot.php');
  const out: DiscoveryItem[] = [];
  const rows = html.split('<tr class="baseList').slice(1);
  let rank = 0;
  const seen = new Set<string>();
  for (const seg of rows) {
    const idM = seg.match(/data-bbs_id="([^"]+)"/);
    const noM = seg.match(/data-bbs_no="(\d+)"/);
    if (!idM || !noM) continue;
    const id = idM[1];
    const no = noM[1];
    const key = `${id}:${no}`;
    if (seen.has(key)) continue;
    const boardM = seg.match(/\/zboard\/zboard\.php\?id=[^"]+"[^>]*>([^<]+)<\/a>/);
    // baseList-title 앵커 안쪽(중첩 img 포함) → 첫 </a> 까지
    const titleM = seg.match(/class="baseList-title"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleM ? stripTags(titleM[1]) : '';
    if (!title) continue;
    const commentM = seg.match(/list_comment2">(\d+)</);
    const views = [...seg.matchAll(/board_date">(\d+)<\/td>/g)];
    seen.add(key);
    rank += 1;
    out.push({
      tab: 'community',
      country: 'KR',
      source: id,
      sourceLabel: boardM ? stripTags(boardM[1]) : id,
      sourceKey: `kr:ppomppu:${key}`,
      rank,
      title,
      url: `https://www.ppomppu.co.kr/zboard/view.php?id=${id}&no=${no}`,
      commentCount: commentM ? Number(commentM[1]) : null,
      viewCount: views.length ? Number(views[views.length - 1][1]) : null,
      lang: 'ko',
    });
    if (rank >= 60) break;
  }
  return out;
}

/* ----------------------------- 🇯🇵 일본 ----------------------------- */

export async function scrapeJapan(): Promise<DiscoveryItem[]> {
  const html = await fetchText('https://matomedane.jp/');
  const re =
    /<a href="(\/page\/\d+)">\s*<img src="(\/page\/image\/thumb\/\d+\.jpg)"\s+alt="([^"]+)"/g;
  const out: DiscoveryItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  let rank = 0;
  while ((m = re.exec(html))) {
    const [, href, img, rawTitle] = m;
    if (seen.has(href)) continue;
    seen.add(href);
    const title = decodeEntities(rawTitle);
    if (!title) continue;
    rank += 1;
    out.push({
      tab: 'community',
      country: 'JP',
      source: 'matomedane',
      sourceLabel: 'まとめだね',
      sourceKey: `jp:${href}`,
      rank,
      title,
      url: `https://matomedane.jp${href}`,
      thumbnailUrl: `https://matomedane.jp${img}`,
      lang: 'ja',
    });
  }
  return out;
}

/* --------------------------- 🇩🇪 / 글로벌 (Reddit) --------------------------- */

type RedditChild = {
  data: {
    title: string;
    score: number;
    num_comments: number;
    permalink: string;
    subreddit: string;
    subreddit_name_prefixed: string;
    thumbnail?: string;
    created_utc: number;
  };
};

async function fetchSubreddit(
  sub: string,
  country: DiscoveryCountry,
  lang: string,
  limit = 50
): Promise<DiscoveryItem[]> {
  // Reddit 정책: 고유 UA + 명확한 식별자 권장. 봇 차단 회피용으로 JSON 여러 호스트 시도 → RSS 폴백.
  const headers = {
    'User-Agent': 'trendfinder/1.0 (+https://trendfinder-radaq.vercel.app)',
    Accept: 'application/json, text/html;q=0.5',
  };
  const jsonEndpoints = [
    `https://www.reddit.com/${sub}/hot.json?limit=${limit}&raw_json=1`,
    `https://old.reddit.com/${sub}/hot.json?limit=${limit}&raw_json=1`,
    `https://oauth.reddit.com/${sub}/hot.json?limit=${limit}&raw_json=1`,
  ];
  let lastErr: Error | null = null;
  for (const url of jsonEndpoints) {
    try {
      const text = await fetchText(url, { headers });
      // 차단 페이지가 200으로 와도 JSON 아닌 경우가 있음
      if (!text.trim().startsWith('{')) {
        throw new Error(`non-json response (${text.slice(0, 40)})`);
      }
      return parseRedditJson(text, country, lang);
    } catch (e) {
      lastErr = e as Error;
    }
  }
  // 최종 폴백: RSS (score/comments 못 가져옴)
  try {
    return await fetchSubredditRss(sub, country, lang, limit);
  } catch (e) {
    throw new Error(
      `reddit ${sub} blocked. last json err: ${lastErr?.message?.slice(0, 80)}; rss err: ${(e as Error).message.slice(0, 80)}`
    );
  }
}

function parseRedditJson(
  text: string,
  country: DiscoveryCountry,
  lang: string
): DiscoveryItem[] {
  const parsed = JSON.parse(text) as { data: { children: RedditChild[] } };
  const out: DiscoveryItem[] = [];
  let rank = 0;
  for (const c of parsed.data.children) {
    const d = c.data;
    if (!d?.title) continue;
    rank += 1;
    const thumb =
      d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : null;
    out.push({
      tab: 'reddit',
      country,
      source: d.subreddit,
      sourceLabel: d.subreddit_name_prefixed || `r/${d.subreddit}`,
      sourceKey: `reddit:${d.permalink}`,
      rank,
      title: decodeEntities(d.title),
      url: `https://www.reddit.com${d.permalink}`,
      thumbnailUrl: thumb,
      commentCount: d.num_comments ?? null,
      score: d.score ?? null,
      lang,
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000) : null,
    });
  }
  return out;
}

async function fetchSubredditRss(
  sub: string,
  country: DiscoveryCountry,
  lang: string,
  limit: number
): Promise<DiscoveryItem[]> {
  const xml = await fetchText(
    `https://www.reddit.com/${sub}/hot/.rss?limit=${limit}`,
    {
      headers: {
        'User-Agent': 'trendfinder/1.0 (+https://trendfinder-radaq.vercel.app)',
        Accept: 'application/atom+xml, application/xml, text/xml',
      },
    }
  );
  const entries = xml.split('<entry>').slice(1);
  const out: DiscoveryItem[] = [];
  let rank = 0;
  for (const block of entries) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '';
    const pub = block.match(/<published>([\s\S]*?)<\/published>/)?.[1];
    const thumb = block.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] ?? null;
    if (!title || !link) continue;
    const permalink = link.replace(/^https?:\/\/[^/]+/, '');
    rank += 1;
    out.push({
      tab: 'reddit',
      country,
      source: sub.replace(/^r\//, ''),
      sourceLabel: sub,
      sourceKey: `reddit:${permalink}`,
      rank,
      title: decodeEntities(title.replace(/<!\[CDATA\[|\]\]>/g, '')),
      url: link,
      thumbnailUrl: thumb,
      lang,
      publishedAt: pub ? new Date(pub) : null,
    });
    if (rank >= limit) break;
  }
  return out;
}

export async function scrapeReddit(): Promise<DiscoveryItem[]> {
  const results = await Promise.allSettled([
    fetchSubreddit('r/de', 'DE', 'de', 50),
    fetchSubreddit('r/popular', 'GLOBAL', 'en', 50),
  ]);
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

/* ----------------------------- 📰 뉴스 ----------------------------- */

export async function scrapeNews(): Promise<DiscoveryItem[]> {
  const xml = await fetchText(
    'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko'
  );
  const items = xml.split('<item>').slice(1);
  const out: DiscoveryItem[] = [];
  let rank = 0;
  for (const block of items) {
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '';
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const full = decodeEntities(titleRaw.replace(/<!\[CDATA\[|\]\]>/g, ''));
    if (!full || !link) continue;
    // Google News 제목 형식: "기사제목 - 언론사"
    const idx = full.lastIndexOf(' - ');
    const title = idx > 0 ? full.slice(0, idx) : full;
    const press = idx > 0 ? full.slice(idx + 3) : null;
    rank += 1;
    out.push({
      tab: 'news',
      country: 'KR',
      source: 'news',
      sourceLabel: press,
      sourceKey: `news:${link}`,
      rank,
      title,
      url: link,
      publishedAt: pub ? new Date(pub) : null,
      lang: 'ko',
    });
    if (rank >= 100) break;
  }
  return out;
}

/** 전체 소스 수집 (실패한 소스는 빈 배열). */
export async function scrapeAll(): Promise<{
  items: DiscoveryItem[];
  report: Record<string, number | string>;
}> {
  const tasks: [string, Promise<DiscoveryItem[]>][] = [
    ['korea', scrapeKorea()],
    ['japan', scrapeJapan()],
    ['reddit', scrapeReddit()],
    ['news', scrapeNews()],
  ];
  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const items: DiscoveryItem[] = [];
  const report: Record<string, number | string> = {};
  settled.forEach((r, i) => {
    const name = tasks[i][0];
    if (r.status === 'fulfilled') {
      items.push(...r.value);
      report[name] = r.value.length;
    } else {
      report[name] = `ERR: ${String(r.reason).slice(0, 120)}`;
    }
  });
  return { items, report };
}

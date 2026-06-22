/**
 * 디스커버리(픽셀링 클론) 수집기.
 * 의존성 없이 fetch + 정규식 파싱. 각 소스는 독립적으로 실패해도 나머지는 진행.
 *
 *  🇰🇷 한국 커뮤니티 : aagag.com 홈의 "커뮤니티별 인기순" mirror 블록 (출처/순위/댓글수)
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

// aagag bc_* 클래스 → 표시용 한글 출처명
const KR_SITES: Record<string, string> = {
  fmkorea: '에펨코리아',
  mlbpark: 'MLB파크',
  ppomppu: '뽐뿌',
  ruli: '루리웹',
  clien: '클리앙',
  inven: '인벤',
  slrclub: 'SLR클럽',
  '82cook': '82쿡',
  humor: '웃긴대학',
  etoland: '이토랜드',
  bobae: '보배드림',
  ddanzi: '딴지일보',
  ou: '오늘의유머',
};

export async function scrapeKorea(): Promise<DiscoveryItem[]> {
  const html = await fetchText('https://aagag.com/');
  const re =
    /<a href="\/mirror\/re\.php\?ss=([^"]+)"[^>]*class="article c">\s*<span class="lo rank bc_(\w+)">(\d+)<\/span><span class="lpadding title"[^>]*>(.*?)<\/span><span class="roverlay"><span class="cnt">(\d+)<\/span>/g;
  const out: DiscoveryItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, ss, site, rank, rawTitle, cnt] = m;
    const title = stripTags(rawTitle);
    if (!title) continue;
    out.push({
      tab: 'community',
      country: 'KR',
      source: site,
      sourceLabel: KR_SITES[site] ?? site,
      sourceKey: `kr:${ss}`,
      rank: Number(rank),
      title,
      url: `https://aagag.com/mirror/re.php?ss=${ss}`,
      commentCount: Number(cnt),
      lang: 'ko',
    });
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
  const json = await fetchText(
    `https://www.reddit.com/${sub}/hot.json?limit=${limit}&raw_json=1`,
    { headers: { Accept: 'application/json' } }
  );
  const parsed = JSON.parse(json) as { data: { children: RedditChild[] } };
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

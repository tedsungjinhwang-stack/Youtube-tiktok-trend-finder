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
  viewCount?: number | null;
  score?: number | null;
  lang?: string | null;
  publishedAt?: Date | null;
};

/** aagag "46초전" / "3분전" / "2시간전" / "5일전" / "지금" → Date */
function parseAagagRelative(text: string | undefined): Date | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, '').trim();
  if (t === '지금' || t === '방금') return new Date();
  const m = t.match(/(\d+)(초|분|시간|일)전/);
  if (!m) return null;
  const n = Number(m[1]);
  const unitMs =
    m[2] === '초' ? 1000 :
    m[2] === '분' ? 60_000 :
    m[2] === '시간' ? 3600_000 :
    86_400_000;
  return new Date(Date.now() - n * unitMs);
}

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

/**
 * aagag 메인 피드 (홈 큰 카드 영역) — mirror 와 달리 조회수+게시 시각이 있음.
 * 출처(fmkorea/뽐뿌 등) 표시는 없음. 보완용으로 같이 노출.
 */
export async function scrapeKoreaMain(): Promise<DiscoveryItem[]> {
  const html = await fetchText('https://aagag.com/');
  // 각 카드: <a class="article c t" href="/issue/?idx=N">...<span class="title">제목<span class="btmlayer">
  //   ... <span class="hit"><u>NUM</u></span> ... <span class="time right"><u><i>...</i>46초전</u></span>
  const blocks = html.split('<a class="article c t"').slice(1);
  const out: DiscoveryItem[] = [];
  let rank = 0;
  for (const seg of blocks) {
    const idxM = seg.match(/href="\/issue\/\?idx=(\d+)"/);
    const thumbM = seg.match(/background-image:url\(([^)]+)\)/);
    const titleM = seg.match(/<span class="title">([^<]+)<span class="btmlayer">/);
    const hitM = seg.match(/<span class="hit"><u>(\d+)<\/u>/);
    const timeM = seg.match(/<span class="time right"><u>(?:<i[^>]*><\/i>)?([^<]+)<\/u>/);
    if (!idxM || !titleM) continue;
    const title = decodeEntities(titleM[1]).trim();
    if (!title) continue;
    const thumbRaw = thumbM?.[1];
    const thumb = thumbRaw
      ? thumbRaw.startsWith('//') ? `https:${thumbRaw}` : thumbRaw
      : null;
    rank += 1;
    out.push({
      tab: 'community',
      country: 'KR',
      source: 'aagag',
      sourceLabel: 'aagag 인기',
      sourceKey: `kr:aagag:${idxM[1]}`,
      rank,
      title,
      url: `https://aagag.com/issue/?idx=${idxM[1]}`,
      thumbnailUrl: thumb,
      viewCount: hitM ? Number(hitM[1]) : null,
      publishedAt: parseAagagRelative(timeM?.[1]),
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
    ['koreaMain', scrapeKoreaMain()],
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

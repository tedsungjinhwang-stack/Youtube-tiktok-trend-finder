/**
 * Video format auto-inference heuristic.
 * 정확도보다 회수율 우선 — 명백한 신호가 있으면 라벨, 애매하면 UNDEFINED.
 * 사용자가 수동 라벨한 영상은 formatLockedBy='user'로 보호.
 */

import type { VideoFormat } from '@prisma/client';

type InferInput = {
  caption: string | null;
  durationSeconds: number | null | undefined;
  isShorts: boolean | null | undefined;
};

const RULES: Array<{ format: VideoFormat; patterns: RegExp[] }> = [
  {
    format: 'AI_GENERATED',
    patterns: [/\bAI\b|인공지능|generated|sora|midjourney|veo|runway/i],
  },
  {
    format: 'COMPILATION',
    patterns: [/모음|레전드.*모음|zip|컴필|best of|top\s*\d+|레전드 ZIP/i],
  },
  {
    format: 'HIGHLIGHT',
    patterns: [/하이라이트|highlight|핵심.*장면|결승.*요약|풀영상.*요약/i],
  },
  {
    format: 'MONTAGE',
    patterns: [/짜집기|편집본|모음편|mash[- ]?up|montage/i],
  },
  {
    format: 'MEME_TEMPLATE',
    patterns: [/짤|밈|meme/i],
  },
  {
    format: 'STORY',
    patterns: [/스토리|썰|레전드 썰/i],
  },
  {
    format: 'IMAGE_SLIDE',
    patterns: [/슬라이드|웹툰|카드뉴스|image slide/i],
  },
];

export function inferFormat(input: InferInput): VideoFormat {
  const cap = input.caption ?? '';
  if (cap.trim()) {
    for (const rule of RULES) {
      if (rule.patterns.some((p) => p.test(cap))) return rule.format;
    }
  }
  // 짧으면 짤/스토리 가능성↑이지만 단정 불가 → UNDEFINED.
  // 직촬(ORIGINAL)은 본문에 신호가 거의 없어 휴리스틱으론 추론 X.
  return 'UNDEFINED';
}

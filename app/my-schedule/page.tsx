import { redirect } from 'next/navigation';

/** 구 경로 — 「채널 대시보드」로 개명·이동됨. 북마크/외부 링크 호환용 리다이렉트. */
export default function MySchedulePage() {
  redirect('/channel-dashboard');
}

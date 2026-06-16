import { redirect } from 'next/navigation';

export default function SocialRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams as Record<string, string>);
  qs.set('platforms', 'TIKTOK,INSTAGRAM');
  redirect(`/all?${qs.toString()}`);
}

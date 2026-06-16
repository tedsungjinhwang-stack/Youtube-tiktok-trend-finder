import { redirect } from 'next/navigation';

export default function YoutubeRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams as Record<string, string>);
  qs.set('platforms', 'YOUTUBE');
  redirect(`/all?${qs.toString()}`);
}

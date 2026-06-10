import { redirect } from 'next/navigation';

export default function ChannelsShareRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams as Record<string, string>);
  qs.set('type', 'channel');
  redirect(`/share?${qs.toString()}`);
}

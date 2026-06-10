import { redirect } from 'next/navigation';

export default function MyScheduleShareRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams as Record<string, string>);
  qs.set('type', 'material');
  redirect(`/share?${qs.toString()}`);
}

import { redirect } from 'next/navigation';

export default function DouyinRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams as Record<string, string>);
  qs.set('platforms', 'DOUYIN');
  redirect(`/all?${qs.toString()}`);
}

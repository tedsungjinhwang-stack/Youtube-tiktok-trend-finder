import { redirect } from 'next/navigation';

export default function XiaohongshuRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams as Record<string, string>);
  qs.set('platforms', 'XIAOHONGSHU');
  redirect(`/all?${qs.toString()}`);
}

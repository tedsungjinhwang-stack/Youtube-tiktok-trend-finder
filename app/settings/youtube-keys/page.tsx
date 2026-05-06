import { redirect } from 'next/navigation';

export default function YoutubeKeysRedirect() {
  redirect('/settings/api-keys');
}

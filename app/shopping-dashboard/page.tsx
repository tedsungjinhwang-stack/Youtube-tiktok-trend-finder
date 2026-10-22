import { redirect } from 'next/navigation';

/** 예전 주소(쇼핑쇼츠) — 즐겨찾기가 깨지지 않게 인스타 대시보드로 넘긴다 */
export default function ShoppingDashboardRedirect() {
  redirect('/instagram-dashboard');
}

/**
 * 예약 일시를 항상 한국시간(KST, UTC+9) 기준으로 다루기 위한 헬퍼.
 *
 * datetime-local 입력값("YYYY-MM-DDTHH:mm")은 타임존 정보가 없어서
 * new Date() 로 파싱하면 실행 환경(브라우저/서버) 로컬 타임존으로 해석됨 →
 * 서버(UTC)나 비-KST 기기에서 9시간 어긋남. 그래서 명시적으로 +09:00 을 붙인다.
 */

const KST_OFFSET = '+09:00';

/** datetime-local 문자열(KST 벽시계) → UTC ISO 문자열 (DB 저장용) */
export function kstLocalToISO(local: string): string {
  if (!local) return new Date().toISOString();
  // "YYYY-MM-DDTHH:mm" → "YYYY-MM-DDTHH:mm:00+09:00"
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return new Date(`${withSeconds}${KST_OFFSET}`).toISOString();
}

/** UTC ISO(or Date) → datetime-local 문자열(KST 벽시계). input value 표시용 */
export function isoToKstLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // en-CA → YYYY-MM-DD 형식. hour 24시 표기 보정
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** 내일 16:30 (KST) 의 datetime-local 문자열 */
export function tomorrowKstLocal(hour = 16, minute = 30): string {
  const nowKst = isoToKstLocal(new Date());
  const datePart = nowKst.slice(0, 10);
  // 날짜 +1
  const d = new Date(`${datePart}T00:00:00${KST_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = isoToKstLocal(d).slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tomorrow}T${p(hour)}:${p(minute)}`;
}

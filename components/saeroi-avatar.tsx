/**
 * 오늘의 한마디 옆 / 좌측 여백에 붙는 아바타. public/saeroi.jpg 를 쓴다.
 *
 * variant
 *  - 'face' (기본) 원형으로 얼굴만. 원본이 상반신이라 그대로 두면 얼굴이 너무 작아서
 *    확대한 뒤 아래로 밀어 얼굴만 담는다 (조합을 여러 개 렌더해 보고 고른 값).
 *  - 'full'         원본을 자르지 않고 통째로. 좌측 여백처럼 크게 놓는 자리용.
 */
const FACE_ZOOM = 'scale(2.4) translateY(30%)';

export function SaeroiAvatar({
  size = 44,
  variant = 'face',
}: {
  size?: number | string;
  variant?: 'face' | 'full';
}) {
  const full = variant === 'full';
  return (
    <div
      className={
        'relative shrink-0 overflow-hidden bg-white ring-1 ring-[color:var(--border-row)] ' +
        (full ? 'rounded-2xl' : 'rounded-full')
      }
      style={{ width: size, aspectRatio: '1 / 1' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 크기 고정된 로컬 정적 파일이라 최적화 불필요 */}
      <img
        src="/saeroi.jpg"
        alt=""
        draggable={false}
        className={'h-full w-full select-none ' + (full ? 'object-contain' : 'object-cover')}
        style={full ? undefined : { transform: FACE_ZOOM }}
      />
    </div>
  );
}

/**
 * 오늘의 한마디 배너 / 좌측 여백에 붙는 사진.
 *
 * 자리마다 쓰는 사진이 다르다. 원본보다 크게 그리면 확대 보간이 들어가 뿌옇게 나오므로
 * 각 사진의 실제 픽셀 폭을 같이 들고 다니며 그 값을 상한으로 쓴다.
 * 더 큰 파일로 교체하면 width 숫자만 올리면 된다.
 */
export const SAEROI_PHOTOS = {
  /** 흰 배경 후디 — 정사각 */
  hoodie: { src: '/saeroi.jpg', width: 148 },
  /** 단밤 수트 — 세로 2:3 */
  danbam: { src: '/saeroi-full.jpg', width: 452 },
} as const;

export type SaeroiPhoto = keyof typeof SAEROI_PHOTOS;

/**
 * hoodie 사진 기준 얼굴 크롭값. 원본이 상반신이라 그대로 두면 얼굴이 너무 작아서
 * 확대한 뒤 아래로 밀어 얼굴만 담는다 (조합을 여러 개 렌더해 보고 고른 값).
 */
const FACE_ZOOM = 'scale(2.4) translateY(30%)';

export function SaeroiAvatar({
  size = 44,
  variant = 'face',
  photo = 'hoodie',
}: {
  size?: number | string;
  /** 'face' 원형 얼굴 크롭 · 'full' 원본 무크롭 (비율 그대로, 높이 강제 없음) */
  variant?: 'face' | 'full';
  photo?: SaeroiPhoto;
}) {
  const full = variant === 'full';
  const { src } = SAEROI_PHOTOS[photo];
  return (
    <div
      className={
        'relative shrink-0 overflow-hidden ring-1 ring-[color:var(--border-row)] ' +
        (full ? 'rounded-2xl' : 'rounded-full bg-white')
      }
      style={{ width: size, aspectRatio: full ? undefined : '1 / 1' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 크기 고정된 로컬 정적 파일이라 최적화 불필요 */}
      <img
        src={src}
        alt=""
        draggable={false}
        className={
          'w-full select-none ' + (full ? 'h-auto object-contain' : 'h-full object-cover')
        }
        style={full ? undefined : { transform: FACE_ZOOM }}
      />
    </div>
  );
}

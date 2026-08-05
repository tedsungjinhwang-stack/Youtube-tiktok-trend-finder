/**
 * 오늘의 한마디 옆 / 좌측 여백에 붙는 아바타.
 *
 * public/saeroi.jpg 를 원형으로 크롭해서 쓴다. 원본이 상반신 사진이라
 * 그대로 두면 얼굴이 너무 작아서, 확대한 뒤 아래로 밀어 얼굴만 담는다.
 * (scale / translateY 는 여러 조합을 렌더해 보고 고른 값)
 */
const ZOOM = 'scale(2.4) translateY(30%)';

export function SaeroiAvatar({ size = 44 }: { size?: number | string }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-[color:var(--border-row)]"
      style={{ width: size, aspectRatio: '1 / 1' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 크기 고정된 로컬 정적 파일이라 최적화 불필요 */}
      <img
        src="/saeroi.jpg"
        alt=""
        draggable={false}
        className="h-full w-full select-none object-cover"
        style={{ transform: ZOOM }}
      />
    </div>
  );
}

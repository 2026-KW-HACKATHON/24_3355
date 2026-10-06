import { type CSSProperties, useEffect, useId, useState } from "react";
import { isLargeMode } from "../lib/largeMode";
import "./building-scene.css";

// 공개 화면(01·30)과 거주자 홈(03)의 건물 그림. lofi/src/chrome.js의 등각 투영 도시(`.scene[data-city]`)를
// 같은 좌표·색으로 옮겼습니다. 라이브러리 없이 SVG만 쓰고, 처음 한 번만 우리 건물이 땅에서 올라오고
// 올라오는 도중부터 아래층부터 창에 불이 켜집니다(D-27, interaction.md §7). 표지 핀(`data-pin`)은 lofi 세 화면에서 모두 꺼져 있어 두지 않습니다.

/** 1칸 = 10px(lofi `data-scale="10"`). 거주자 홈은 배치에서 0.9배로 줄여 9px입니다. */
const S = 10;
const CX = Math.cos(Math.PI / 6) * S;
const CY = Math.sin(Math.PI / 6) * S;

type Point = readonly [number, number];
type Block = readonly [i: number, j: number, w: number, d: number, h: number];
type Poly = { points: string; className: string };

const P = (i: number, j: number, z: number): Point => [(i - j) * CX, (i + j) * CY - z * S];
const pts = (list: readonly Point[]) =>
  list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function faces([i, j, w, d, h]: Block, tone: "g" | "g2" | "hl"): Poly[] {
  return [
    {
      points: pts([P(i, j + d, 0), P(i + w, j + d, 0), P(i + w, j + d, h), P(i, j + d, h)]),
      className: `wh-scene__${tone}-left`,
    },
    {
      points: pts([P(i + w, j, 0), P(i + w, j + d, 0), P(i + w, j + d, h), P(i + w, j, h)]),
      className: `wh-scene__${tone}-right`,
    },
    {
      points: pts([P(i, j, h), P(i + w, j, h), P(i + w, j + d, h), P(i, j + d, h)]),
      className: `wh-scene__${tone}-top`,
    },
  ];
}

/** 층마다 창 한 줄: 왼쪽 면은 크림색, 오른쪽 면은 달빛색(lofi와 같은 1.1칸 간격, 0.55칸 크기). */
function floors([i, j, w, d, h]: Block): Poly[][] {
  const rows: Poly[][] = [];
  for (let f = 1; f < h; f += 1.1) {
    const row: Poly[] = [];
    for (let k = 0.5; k < w - 0.4; k += 1.1) {
      row.push({
        points: pts([
          P(i + k, j + d, f),
          P(i + k + 0.55, j + d, f),
          P(i + k + 0.55, j + d, f + 0.55),
          P(i + k, j + d, f + 0.55),
        ]),
        className: "wh-scene__window",
      });
    }
    for (let k = 0.5; k < d - 0.4; k += 1.1) {
      row.push({
        points: pts([
          P(i + w, j + k, f),
          P(i + w, j + k + 0.55, f),
          P(i + w, j + k + 0.55, f + 0.55),
          P(i + w, j + k, f + 0.55),
        ]),
        className: "wh-scene__window-lit",
      });
    }
    rows.push(row);
  }
  return rows;
}

const NEIGHBORS: ReadonlyArray<readonly [Block, "g" | "g2"]> = [
  [[-7, -7, 3, 3, 4], "g"],
  [[-3.4, -7, 2.6, 3, 2.6], "g2"],
  [[-7, -3.4, 3, 2.6, 3], "g2"],
  [[4.4, -7, 3, 3, 5], "g"],
  [[4.4, -3.4, 2.6, 2.4, 2.4], "g2"],
  [[-7, 4.4, 3, 3, 2.2], "g"],
  [[4.4, 4.4, 2.8, 3, 3.4], "g2"],
  [[0.4, 4.4, 1.4, 2.6, 2.6], "g"],
  [[-3.4, 4.4, 2.6, 2.6, 3.6], "g2"],
  [[0.2, -7, 1.6, 3, 3.2], "g2"],
];
const HOME: Block = [-3.2, -3.2, 4.4, 4.4, 4];
const depth = ([i, j, w, d]: Block) => i + j + w + d;

const GROUND: Poly[] = [
  {
    points: pts([P(-9, -9, 0), P(9, -9, 0), P(9, 9, 0), P(-9, 9, 0)]),
    className: "wh-scene__ground",
  },
  {
    points: pts([P(-9, 2.2, 0), P(9, 2.2, 0), P(9, 3.8, 0), P(-9, 3.8, 0)]),
    className: "wh-scene__road",
  },
  {
    points: pts([P(2.2, -9, 0), P(3.8, -9, 0), P(3.8, 9, 0), P(2.2, 9, 0)]),
    className: "wh-scene__road",
  },
];
// 우리 건물보다 뒤에 있는 블록은 먼저, 앞에 있는 블록은 나중에 그려 서로 가립니다(lofi의 깊이 정렬).
const sorted = [...NEIGHBORS].sort(([a], [b]) => depth(a) - depth(b));
const BEHIND: Poly[] = [
  ...GROUND,
  ...sorted.filter(([b]) => depth(b) < depth(HOME)).flatMap(([b, tone]) => faces(b, tone)),
];
const FRONT: Poly[] = sorted
  .filter(([b]) => depth(b) >= depth(HOME))
  .flatMap(([b, tone]) => faces(b, tone));
const HOME_FACES = faces(HOME, "hl");
const HOME_FLOORS = floors(HOME).map((polys, floor) => ({
  key: `floor-${floor}`,
  style: { "--floor": floor } as CSSProperties,
  polys,
}));

// 나타남 동안에만 쓰는 땅 윤곽. 바닥 모서리 아래를 가려 건물이 땅에서 솟는 것처럼 보이고,
// 다 올라온 뒤에는 윤곽이 건물보다 1px 넓어 정적 그림과 같습니다.
// 올라오는 거리는 건물 높이(4칸 × 10px = 40px)이고 building-scene.css의 wh-scene-rise와 같아야 합니다.
const RISE = HOME[4] * S;
const [hi, hj, hw, hd] = HOME;
const [leftX, leftY] = P(hi, hj + hd, 0);
const [frontX, frontY] = P(hi + hw, hj + hd, 0);
const [rightX, rightY] = P(hi + hw, hj, 0);
const HOME_CLIP = pts([
  [leftX - 1, leftY + 1],
  [frontX, frontY + 1],
  [rightX + 1, rightY + 1],
  [rightX + 1, -RISE * 3],
  [leftX - 1, -RISE * 3],
]);

export type SceneVariant = "public" | "home";

/** lofi 화면별 `data-oy`·`data-ox`·`data-scale`. 원점은 그림 칸 가로 50%·세로 `y`에서 가로로 옮긴 곳입니다. */
const FRAMES: Record<SceneVariant, { y: string; transform: string }> = {
  public: { y: "56%", transform: "translate(-40 0)" }, // 01·30
  home: { y: "55%", transform: "translate(-10 0) scale(0.9)" }, // 03
};

export type SceneMotion = "appear" | "still";

/**
 * 나타남 효과를 쓸지 정합니다. 동작 줄이기·크게 보기이거나 이번 방문에서 이미 한 번 보였으면 정적 그림입니다.
 * 불러오는 중·실패 화면은 이 그림 대신 스켈레톤·오류 안내를 그리므로 나타남이 없습니다.
 */
export function sceneMotion({
  reduceMotion,
  large,
  shown,
}: {
  reduceMotion: boolean;
  large: boolean;
  shown: boolean;
}): SceneMotion {
  return reduceMotion || large || shown ? "still" : "appear";
}

/** 이번 방문(앱을 연 뒤)에 나타남을 보였는지. 탭·화면을 오가며 다시 그려도 반복하지 않으려고 모듈에 둡니다. */
export type SceneVisit = { shown: boolean };
const visit: SceneVisit = { shown: false };

/** 테스트 전용: 이번 방문의 ‘이미 보임’ 표시를 지웁니다(모듈 상태라 테스트끼리 이어지지 않게). */
export function resetSceneVisitForTest() {
  visit.shown = false;
}

/** 나타남을 화면에 붙인 뒤(effect) 부릅니다. 그다음 그림부터는 정적 그림입니다. */
export function rememberSceneMotion(motion: SceneMotion, state: SceneVisit = visit) {
  if (motion === "appear") state.shown = true;
}

/** 첫 그리기 전에 환경과 이번 방문 상태로 움직임을 정합니다. 브라우저 밖이거나 읽다가 실패하면 정적 그림입니다. */
export function readSceneMotion(state: SceneVisit = visit): SceneMotion {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "still";
  try {
    return sceneMotion({
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      large: isLargeMode(),
      shown: state.shown,
    });
  } catch {
    return "still";
  }
}

const polygons = (list: readonly Poly[]) =>
  list.map((poly) => <polygon key={poly.points} points={poly.points} className={poly.className} />);

/**
 * 건물 그림. 감싸는 칸(높이 고정, 배경 `--wh-scene-bg`)은 화면이 그리고 그림은 그 칸을 채우므로
 * 그림 때문에 아래 내용이 밀리지 않습니다. 장식이라 스크린 리더에서 숨기고, 누르거나 끌 수 없습니다.
 * `variant="home"`은 거주자 홈(lofi 03) 배치입니다.
 */
export function BuildingScene({ variant = "public" }: { variant?: SceneVariant }) {
  const clipId = useId();
  // 첫 그리기 전에 정해야 완성된 건물이 잠깐 보였다가 땅속으로 들어가는 깜빡임이 없습니다.
  const [motion] = useState(() => readSceneMotion());
  const appear = motion === "appear";
  useEffect(() => {
    rememberSceneMotion(motion);
  }, [motion]);
  const frame = FRAMES[variant];

  return (
    <svg className="wh-scene" data-motion={motion} aria-hidden="true" focusable="false">
      <svg x="50%" y={frame.y} overflow="visible" aria-hidden="true">
        <g transform={frame.transform}>
          {appear ? (
            <clipPath id={clipId}>
              <polygon points={HOME_CLIP} />
            </clipPath>
          ) : null}
          {polygons(BEHIND)}
          <g clipPath={appear ? `url(#${clipId})` : undefined}>
            <g className="wh-scene__rise">
              {polygons(HOME_FACES)}
              {HOME_FLOORS.map((row) => (
                <g key={row.key} className="wh-scene__floor" style={row.style}>
                  {polygons(row.polys)}
                </g>
              ))}
            </g>
          </g>
          {polygons(FRONT)}
        </g>
      </svg>
    </svg>
  );
}

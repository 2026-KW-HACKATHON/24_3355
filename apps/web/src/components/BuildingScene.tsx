// 공개 화면(01)의 정적 건물 그림. lofi/src/chrome.js의 등각 투영 자리표시를 같은 좌표로 옮겼습니다.
// 3D는 아직 없고(interaction.md §7), 이 그림이 불러오는 중·동작 줄이기·실패 때의 정적 그림 역할을 합니다.
const W = 366;
const H = 150;
const S = 10;
const OX = W / 2 - 40;
const OY = H * 0.56;
const CX = Math.cos(Math.PI / 6) * S;
const CY = Math.sin(Math.PI / 6) * S;

type Point = readonly [number, number];
type Tone = "g" | "g2" | "hl";

const P = (i: number, j: number, z: number): Point => [
  OX + (i - j) * CX,
  OY + (i + j) * CY - z * S,
];
const pts = (list: readonly Point[]) =>
  list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

type Poly = { points: string; className: string };

function box(i: number, j: number, w: number, d: number, h: number, tone: Tone) {
  const polys: Poly[] = [
    {
      points: pts([P(i, j + d, 0), P(i + w, j + d, 0), P(i + w, j + d, h), P(i, j + d, h)]),
      className: `scene-${tone}-left`,
    },
    {
      points: pts([P(i + w, j, 0), P(i + w, j + d, 0), P(i + w, j + d, h), P(i + w, j, h)]),
      className: `scene-${tone}-right`,
    },
    {
      points: pts([P(i, j, h), P(i + w, j, h), P(i + w, j + d, h), P(i, j + d, h)]),
      className: `scene-${tone}-top`,
    },
  ];
  if (tone === "hl") {
    for (let f = 1; f < h; f += 1.1) {
      for (let k = 0.5; k < w - 0.4; k += 1.1) {
        polys.push({
          points: pts([
            P(i + k, j + d, f),
            P(i + k + 0.55, j + d, f),
            P(i + k + 0.55, j + d, f + 0.55),
            P(i + k, j + d, f + 0.55),
          ]),
          className: "scene-window",
        });
      }
      for (let k = 0.5; k < d - 0.4; k += 1.1) {
        polys.push({
          points: pts([
            P(i + w, j + k, f),
            P(i + w, j + k + 0.55, f),
            P(i + w, j + k + 0.55, f + 0.55),
            P(i + w, j + k, f + 0.55),
          ]),
          className: "scene-window-lit",
        });
      }
    }
  }
  return { polys, depth: i + j + w + d };
}

const BLOCKS: ReadonlyArray<readonly [number, number, number, number, number, Tone]> = [
  [-7, -7, 3, 3, 4, "g"],
  [-3.4, -7, 2.6, 3, 2.6, "g2"],
  [-7, -3.4, 3, 2.6, 3, "g2"],
  [4.4, -7, 3, 3, 5, "g"],
  [4.4, -3.4, 2.6, 2.4, 2.4, "g2"],
  [-7, 4.4, 3, 3, 2.2, "g"],
  [4.4, 4.4, 2.8, 3, 3.4, "g2"],
  [0.4, 4.4, 1.4, 2.6, 2.6, "g"],
  [-3.4, 4.4, 2.6, 2.6, 3.6, "g2"],
  [0.2, -7, 1.6, 3, 3.2, "g2"],
  [-3.2, -3.2, 4.4, 4.4, 4, "hl"],
];

const GROUND: Poly[] = [
  { points: pts([P(-9, -9, 0), P(9, -9, 0), P(9, 9, 0), P(-9, 9, 0)]), className: "scene-ground" },
  {
    points: pts([P(-9, 2.2, 0), P(9, 2.2, 0), P(9, 3.8, 0), P(-9, 3.8, 0)]),
    className: "scene-road",
  },
  {
    points: pts([P(2.2, -9, 0), P(3.8, -9, 0), P(3.8, 9, 0), P(2.2, 9, 0)]),
    className: "scene-road",
  },
];

const POLYS: Poly[] = [
  ...GROUND,
  ...BLOCKS.map(([i, j, w, d, h, tone]) => box(i, j, w, d, h, tone))
    .sort((a, b) => a.depth - b.depth)
    .flatMap((b) => b.polys),
];

export function BuildingScene() {
  return (
    <svg
      className="building-scene"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {POLYS.map((poly) => (
        <polygon key={poly.points} points={poly.points} className={poly.className} />
      ))}
    </svg>
  );
}

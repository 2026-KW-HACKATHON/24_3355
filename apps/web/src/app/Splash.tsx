import { useEffect, useState } from "react";
// 스플래시는 함이를 270~300px로 크게 그려서 640px 사본을 씁니다(화면의 함이는 360px 사본).
import envelope from "../assets/hami/envelope-640.png";
import house from "../assets/hami/house-640.png";
import { Icon } from "../components/Icon";
import { isStandalone } from "../lib/pushEnv";
import "./splash.css";

// 스플래시 · lofi 00. 홈 화면 아이콘으로 열 때만(screens.md 화면 규칙), 앱을 연 뒤 한 번 약 1초 보여줍니다.
// 현관 QR로 연 브라우저, 알림을 눌러 공지 주소로 바로 열린 홈 화면 앱에서는 보이지 않습니다.
const KEY = "wh.splash";
const SHOW_MS = 1000;
/** 사라지는 애니메이션(d4)이 끝날 즈음 지웁니다. 동작 줄이기에서는 애니메이션 없이 바로 지웁니다. */
const LEAVE_MS = 200;

/** 홈 화면 아이콘은 manifest `start_url`(`/`)로 엽니다. 다른 주소로 열렸으면 알림·링크로 연 것입니다. */
export function isIconLaunch(pathname: string, standalone: boolean): boolean {
  return standalone && pathname === "/";
}

function shouldShow(): boolean {
  if (!isIconLaunch(window.location.pathname, isStandalone())) return false;
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, "1");
  } catch {
    // 저장소가 막혀도 이번에는 보여줍니다.
  }
  return true;
}

export function Splash() {
  const [phase, setPhase] = useState<"show" | "leave" | "gone">(() =>
    shouldShow() ? "show" : "gone",
  );

  useEffect(() => {
    if (phase === "gone") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = phase === "show" && !reduce ? "leave" : "gone";
    const timer = window.setTimeout(() => setPhase(next), phase === "show" ? SHOW_MS : LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    // 장식 화면이라 읽지 않습니다. 뒤의 화면은 이미 그려져 있고, 사라지는 동안 누름을 막지 않습니다.
    <div className={phase === "leave" ? "sp-root sp-root--leave" : "sp-root"} aria-hidden="true">
      <div className="sp-stage">
        <p className="sp-word sp-word--top">건물이</p>

        <svg className="sp-deco sp-stamp" viewBox="0 0 60 72" aria-hidden="true">
          <defs>
            <mask id="sp-scal">
              <rect width="60" height="72" fill="#fff" />
              <g fill="#000">
                {[6, 18, 30, 42, 54, 66].map((y) => (
                  <g key={`side-${y}`}>
                    <circle cx="0" cy={y} r="3.2" />
                    <circle cx="60" cy={y} r="3.2" />
                  </g>
                ))}
                {[6, 18, 30, 42, 54].map((x) => (
                  <g key={`edge-${x}`}>
                    <circle cx={x} cy="0" r="3.2" />
                    <circle cx={x} cy="72" r="3.2" />
                  </g>
                ))}
              </g>
            </mask>
            <linearGradient id="sp-navy" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="sp-stop sp-stop--navy-light" />
              <stop offset="1" className="sp-stop sp-stop--navy-dark" />
            </linearGradient>
            <linearGradient id="sp-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="sp-stop sp-stop--gold-light" />
              <stop offset="1" className="sp-stop sp-stop--gold-dark" />
            </linearGradient>
          </defs>
          <g mask="url(#sp-scal)">
            <rect width="60" height="72" rx="2" className="sp-fill-white" />
            <rect x="7" y="7" width="46" height="58" rx="2" fill="url(#sp-navy)" />
          </g>
          <path d="M36 24a13 13 0 1 0 0 24a10 10 0 1 1 0-24z" fill="url(#sp-gold)" />
        </svg>

        <svg className="sp-deco sp-moon" viewBox="0 0 80 80" aria-hidden="true">
          <defs>
            <radialGradient id="sp-moon-fill" cx=".35" cy=".3" r=".8">
              <stop offset="0" className="sp-stop sp-stop--moon-light" />
              <stop offset=".45" className="sp-stop sp-stop--moon-mid" />
              <stop offset="1" className="sp-stop sp-stop--moon-dark" />
            </radialGradient>
            <mask id="sp-cres">
              <rect width="80" height="80" fill="#fff" />
              <circle cx="54" cy="32" r="26" fill="#000" />
            </mask>
          </defs>
          <circle cx="40" cy="40" r="32" fill="url(#sp-moon-fill)" mask="url(#sp-cres)" />
        </svg>

        <img className="sp-hami sp-hami--house" src={house} alt="" width={300} height={300} />
        <img className="sp-hami sp-hami--envelope" src={envelope} alt="" width={270} height={270} />

        <svg className="sp-deco sp-star" viewBox="0 0 80 80" aria-hidden="true">
          <defs>
            <radialGradient id="sp-star-fill" cx=".4" cy=".35" r=".75">
              <stop offset="0" className="sp-stop sp-stop--white" />
              <stop offset=".6" className="sp-stop sp-stop--navy-50" />
              <stop offset="1" className="sp-stop sp-stop--star-edge" />
            </radialGradient>
          </defs>
          <path
            d="M40 4c3 20 8 29 36 36c-28 7-33 16-36 36c-3-20-8-29-36-36c28-7 33-16 36-36z"
            fill="url(#sp-star-fill)"
            className="sp-star__edge"
          />
        </svg>

        <p className="sp-word sp-word--bottom">
          기억해요<em>.</em>
        </p>

        <div className="sp-foot">
          <p className="sp-foot__brand">
            <span className="wh-brand__stamp">
              <Icon name="moon" />
            </span>
            월계함
          </p>
          <p className="sp-foot__sub">사람은 바뀌어도, 건물에 남는 생활 안내</p>
        </div>
      </div>
    </div>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { demoBarLabel, demoEndPath } from "../features/auth/demoRole";
import { endDemo } from "../features/auth/endDemo";
import { useMe } from "../features/auth/queries";
import { Icon } from "./Icon";
import "./demo-bar.css";

/**
 * 시연 중 막대. 내 정보(`/api/me`)가 시연 계정(`user.demo`)이면 어느 탭에서든, 앱 상단 막대 위에 자리를 차지해
 * 둡니다(겹치지 않음). ‘역할 바꾸기’는 29로, ‘시연 끝내기’는 로그아웃하고 지금 화면의 공개 화면(없으면 첫 화면)으로
 * 갑니다. 실제 건물 화면을 열면 시연이 끝나(`useEndDemoOn`) 함께 사라집니다.
 */
export function DemoBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const queryClient = useQueryClient();
  const [ending, setEnding] = useState(false);
  const label = demoBarLabel({ pathname, demo: me.data?.user.demo });
  if (!label) return null;
  return (
    <aside className="wh-demobar" aria-label="시연 안내">
      <span className="wh-demobar__text">
        <Icon name="presentation" />
        <span className="wh-demobar__label">시연 중 · {label}</span>
      </span>
      <span className="wh-demobar__actions">
        <Link to="/demo" className="wh-demobar__link">
          역할 바꾸기
        </Link>
        <button
          type="button"
          className="wh-demobar__link"
          disabled={ending}
          onClick={() => {
            // 일반 로그아웃이 아니라 시연 끝내기(서버가 실제 계정 세션이면 409로 그대로 둠)를 씁니다. 오래 열어 둔
            // 탭의 막대를 눌러도 다른 탭에서 로그인한 카카오 계정이 끊기지 않습니다.
            setEnding(true);
            void endDemo(queryClient)
              .then(() => navigate(demoEndPath(pathname), { replace: true }))
              .finally(() => setEnding(false));
          }}
        >
          시연 끝내기
        </button>
      </span>
    </aside>
  );
}

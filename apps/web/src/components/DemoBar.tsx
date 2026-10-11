import { Link, useLocation } from "react-router";
import { demoBarLabel, readDemoRole } from "../features/auth/demoRole";
import { useDemoLoginAvailable, useMe } from "../features/auth/queries";
import { Icon } from "./Icon";
import "./demo-bar.css";

/**
 * 시연 중 막대. 29에서 시연 역할을 고른 탭에서만, 앱 상단 막대 위에 자리를 차지해 둡니다(겹치지 않음).
 * 시연 모드 확인(GET /api/dev/login)은 이 탭에 시연 표시가 있을 때만 묻습니다.
 */
export function DemoBar() {
  const { pathname } = useLocation();
  const mark = readDemoRole();
  const me = useMe();
  const available = useDemoLoginAvailable(Boolean(mark));
  const label = demoBarLabel({
    pathname,
    available: available.data,
    userId: me.data?.user.id,
    mark,
  });
  if (!label) return null;
  return (
    <aside className="wh-demobar" aria-label="시연 안내">
      <span className="wh-demobar__text">
        <Icon name="presentation" />
        <span className="wh-demobar__label">시연 중 · {label}</span>
      </span>
      <Link to="/demo" className="wh-demobar__link">
        역할 바꾸기
      </Link>
    </aside>
  );
}

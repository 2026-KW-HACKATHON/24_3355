import { Link } from "react-router";
import "./legal-links.css";

/** 화면 맨 아래 약관·개인정보 처리방침 링크(D-28, 법률 검토 전 초안). 내 정보(45) 등에 둡니다. */
export function LegalLinks() {
  return (
    <nav className="wh-legal-links" aria-label="약관">
      <Link className="wh-text-action wh-legal-links__link" to="/terms">
        서비스 이용약관
      </Link>
      <span aria-hidden="true">·</span>
      <Link className="wh-text-action wh-legal-links__link" to="/privacy">
        개인정보 처리방침
      </Link>
    </nav>
  );
}

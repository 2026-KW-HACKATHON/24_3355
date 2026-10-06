// 약관·개인정보 처리방침 초안(D-28) · lofi 없음. `/terms`, `/privacy`. 로그인 없이 누구나 읽습니다.
// 본문은 content/terms에 두고, 마크다운 해석 없이 문단·목록·항목만 그립니다(HTML로 해석하지 않음).
import { TERMS_VERSION } from "@wolgyeham/contracts";
import { Link, useLocation } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { PRIVACY_DOC } from "../../content/terms/privacy";
import { TERMS_DOC } from "../../content/terms/terms";
import type { LegalBlock, LegalDoc } from "../../content/terms/types";
import { termsEffectiveDate } from "../../content/terms/version";
import { teamContactUrl } from "../../lib/teamContact";
import "./legal.css";

export function Component() {
  const { pathname } = useLocation();
  const privacy = pathname.replace(/\/+$/, "") === "/privacy";
  return (
    <LegalPage doc={privacy ? PRIVACY_DOC : TERMS_DOC} other={privacy ? "terms" : "privacy"} />
  );
}

function LegalPage({ doc, other }: { doc: LegalDoc; other: "terms" | "privacy" }) {
  const contact = teamContactUrl();
  return (
    <Screen topbar={<TopBar start={<BackButton fallback="/" />} />}>
      <div className="wh-pad lg-body">
        <div className="lg-draft" role="note">
          <span className="wh-badge wh-badge--moon">초안 · 법률 검토 전</span>
          <p>
            파일럿을 위해 월계함 팀이 쓴 초안이에요. 법률 검토를 거쳐 바뀔 수 있고, 법률 자문이
            아니에요.
          </p>
        </div>

        <h1 className="wh-h-title lg-title" tabIndex={-1}>
          {doc.title}
        </h1>
        <p className="wh-caption lg-meta">
          시행일 {termsEffectiveDate()} · 판 {TERMS_VERSION}
        </p>
        <p className="wh-body lg-lead">{doc.lead}</p>

        {doc.sections.map((section) => (
          <section key={section.id} className="lg-section" aria-labelledby={`lg-${section.id}`}>
            <h2 id={`lg-${section.id}`} className="lg-section__title">
              {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 문서의 문단 순서
              <Block key={index} block={block} />
            ))}
            {section.contact ? <Contact url={contact} /> : null}
          </section>
        ))}

        <p className="lg-other">
          <Link
            className="wh-text-action lg-other__link"
            to={other === "terms" ? "/terms" : "/privacy"}
          >
            {other === "terms" ? TERMS_DOC.title : PRIVACY_DOC.title} 보기
            <Icon name="chevron-right" />
          </Link>
        </p>
      </div>
    </Screen>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") return <p className="lg-p">{block}</p>;
  if ("list" in block) {
    return (
      <ul className="lg-list">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="lg-rows">
      {block.rows.map((row) => (
        <div key={row.term} className="lg-row">
          <dt>{row.term}</dt>
          <dd>{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function Contact({ url }: { url: string | undefined }) {
  if (!url) {
    return <p className="lg-p lg-contact--none">문의 창구는 정식 서비스 전에 이 자리에 적어요.</p>;
  }
  return (
    <a className="wh-text-action lg-contact" href={url} target="_blank" rel="noopener noreferrer">
      <Icon name="message-circle" />
      월계함 팀에 문의하기
      <Icon name="external-link" className="lg-contact__ext" />
    </a>
  );
}

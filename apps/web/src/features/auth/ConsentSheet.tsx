import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import "./consent.css";

// 로그인 전 동의 항목의 ‘보기’(lofi 16). 요약만 보여주고, 전문(초안, D-28)은 `/terms`·`/privacy` 페이지로
// 엽니다(시트가 화면의 90%를 넘으면 페이지로, interaction.md §4). 요약은 전문(content/terms)과 같은 사실만 적습니다.

export type ConsentDoc = "terms" | "privacy";

export const CONSENT_DOCS: Readonly<
  Record<ConsentDoc, { label: string; title: string; lead: string; items: readonly string[] }>
> = {
  terms: {
    label: "서비스 이용약관",
    title: "서비스 이용약관",
    lead: "파일럿 동안 아래 범위로 운영해요. 전문은 법률 검토 전 초안이에요.",
    items: [
      "월계함은 건물의 안내와 공지를 전하는 서비스예요.",
      "가입코드와 카카오 로그인은 거주를 증명하는 절차가 아니에요.",
      "연결은 내 정보에서 언제든 끝낼 수 있어요. 연결하지 않아도 안내는 볼 수 있어요.",
      "생활 팁과 수정 메모는 다른 거주자에게 작성자가 보이지 않아요. 특정인을 짐작할 수 있는 내용은 쓰지 말아 주세요.",
    ],
  },
  privacy: {
    label: "개인정보 수집·이용",
    title: "개인정보 수집·이용",
    lead: "로그인하면 아래 정보를 저장해요. 자세한 내용은 전문(법률 검토 전 초안)에 적었어요.",
    items: [
      "카카오에는 회원번호만 요청해요. 로그인한 분을 알아보는 데만 써요.",
      "이름·전화번호·프로필 사진은 저장하지 않아요.",
      "연결한 건물과 연결 상태를 저장하고, 알림을 켜면 이 브라우저로 알림을 보낼 주소도 저장해요.",
      "남긴 팁·메모·알린 내용의 작성자는 서버 안에만 두고 다른 거주자에게 보이지 않아요.",
      "회원번호와 연결 기록은 계정이 있는 동안 남고, 계정 삭제를 요청하면 지워요. 로그인은 마지막으로 쓴 뒤 30일(길어도 90일)이 지나면 끝나요.",
      "동의하지 않을 수 있어요. 그러면 로그인과 연결은 할 수 없지만, 건물 안내·공지 보기와 집주인에게 알리기는 로그인 없이 할 수 있어요.",
    ],
  },
};

export const CONSENT_DOC_PATH: Readonly<Record<ConsentDoc, string>> = {
  terms: "/terms",
  privacy: "/privacy",
};

/** 요약 본문. 시트 제목은 부르는 쪽이 정합니다(시트면 BottomSheet.Title). */
export function ConsentDocSummary({
  doc,
  renderTitle,
  actions,
}: {
  doc: ConsentDoc;
  renderTitle: (text: string) => ReactNode;
  actions: ReactNode;
}) {
  const content = CONSENT_DOCS[doc];
  return (
    <>
      {renderTitle(content.title)}
      <p className="wh-sheet__lead">{content.lead}</p>
      <ul className="au-doc__list">
        {content.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="wh-sheet__actions">{actions}</div>
    </>
  );
}

/** 16의 ‘보기’ 시트. 닫히는 동안에도 내용이 남도록 `doc`은 마지막으로 연 문서를 그대로 둡니다. */
export function ConsentSheet({
  doc,
  open,
  onClose,
}: {
  doc: ConsentDoc;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="au-doc" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              <div className="au-doc__body">
                <ConsentDocSummary
                  doc={doc}
                  renderTitle={(text) => (
                    <BottomSheet.Title className="wh-sheet__title">{text}</BottomSheet.Title>
                  )}
                  actions={
                    <>
                      <ActionButton
                        asChild
                        className="wh-btn wh-btn--secondary"
                        size="large"
                        variant="neutralWeak"
                      >
                        <Link to={CONSENT_DOC_PATH[doc]}>전문 보기</Link>
                      </ActionButton>
                      <ActionButton className="wh-btn" size="large" onClick={onClose}>
                        닫기
                      </ActionButton>
                    </>
                  }
                />
              </div>
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}

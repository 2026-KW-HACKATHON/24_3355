// LF-10 집주인에게 알리기 입구 시트. 자주 쓰는 말 목록이 화면에 없는 곳(거주자 홈 03, 크게 보기 28, 안내 없음 14)에서
// ‘집주인에게 알리기’를 누르면 열립니다. 자주 쓰는 말을 고르면 보내기 전 확인(20)으로, 직접 적기는 05로 갑니다.
import { BottomSheet, Portal } from "@seed-design/react";
import { REPORT_PRESETS, type ReportPreset } from "@wolgyeham/contracts";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { REPORT_PRESET_COPY } from "./labels";
import { ReportConfirmSheet } from "./ReportConfirmSheet";
import "./reports.css";

export function ReportChooser({
  open,
  onOpenChange,
  buildingId,
  buildingName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  buildingName: string;
}) {
  const [preset, setPreset] = useState<ReportPreset | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 이 시트를 연 버튼. 자주 쓰는 말을 고르면 이 시트가 닫히고 확인(20)이 열리므로, 20이 닫힌 뒤 여기로
  // 포커스를 돌려줍니다(시트가 포커스를 옮기기 전에 기억, 리뷰 L1).
  const trigger = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      trigger.current = document.activeElement;
    }
  }, [open]);

  function pick(next: ReportPreset) {
    setPreset(next);
    onOpenChange(false);
    setConfirmOpen(true);
  }

  return (
    <>
      <BottomSheet.Root open={open} onOpenChange={onOpenChange}>
        <Portal>
          <BottomSheet.Positioner>
            <BottomSheet.Backdrop />
            <BottomSheet.Content className="rp-sheet" aria-describedby={undefined}>
              <BottomSheet.Handle />
              <BottomSheet.Body>
                <div className="rp-sheet__body">
                  <BottomSheet.Title className="rp-sheet__title">
                    집주인에게 알리기
                  </BottomSheet.Title>
                  <p className="wh-small rp-sheet__lead">
                    집주인만 봐요 · 게시판에 올라가지 않아요
                  </p>
                  <ul className="rp-choose">
                    {REPORT_PRESETS.map((key) => (
                      <li key={key}>
                        <button type="button" className="rp-choose__row" onClick={() => pick(key)}>
                          <span className="rp-choose__em">
                            <Icon name={REPORT_PRESET_COPY[key].icon} />
                          </span>
                          <span className="rp-choose__text">{REPORT_PRESET_COPY[key].text}</span>
                          <Icon name="chevron-right" className="rp-choose__chev" />
                        </button>
                      </li>
                    ))}
                    <li>
                      <Link className="rp-choose__row" to={`/b/${buildingId}/report`}>
                        <span className="rp-choose__em rp-choose__em--write">
                          <Icon name="pencil-line" />
                        </span>
                        <span className="rp-choose__text">직접 적기</span>
                        <Icon name="chevron-right" className="rp-choose__chev" />
                      </Link>
                    </li>
                  </ul>
                </div>
              </BottomSheet.Body>
            </BottomSheet.Content>
          </BottomSheet.Positioner>
        </Portal>
      </BottomSheet.Root>
      <ReportConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        buildingId={buildingId}
        buildingName={buildingName}
        draft={preset ? { source: "preset", preset } : null}
        returnFocus={trigger}
      />
    </>
  );
}

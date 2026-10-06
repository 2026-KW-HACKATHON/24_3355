// LF-01 재방문 · lofi 30 ‘내가 보낸 내용’ 배너. 이 브라우저에 보관한 확인 권한(비회원)과 로그인한 계정으로 보낸
// 제보가 있을 때만 보입니다. 공개 QR 주소만으로 보낸 사람을 찾지 않습니다(screens.md §7). 함이는 넣지 않습니다.
import { BottomSheet, Portal } from "@seed-design/react";
import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { formatDay } from "../../lib/format";
import { REPORT_KIND_LABEL, reportDateLine, reportStatusLine, reportTitle } from "./labels";
import { useMyReportsForBuilding } from "./queries";
import { ReportListItem } from "./ReportParts";
import "./reports.css";

/**
 * `reserveForAccount`: 로그인한 계정의 보낸 내용을 모르는 동안에도 자리를 잡습니다. 결과가 없으면 자리가
 * 사라지므로, 부르는 화면이 그 높이를 대신 채울 때만 켭니다(기본 공개 화면 30, public-building).
 */
export function MyReportsBanner({
  buildingId,
  reserveForAccount = false,
}: {
  buildingId: string;
  reserveForAccount?: boolean;
}) {
  const { items, expected, reserve } = useMyReportsForBuilding(buildingId);
  const [open, setOpen] = useState(false);
  const latest = items[0];
  if (!latest) {
    // 조회하는 동안에는 같은 크기의 빈 자리를 잡아 둡니다(아래 내용이 밀리지 않게).
    return (reserveForAccount ? reserve : expected) ? (
      <div className="rp-mine rp-mine--reserved" aria-hidden="true">
        <span className="rp-mine__ic" />
        <span className="rp-mine__text">
          <span className="rp-mine__title">내가 보낸 내용</span>
          <span className="rp-mine__sub">불러오는 중</span>
        </span>
      </div>
    ) : null;
  }

  const face = (
    <>
      <span className="rp-mine__ic">
        <Icon name="mail-check" />
      </span>
      <span className="rp-mine__text">
        <span className="rp-mine__title">내가 보낸 내용 {items.length}건</span>
        <span className="rp-mine__sub">{reportStatusLine(latest.report, formatDay)}</span>
      </span>
      <Icon name="chevron-right" className="rp-mine__chev" />
    </>
  );

  if (items.length === 1) {
    return (
      <Link className="rp-mine" to={latest.path}>
        {face}
      </Link>
    );
  }

  return (
    <>
      <button type="button" className="rp-mine" onClick={() => setOpen(true)}>
        {face}
      </button>
      <BottomSheet.Root open={open} onOpenChange={setOpen}>
        <Portal>
          <BottomSheet.Positioner>
            <BottomSheet.Backdrop />
            <BottomSheet.Content className="rp-sheet" aria-describedby={undefined}>
              <BottomSheet.Handle />
              <BottomSheet.Body>
                <div className="rp-sheet__body">
                  <BottomSheet.Title className="rp-sheet__title">내가 보낸 내용</BottomSheet.Title>
                  <p className="wh-small rp-sheet__lead">이 건물 집주인에게 보낸 내용이에요.</p>
                  <ul className="rp-mine-list">
                    {items.map(({ report, path }) => (
                      <ReportListItem
                        key={report.id}
                        to={path}
                        category={REPORT_KIND_LABEL[report.kind]}
                        status={report.status}
                        body={reportTitle(report)}
                        date={reportDateLine(report, formatDay)}
                      />
                    ))}
                  </ul>
                </div>
              </BottomSheet.Body>
            </BottomSheet.Content>
          </BottomSheet.Positioner>
        </Portal>
      </BottomSheet.Root>
    </>
  );
}

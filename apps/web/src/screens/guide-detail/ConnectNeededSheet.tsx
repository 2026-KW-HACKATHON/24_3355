// LF-02 메모 남기기 · 연결이 필요할 때(44). 연결을 마치면 이 안내로 돌아와 메모 시트를 엽니다.
// 쓴 내용은 없고(시트 12를 열기 전), 돌아와서도 자동으로 보내지 않습니다.
import { ActionButton, BottomSheet, Portal } from "@seed-design/react";
import { Link, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { memoWritePath } from "../../features/guides/memoDraft";
import { connectPath } from "../../features/occupancy/connectDraft";

export function ConnectNeededSheet({
  open,
  onOpenChange,
  buildingId,
  guideId,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  guideId: string;
  label: string;
}) {
  const navigate = useNavigate();
  return (
    <BottomSheet.Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <BottomSheet.Positioner>
          <BottomSheet.Backdrop />
          <BottomSheet.Content className="gm-sheet" aria-describedby={undefined}>
            <BottomSheet.Handle />
            <BottomSheet.Body>
              <div className="gm-body gm-body--connect">
                <span className="gm-mark">
                  <Icon name="key-round" />
                </span>
                <BottomSheet.Title className="gm-title gm-title--connect">
                  안내 수정 메모는 이 건물에 연결한 거주자가 남길 수 있어요
                </BottomSheet.Title>
                <p className="wh-small gm-lead gm-lead--connect">
                  연결을 마치면 이 ‘{label}’ 안내로 돌아와 이어서 쓸 수 있어요.
                </p>
                <ul className="gm-info">
                  <li>
                    <Icon name="ticket" />
                    가입코드는 집주인이나 부동산에서 받아요
                  </li>
                  <li>
                    <Icon name="mail" />
                    <span>
                      이 건물에 살지 않는다면{" "}
                      <Link className="gm-info__link" to={`/b/${buildingId}/report`}>
                        ‘집주인에게 알리기’
                      </Link>
                      로 전할 수 있어요
                    </span>
                  </li>
                </ul>
                <div className="wh-btn-row gm-connect-actions">
                  <ActionButton
                    className="wh-btn wh-btn--neutral"
                    size="large"
                    variant="neutralWeak"
                    onClick={() => onOpenChange(false)}
                  >
                    안내 계속 보기
                  </ActionButton>
                  <ActionButton
                    className="wh-btn wh-grow"
                    size="large"
                    onClick={() =>
                      void navigate(connectPath(buildingId, memoWritePath(buildingId, guideId)))
                    }
                  >
                    우리 건물로 연결하기
                  </ActionButton>
                </div>
              </div>
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </Portal>
    </BottomSheet.Root>
  );
}

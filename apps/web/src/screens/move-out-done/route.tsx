// LF-09 연결 종료 · lofi 09. 이사 확인(08)을 마친 뒤. 멤버 기능은 끝나고 공개 화면은 그대로입니다.
import { ActionButton } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import type { Me } from "@wolgyeham/contracts";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { Dock, Screen } from "../../components/Screen";
import { authKeys, useMe } from "../../features/auth/queries";
import { usePublicGuides } from "../../features/buildings/queries";
import { memoKeys } from "../../features/guides/memos";
import { type MovedState, readMovedState } from "../../features/occupancy/moved";
import { tipKeys, useMyTips } from "../../features/tips/queries";
import { withWa } from "../../lib/format";
import "./move-out-done.css";

export function Component() {
  const { state } = useLocation();
  const moved = readMovedState(state);
  // 주소로 바로 열었으면 보여줄 연결이 없습니다. 내 정보로 돌아갑니다.
  if (!moved) return <Navigate replace to="/me" />;
  return <MoveOutDone moved={moved} />;
}

function MoveOutDone({ moved }: { moved: MovedState }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const guides = usePublicGuides(moved.buildingId);
  const me = useMe();
  const myTips = useMyTips(me.data?.user.id);

  // 이 화면이 열린 뒤에 내 정보에서 연결을 지웁니다(앞 화면이 ‘연결 없음’으로 번쩍이지 않게).
  // 거주자에게만 보이던 메모 목록도 비웁니다.
  useEffect(() => {
    queryClient.setQueryData<Me | null>(authKeys.me(), (old) =>
      old?.occupancy?.buildingId === moved.buildingId ? { ...old, occupancy: null } : old,
    );
    queryClient.removeQueries({ queryKey: memoKeys.all() });
    // 팁은 이제 읽을 수 없고(목록 403), 내가 남긴 팁은 고칠 수 없는 상태(editable false)가 됩니다.
    void queryClient.invalidateQueries({ queryKey: tipKeys.all() });
    void queryClient.invalidateQueries({ queryKey: authKeys.me() });
  }, [moved.buildingId, queryClient]);

  const guideCount = guides.isSuccess ? ` ${guides.data.length}개` : "";
  // 건물 전체의 팁·메모 수는 이제 볼 수 없어서, 알 수 있는 ‘내가 남긴 팁’ 수만 덧붙입니다.
  // 운영팀이 가린 팁은 건물에 보이지 않으므로 세지 않습니다(리뷰 L10).
  const myTipCount =
    myTips.data?.filter((tip) => tip.buildingId === moved.buildingId && !tip.hidden).length ?? 0;
  return (
    <Screen
      dock={
        <Dock>
          <ActionButton
            className="wh-btn"
            size="large"
            onClick={() => void navigate(`/b/${moved.buildingId}`, { replace: true })}
          >
            건물 화면으로
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad">
        <div className="mo-hero">
          <Hami pose="moving" size={172} eager />
          <h1 className="wh-h-title mo-hero__title" tabIndex={-1}>
            {withWa(moved.buildingName)}의 연결을 마쳤어요
          </h1>
          <p className="wh-body mo-hero__lead">
            {moved.buildingName}의 안내와 팁은
            <br />
            다음 사람에게 남아 있어요.
          </p>
        </div>

        <h2 className="wh-field-label mo-kept-label">{moved.buildingName}에 남아 있는 정보</h2>
        <ul className="mo-kept">
          <li className="mo-kept__row">
            <span className="mo-kept__ic">
              <Icon name="book-open" />
            </span>
            <span className="mo-kept__text">
              <span className="mo-kept__title">기본 안내{guideCount}</span>
              <span className="mo-kept__sub">다음 입주자도 같은 QR로 읽어요</span>
            </span>
          </li>
          <li className="mo-kept__row">
            <span className="mo-kept__ic">
              <Icon name="sticky-note" />
            </span>
            <span className="mo-kept__text">
              <span className="mo-kept__title">생활 팁과 수정 메모</span>
              <span className="mo-kept__sub">
                {myTipCount > 0
                  ? `내가 남긴 팁 ${myTipCount}개도 작성자 없이 건물에 남아요`
                  : "작성자 없이 건물에 남아요"}
              </span>
            </span>
          </li>
        </ul>
        <p className="wh-caption mo-note">
          다시 이 건물에 살게 되면 가입코드로 새로 연결할 수 있어요.
        </p>
      </div>
    </Screen>
  );
}

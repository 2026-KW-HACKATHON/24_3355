import type { ConnectResult } from "@wolgyeham/contracts";
import { type AppError, errorMessage } from "../../lib/errors";

// 연결 요청(LF-04)의 결과를 화면 문구로 바꿉니다. 결과를 모를 때(시간 초과·연결 끊김)는
// 연결됐다고도, 그대로라고도 단정하지 않습니다.

/** 연결 뒤 돌아간 화면에 띄울 토스트. 새로 연결했으면 환영·알림 선택이 대신하므로 없습니다. */
export function connectedToast(
  result: Pick<ConnectResult, "alreadyConnected" | "reconfirmed">,
  buildingName: string,
): string | undefined {
  // 재확인 요청 중에 가입코드를 다시 맞히면 ‘아직 살아요’와 같습니다(D-17).
  if (result.reconfirmed) return "거주를 확인했어요";
  if (result.alreadyConnected) return `이미 ${buildingName}에 연결돼 있어요`;
  return undefined;
}

export type ConnectFailure = {
  message: string;
  /** 내 정보를 새로 받아 화면을 다시 고를지(로그인 만료·연결 변경·결과 모름). */
  refetchMe: boolean;
  /** 서버에서 연결이 됐는지 모름. */
  uncertain: boolean;
};

/** `replacing`: 다른 건물 연결을 옮기는 요청이었는지. */
export function connectFailureCopy(error: AppError, replacing: boolean): ConnectFailure {
  switch (error.code) {
    case "ALREADY_CONNECTED":
      return {
        message: "이미 다른 건물에 연결돼 있어요. 옮길지 확인해 주세요",
        refetchMe: true,
        uncertain: false,
      };
    case "UNAUTHENTICATED":
      return {
        message: "로그인이 끝났어요. 다시 로그인한 뒤 연결해 주세요",
        refetchMe: true,
        uncertain: false,
      };
    case "NETWORK":
    case "INTERNAL_ERROR":
      return {
        message: replacing
          ? "옮겨졌는지 확인하지 못했어요. 이 화면이 그대로면 다시 눌러 주세요"
          : "연결됐는지 확인하지 못했어요. 이 화면이 그대로면 다시 눌러 주세요",
        refetchMe: true,
        uncertain: true,
      };
    default: {
      // 서버가 거절한 요청이라 지금 연결은 바뀌지 않았습니다.
      const kept = replacing ? ". 지금 연결은 그대로예요" : "";
      return {
        message: `${errorMessage(error)}${kept}`,
        refetchMe: error.code === "CONFLICT" || error.code === "NOT_FOUND",
        uncertain: false,
      };
    }
  }
}

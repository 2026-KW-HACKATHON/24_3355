import { Snackbar, useSnackbarAdapter } from "@seed-design/react";
import { useCallback } from "react";
import { Hami } from "../../components/Hami";
import "./tips.css";

/**
 * 팁을 남긴 뒤의 토스트(lofi 04). hami-mini(40px)를 장식 이미지로 넣습니다(interaction.md §8).
 * 토스트 영역은 앱 전체에 하나라, 작성 화면에서 띄우고 목록으로 돌아가도 이어서 보입니다.
 */
export function useTipSavedToast() {
  const snackbar = useSnackbarAdapter();
  return useCallback(
    (message: string) =>
      snackbar.create({
        timeout: 3000,
        render: () => (
          <Snackbar.Root variant="positive">
            <Snackbar.Content className="tp-toast">
              <Hami pose="hami-mini" size={40} className="tp-toast__hami" eager />
              <Snackbar.Message>{message}</Snackbar.Message>
            </Snackbar.Content>
          </Snackbar.Root>
        ),
      }),
    [snackbar],
  );
}

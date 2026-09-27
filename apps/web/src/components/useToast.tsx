import { Snackbar, useSnackbarAdapter } from "@seed-design/react";
import { useCallback } from "react";

/** 막히지 않는 결과(공개함·링크 복사)만 토스트로 알립니다. 오류는 화면에 남깁니다(interaction.md §6). */
export function useToast() {
  const snackbar = useSnackbarAdapter();
  return useCallback(
    (message: string) =>
      snackbar.create({
        timeout: 3000,
        render: () => (
          <Snackbar.Root variant="positive">
            <Snackbar.Content>
              <Snackbar.Message>{message}</Snackbar.Message>
            </Snackbar.Content>
          </Snackbar.Root>
        ),
      }),
    [snackbar],
  );
}

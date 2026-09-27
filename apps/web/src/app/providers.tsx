import { Snackbar } from "@seed-design/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isRetryable } from "../lib/errors";

// 재시도는 여기 한 곳에서만 합니다. 연결 문제·서버 오류만 두 번까지, 4xx(없음·권한)는 바로 화면 상태로.
// 쓰기 요청은 자동으로 다시 보내지 않습니다(frontend.md §2).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Snackbar.RootProvider>
        {children}
        <Snackbar.Region>
          <Snackbar.Renderer />
        </Snackbar.Region>
      </Snackbar.RootProvider>
    </QueryClientProvider>
  );
}

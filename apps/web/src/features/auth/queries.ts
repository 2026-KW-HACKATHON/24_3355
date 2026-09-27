import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { demoLogin, fetchDemoLoginAvailable, fetchMe } from "./session";

export const authKeys = {
  me: () => ["me"] as const,
  demo: () => ["dev", "login"] as const,
};

export function useMe() {
  return useQuery({ queryKey: authKeys.me(), queryFn: fetchMe });
}

/** 시연용 로그인 버튼은 서버가 그 경로를 열어 둔 환경에서만 보입니다. */
export function useDemoLoginAvailable() {
  return useQuery({
    queryKey: authKeys.demo(),
    queryFn: fetchDemoLoginAvailable,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => demoLogin({ as: "demo-landlord" }),
    onSuccess: (me) => {
      queryClient.setQueryData(authKeys.me(), me);
      void queryClient.invalidateQueries({ queryKey: ["manage"] });
    },
  });
}

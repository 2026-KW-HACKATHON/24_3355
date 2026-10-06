import { LOGIN_RESULT_PARAM, ReturnTo } from "@wolgyeham/contracts";

/** 로그인 뒤 돌아올 경로. contracts ReturnTo와 같은 규칙(`/`로 시작, `//`·`\`·`#` 없음)만 넘깁니다. */
export function safeReturnTo(path: string): string {
  const withoutLoginResult = stripLoginResult(path);
  return ReturnTo.safeParse(withoutLoginResult).success ? withoutLoginResult : "/";
}

function stripLoginResult(path: string): string {
  const [pathname = "/", query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete(LOGIN_RESULT_PARAM);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

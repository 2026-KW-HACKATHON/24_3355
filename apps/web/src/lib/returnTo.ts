import { LOGIN_RESULT_PARAM, ReturnTo } from "@wolgyeham/contracts";

/** 로그인 뒤 돌아올 경로. contracts ReturnTo와 같은 규칙(`/`로 시작, `//`·`\`·`#` 없음)만 넘깁니다. */
export function safeReturnTo(path: string): string {
  const withoutLoginResult = stripLoginResult(path);
  return ReturnTo.safeParse(withoutLoginResult).success ? withoutLoginResult : "/";
}

/**
 * `?login=` 결과만 뺍니다. 나머지 쿼리는 받은 그대로 둡니다(URLSearchParams로 다시 만들면 `/`가 `%2F`가 되어
 * `ReturnTo`에 걸리고 첫 화면으로 돌아감).
 */
function stripLoginResult(path: string): string {
  const index = path.indexOf("?");
  if (index < 0) return path;
  const pathname = path.slice(0, index) || "/";
  const rest = path
    .slice(index + 1)
    .split("&")
    .filter((part) => part !== "" && part.split("=")[0] !== LOGIN_RESULT_PARAM)
    .join("&");
  return rest ? `${pathname}?${rest}` : pathname;
}

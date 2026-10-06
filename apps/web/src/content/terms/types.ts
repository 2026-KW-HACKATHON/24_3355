// 약관·개인정보 처리방침 초안(D-28)의 모양. 마크다운 해석기 없이 문단·목록·항목만 그립니다(screens/legal).

/** 문단(문자열), 점 목록, 또는 이름과 설명이 짝인 항목 목록. */
export type LegalBlock =
  | string
  | { readonly list: readonly string[] }
  | { readonly rows: readonly { readonly term: string; readonly detail: string }[] };

export interface LegalSection {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
  /** 이 절 끝에 월계함 팀 연락처(`VITE_TEAM_CONTACT_URL`)를 붙입니다. */
  readonly contact?: boolean;
}

export interface LegalDoc {
  readonly title: string;
  readonly lead: string;
  readonly sections: readonly LegalSection[];
}

import { ActionButton } from "@seed-design/react";
import { useState } from "react";
import { checkApi } from "../lib/api";

type Connection = "idle" | "checking" | "connected" | "failed";
const messages: Readonly<Record<Connection, string>> = {
  idle: "버튼을 눌러 API 연결을 확인할 수 있어요.",
  checking: "API 응답을 확인하고 있어요.",
  connected: "API가 응답했어요. 데이터베이스와 로그인 연결은 별도 작업이에요.",
  failed: "API 응답을 확인하지 못했어요. API 서버를 실행한 뒤 다시 눌러 주세요.",
};

export function App() {
  const [connection, setConnection] = useState<Connection>("idle");
  async function connect() {
    setConnection("checking");
    try {
      await checkApi();
      setConnection("connected");
    } catch (error) {
      if (error instanceof Error) setConnection("failed");
      else throw error;
    }
  }
  return (
    <main className="workspace-shell">
      <p className="eyebrow">월계함 · 팀 개발 환경</p>
      <h1>
        함께 만들 준비를
        <br />
        마쳤어요
      </h1>
      <p className="intro">
        안내는 건물에 남고,
        <br />
        소식은 지금 사는 사람에게 닿아요.
      </p>
      <section className="connection-panel" aria-labelledby="connection-title">
        <h2 id="connection-title">프론트엔드와 API 연결</h2>
        <p role="status" aria-live="polite">
          {messages[connection]}
        </p>
        <ActionButton
          className="primary-action"
          onClick={connect}
          disabled={connection === "checking"}
        >
          {connection === "checking" ? "확인 중" : "API 연결 확인하기"}
        </ActionButton>
      </section>
      <p className="note">
        개발 설정 확인 화면이에요. 주민용 서비스와 가입 기능은 아직 구현 전이에요.
      </p>
    </main>
  );
}

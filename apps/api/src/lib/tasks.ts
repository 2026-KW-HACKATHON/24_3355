import { log } from "./log.ts";

/**
 * 응답을 보낸 뒤 이어서 할 일(공지 푸시 발송 등). createApp이 요청마다 `c.var.tasks`로 넣습니다.
 * 할 일이 실패해도 프로세스를 멈추지 않고 로그(`background_task_failed`, 이름만)만 남깁니다. 테스트와 서버 종료는
 * `idle()`로 남은 일을 기다립니다.
 */
export type TaskRunner = {
  run(name: string, job: () => Promise<void>): void;
  idle(): Promise<void>;
};

export function createTaskRunner(): TaskRunner {
  const pending = new Set<Promise<void>>();
  return {
    run(name, job) {
      const task: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve))
        .then(job)
        .catch((error: unknown) => {
          log("error", "background_task_failed", {
            task: name,
            name: error instanceof Error ? error.name : "unknown",
          });
        })
        .finally(() => {
          pending.delete(task);
        });
      pending.add(task);
    },
    async idle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

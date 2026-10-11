import { useEffect } from "react";
import { useToast } from "../../components/useToast";
import { DEMO_ENDED_TOAST } from "./demoRole";
import { onDemoEnded } from "./endDemo";

/** 앱 틀(`RootLayout`)에 하나 둡니다. 실제 건물에서 시연을 끝내면(D-35) 토스트를 한 번 띄웁니다. */
export function DemoEndedToast() {
  const toast = useToast();
  useEffect(() => onDemoEnded(() => toast(DEMO_ENDED_TOAST)), [toast]);
  return null;
}

import { useCallback, useEffect, useRef, useState } from "react";

// 읽어주기: Web Speech API speechSynthesis, ko-KR. 사용자가 누른 이벤트 안에서 시작합니다(iOS).
export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

function koreanVoice(): SpeechSynthesisVoice | undefined {
  return window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("ko"));
}

export function useSpeech() {
  const [supported] = useState(canSpeak);
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (!canSpeak()) return;
    current.current = null;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    const voice = koreanVoice();
    if (voice) utterance.voice = voice;
    const finish = () => {
      if (current.current === utterance) {
        current.current = null;
        setSpeaking(false);
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    current.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, []);

  // 화면을 떠나면 멈춥니다.
  useEffect(
    () => () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, speaking, speak, stop };
}

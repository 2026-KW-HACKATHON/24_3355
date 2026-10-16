import { useCallback, useEffect, useRef, useState } from "react";

// 읽어주기: Web Speech API speechSynthesis. 기본은 ko-KR이고, 기계 번역을 보고 있으면 그 언어로 읽습니다(D-37).
// 사용자가 누른 이벤트 안에서 시작합니다(iOS).
export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/** `lang`(예: zh-CN)과 같은 음성, 없으면 앞 언어(zh)가 같은 음성. 없으면 브라우저가 고릅니다. */
function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const wanted = lang.toLowerCase();
  const base = wanted.split("-")[0] ?? wanted;
  return (
    voices.find((voice) => voice.lang.toLowerCase().replace("_", "-") === wanted) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(base))
  );
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

  const speak = useCallback((text: string, lang = "ko-KR") => {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = voiceFor(lang);
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

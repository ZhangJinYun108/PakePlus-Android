/* ============================================================
   语音转文字 · Web Speech API（浏览器免费能力）
   打包成 APK 后可替换为原生 ASR / 讯飞，接口保持一致
   ============================================================ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const isSupported = () => !!SR;

export function createRecognizer({ onPartial, onFinal, onError } = {}) {
  if (!SR) return null;

  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = '';

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    onPartial?.(finalText + interim);
  };

  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onFinal?.(finalText.trim());

  return {
    start() { finalText = ''; try { rec.start(); } catch {} },
    stop()  { try { rec.stop(); } catch {} },
    abort() { try { rec.abort(); } catch {} },
  };
}

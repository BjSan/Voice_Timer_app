import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Web Speech API wrapper for German voice commands.
 * Parses commands like:
 *   "Firma ORCA, Projekt Vertrieb, Arbeitszeit beginnt jetzt"
 *   "Arbeit 30 Minuten an Projekt Vertrieb"
 *   "Stopp" / "Stop"
 */
export function parseVoiceCommand(text, clients, projects) {
  const lc = text.toLowerCase().trim();
  const result = { raw: text, intent: null, client: null, project: null, minutes: null };

  if (/\b(stopp?|beende|anhalten|ende)\b/.test(lc)) {
    result.intent = "stop";
    return result;
  }

  const clientMatch = clients.find((c) => lc.includes(c.name.toLowerCase()));
  if (clientMatch) result.client = clientMatch;

  let projectCandidates = projects;
  if (clientMatch) projectCandidates = projects.filter((p) => p.client_id === clientMatch.id);
  const projectMatch = projectCandidates.find((p) => lc.includes(p.name.toLowerCase()));
  if (projectMatch) result.project = projectMatch;

  const mins = lc.match(/(\d+)\s*(minuten|minute|min)\b/);
  const hrs = lc.match(/(\d+(?:[.,]\d+)?)\s*(stunden|stunde|std|h)\b/);
  if (mins) result.minutes = parseInt(mins[1], 10);
  else if (hrs) result.minutes = Math.round(parseFloat(hrs[1].replace(",", ".")) * 60);

  if (result.minutes != null) result.intent = "log";
  else if (/beginnt|starten?|starte|los|jetzt/.test(lc)) result.intent = "start";
  else if (result.project) result.intent = "start";

  return result;
}

export function useVoiceCommand({ onResult, lang = "de-DE" } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef(null);
  const onResultRef = useRef(onResult);
  const retryRef = useRef(0);
  const userStoppedRef = useRef(false);
  const finalResultRef = useRef(false);

  // Keep latest callback without re-creating the recognizer
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      finalResultRef.current = true;
      retryRef.current = 0;
      const transcript = e.results[0][0].transcript;
      if (onResultRef.current) onResultRef.current(transcript);
    };

    r.onend = () => {
      // If we got no result and no user stop and not too many retries -> retry
      if (!finalResultRef.current && !userStoppedRef.current && retryRef.current < 2) {
        retryRef.current += 1;
        try { r.start(); return; } catch { /* fall through to stop */ }
      }
      setListening(false);
      finalResultRef.current = false;
      retryRef.current = 0;
      userStoppedRef.current = false;
    };

    r.onerror = (ev) => {
      const code = ev?.error || "unknown";

      // Auto-retry transient errors silently up to 2 times
      if ((code === "network" || code === "no-speech" || code === "aborted") && retryRef.current < 2 && !userStoppedRef.current) {
        retryRef.current += 1;
        // recognition will fire onend afterwards which will call start() again
        return;
      }

      setListening(false);
      finalResultRef.current = false;
      retryRef.current = 0;

      if (code === "not-allowed" || code === "service-not-allowed") {
        toast.error("Mikrofon blockiert. Bitte Berechtigung im Browser erlauben.", { duration: 6000 });
      } else if (code === "no-speech") {
        toast.info("Nichts gehört — versuch es noch mal.");
      } else if (code === "network") {
        toast.error("Spracherkennung nicht erreichbar. Prüfe deine Internet­verbindung oder versuch es in einer Minute nochmal.", { duration: 7000 });
      } else if (code === "audio-capture") {
        toast.error("Kein Mikrofon gefunden.");
      } else if (code === "aborted") {
        // silent
      } else {
        toast.error(`Spracherkennung: ${code}`);
      }
    };

    recRef.current = r;
    return () => { try { r.abort(); } catch {} };
  }, [lang]);

  const start = useCallback(async () => {
    if (!recRef.current) return;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      toast.error("Mikrofon-Zugriff verweigert. Bitte im Browser erlauben.", { duration: 7000 });
      return;
    }
    if (!navigator.onLine) {
      toast.error("Keine Internet­verbindung. Spracherkennung benötigt Online-Zugriff.");
      return;
    }
    finalResultRef.current = false;
    retryRef.current = 0;
    userStoppedRef.current = false;
    try { recRef.current.start(); setListening(true); }
    catch { setListening(false); }
  }, []);

  const stop = useCallback(() => {
    if (!recRef.current) return;
    userStoppedRef.current = true;
    try { recRef.current.stop(); } catch {}
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

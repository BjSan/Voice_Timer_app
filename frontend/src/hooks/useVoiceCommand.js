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

  // find client
  const clientMatch = clients.find((c) => lc.includes(c.name.toLowerCase()));
  if (clientMatch) result.client = clientMatch;

  // find project
  let projectCandidates = projects;
  if (clientMatch) projectCandidates = projects.filter((p) => p.client_id === clientMatch.id);
  const projectMatch = projectCandidates.find((p) => lc.includes(p.name.toLowerCase()));
  if (projectMatch) result.project = projectMatch;

  // find duration
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
      const transcript = e.results[0][0].transcript;
      if (onResult) onResult(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = (ev) => {
      setListening(false);
      const code = ev?.error || "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast.error("Mikrofon blockiert. Bitte Berechtigung erteilen oder in neuem Tab öffnen.", { duration: 6000 });
      } else if (code === "no-speech") {
        toast.info("Nichts gehört — versuch es noch mal.");
      } else if (code === "network") {
        toast.error("Netzwerk-Fehler bei der Spracherkennung.");
      } else if (code === "audio-capture") {
        toast.error("Kein Mikrofon gefunden.");
      } else {
        toast.error(`Spracherkennung: ${code}`);
      }
    };
    recRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, [lang, onResult]);

  const start = useCallback(async () => {
    if (!recRef.current) return;
    // Explicitly request mic permission first (helps in iframe contexts)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      toast.error("Mikrofon-Zugriff verweigert. Öffne die App in einem neuen Tab und erlaube Mikrofon.", { duration: 7000 });
      return;
    }
    try { recRef.current.start(); setListening(true); } catch (e) {
      // Chrome throws if called while already started
      setListening(false);
    }
  }, []);
  const stop = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch {}
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

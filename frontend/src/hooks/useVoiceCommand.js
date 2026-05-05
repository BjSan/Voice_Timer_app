import { useCallback, useEffect, useRef, useState } from "react";

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
    r.onerror = () => setListening(false);
    recRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, [lang, onResult]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.start(); setListening(true); } catch {}
  }, []);
  const stop = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch {}
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

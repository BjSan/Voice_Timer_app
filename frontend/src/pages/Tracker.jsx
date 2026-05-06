import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api, formatApiError, formatDuration, formatHours } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Play, Mic, Plus, Pencil, Trash2, MicOff, Square } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { parseVoiceCommand, useVoiceCommand } from "../hooks/useVoiceCommand";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s) { return new Date(s).toISOString(); }

export default function Tracker() {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [recentEntries, setRecentEntries] = useState([]);
  const [active, setActive] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [description, setDescription] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [voiceHint, setVoiceHint] = useState("");
  const [periodMode, setPeriodMode] = useState("last5"); // last5 | 7d | 30d | 365d
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    try {
      // Load last 365 days of entries (for period filters + quickStarts)
      const rStart = new Date(); rStart.setDate(rStart.getDate() - 365);
      const [c, p, a, r] = await Promise.all([
        api.get("/clients"),
        api.get("/projects"),
        api.get("/time-entries/active"),
        api.get("/time-entries", { params: { start: rStart.toISOString() } }),
      ]);
      setClients(c.data); setProjects(p.data); setActive(a.data); setRecentEntries(r.data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("chrono:refresh", h);
    return () => window.removeEventListener("chrono:refresh", h);
  }, [load]);

  const start = async () => {
    if (!selectedProject) { toast.error("Bitte Projekt wählen"); return; }
    try {
      await api.post("/time-entries/start", { project_id: selectedProject, description });
      toast.success("Timer gestartet");
      setDescription("");
      window.dispatchEvent(new CustomEvent("chrono:refresh"));
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const stop = async () => {
    try {
      await api.post("/time-entries/stop");
      toast.success("Timer gestoppt");
      window.dispatchEvent(new CustomEvent("chrono:refresh"));
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const handleVoice = useCallback((transcript) => {
    setVoiceHint(`„${transcript}"`);
    const cmd = parseVoiceCommand(transcript, clients, projects);
    if (cmd.intent === "stop") {
      api.post("/time-entries/stop").then(() => {
        toast.success("Timer gestoppt per Sprachbefehl");
        window.dispatchEvent(new CustomEvent("chrono:refresh"));
      }).catch((e) => toast.error(formatApiError(e)));
      return;
    }
    if (!cmd.project) {
      toast.error(`Projekt nicht erkannt: „${transcript}"`);
      return;
    }
    if (cmd.intent === "log" && cmd.minutes) {
      const end = new Date();
      const st = new Date(end.getTime() - cmd.minutes * 60 * 1000);
      api.post("/time-entries", {
        project_id: cmd.project.id,
        description: transcript,
        start_time: st.toISOString(),
        end_time: end.toISOString(),
      }).then(() => {
        toast.success(`${cmd.minutes} Min für ${cmd.project.name} eingetragen`);
        load();
      }).catch((e) => toast.error(formatApiError(e)));
      return;
    }
    // default: start
    api.post("/time-entries/start", { project_id: cmd.project.id, description: transcript })
      .then(() => {
        toast.success(`Timer gestartet: ${cmd.project.name}`);
        window.dispatchEvent(new CustomEvent("chrono:refresh"));
        load();
      }).catch((e) => toast.error(formatApiError(e)));
  }, [clients, projects, load]);

  const { listening, supported, start: startVoice, stop: stopVoice } = useVoiceCommand({ onResult: handleVoice });

  const delEntry = async (id) => {
    try {
      await api.delete(`/time-entries/${id}`);
      toast.success("Eintrag gelöscht");
      setDeleteId(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const totalSecToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return recentEntries
      .filter((e) => e.end_time && e.start_time.slice(0, 10) === today)
      .reduce((a, b) => a + (b.duration_seconds || 0), 0);
  }, [recentEntries]);

  // Filtered entries for the "Letzte Einträge" section
  const filteredEntries = useMemo(() => {
    const completed = recentEntries.filter((e) => e.end_time);
    if (periodMode === "last5") {
      return completed.slice(0, 5);
    }
    const days = periodMode === "7d" ? 7 : periodMode === "30d" ? 30 : 365;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();
    return completed.filter((e) => e.start_time >= cutoffISO);
  }, [recentEntries, periodMode]);

  const projById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const cliById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  // Last 4 unique (project_id + description) combos, most-recent first
  const quickStarts = useMemo(() => {
    const seen = new Map();
    const sorted = [...recentEntries].sort((a, b) => (a.start_time < b.start_time ? 1 : -1));
    for (const e of sorted) {
      const key = `${e.project_id}::${(e.description || "").trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, { project_id: e.project_id, description: (e.description || "").trim() });
      }
      if (seen.size >= 4) break;
    }
    return Array.from(seen.values());
  }, [recentEntries]);

  const quickToggle = async (qs) => {
    // If currently running same project + description -> stop
    const sameRunning = active && active.project_id === qs.project_id &&
      ((active.description || "").trim() === qs.description);
    try {
      if (sameRunning) {
        await api.post("/time-entries/stop");
        toast.success("Timer gestoppt");
      } else {
        await api.post("/time-entries/start", {
          project_id: qs.project_id,
          description: qs.description,
        });
        toast.success("Timer gestartet");
      }
      window.dispatchEvent(new CustomEvent("chrono:refresh"));
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const isRunning = (qs) =>
    !!active && active.project_id === qs.project_id &&
    ((active.description || "").trim() === qs.description);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 fade-up">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Zeiterfassung</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight mt-1">Timer</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Heute</div>
            <div className="font-mono font-bold text-2xl timer-digits" data-testid="today-total">{formatDuration(totalSecToday)}</div>
          </div>
        </div>
      </header>

      {/* Start panel */}
      <div className="border border-border rounded-md bg-card">
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-end">
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold">Projekt</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="mt-1.5 h-11" data-testid="select-project">
                  <SelectValue placeholder="Projekt wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Erst Kunde & Projekt anlegen</div>
                  )}
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`project-option-${p.name}`}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground"> — {cliById[p.client_id]?.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold">Beschreibung (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 h-11" placeholder="Was hast du gemacht?" data-testid="description-input" />
            </div>
            <Button
              onClick={start}
              disabled={!selectedProject}
              className="h-11 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
              data-testid="start-timer-button"
              title={active ? "Wechselt zum neuen Projekt (stoppt den laufenden Timer automatisch)" : "Timer starten"}
            >
              <Play className="w-4 h-4 fill-current" /> {active ? "Wechseln" : "Start"}
            </Button>
            <Button
              onClick={stop}
              disabled={!active}
              variant="outline"
              className="h-11 px-5 gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground disabled:border-border disabled:text-muted-foreground"
              data-testid="stop-timer-main-button"
              title={active ? "Aktiven Timer stoppen" : "Kein Timer läuft"}
            >
              <Square className="w-4 h-4 fill-current" /> Stop
            </Button>
            <Button
              onClick={listening ? stopVoice : startVoice}
              disabled={!supported}
              variant="outline"
              className={`h-11 px-4 gap-2 ${listening ? "voice-listening border-primary text-primary" : ""}`}
              data-testid="voice-command-button"
              title={supported ? "Sprachbefehl" : "Spracherkennung nicht verfügbar"}
            >
              {listening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {listening ? "Hört zu…" : "Sprache"}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">Sprachbefehle:</span>
            <span>„Firma <strong className="text-foreground">Orca</strong>, Projekt <strong className="text-foreground">Vertrieb</strong>, Start"</span>
            <span>„<strong className="text-foreground">30 Minuten</strong> an Vertrieb"</span>
            <span>„<strong className="text-foreground">Stopp</strong>"</span>
          </div>
          {voiceHint && <div className="mt-2 text-xs font-mono text-primary">{voiceHint}</div>}
        </div>
      </div>

      {/* Quick-start buttons (last 4 unique project+description combos) */}
      {quickStarts.length > 0 && (
        <section data-testid="quick-starts">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-heading text-lg font-bold tracking-tight">Schnellstart</h2>
            <span className="text-xs text-muted-foreground">Klick = Start / Stop</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickStarts.map((qs, i) => {
              const proj = projById[qs.project_id];
              const cli = proj ? cliById[proj.client_id] : null;
              if (!proj) return null;
              const running = isRunning(qs);
              return (
                <button
                  key={i}
                  onClick={() => quickToggle(qs)}
                  className={`group text-left border rounded-md p-4 transition-all hover:-translate-y-0.5 ${
                    running
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-foreground/30"
                  }`}
                  data-testid={`quick-start-${i}`}
                  title={running ? "Aktiv — klicken zum Stoppen" : "Klicken zum Starten"}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: proj.color }} />
                      <span className="font-semibold text-sm truncate">{proj.name}</span>
                    </div>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      running ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                    }`}>
                      {running
                        ? <Square className="w-3 h-3 fill-current" />
                        : <Play className="w-3 h-3 fill-current ml-0.5" />}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{cli?.name || "—"}</div>
                  {qs.description && (
                    <div className="text-xs text-foreground/80 mt-1 line-clamp-2 leading-snug">{qs.description}</div>
                  )}
                  {running && (
                    <div className="mt-2 text-xs font-mono text-primary uppercase tracking-wider font-semibold">● Läuft</div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent entries */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-heading text-2xl font-bold tracking-tight">Letzte Einträge</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5 bg-card" data-testid="period-filter">
              {[
                { id: "last5", label: "Letzte 5" },
                { id: "7d", label: "7 Tage" },
                { id: "30d", label: "30 Tage" },
                { id: "365d", label: "Jahr" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodMode(p.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    periodMode === p.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`period-${p.id}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Dialog open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) setEditEntry(null); }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditEntry(null)} data-testid="add-manual-entry-button">
                  <Plus className="w-4 h-4" /> Manuell
                </Button>
              </DialogTrigger>
              <ManualEntryDialog
                key={editEntry?.id || "new"}
                projects={projects}
                clients={clients}
                entry={editEntry}
                onClose={() => { setManualOpen(false); setEditEntry(null); }}
                onSaved={() => { setManualOpen(false); setEditEntry(null); load(); }}
              />
            </Dialog>
          </div>
        </div>

        <div className="border border-border rounded-md bg-card overflow-hidden" data-testid="entries-list">
          {filteredEntries.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">Keine Einträge im gewählten Zeitraum.</div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: filteredEntries.length > 8 ? "480px" : "auto" }}>
              {filteredEntries.map((e) => {
                const proj = projById[e.project_id];
                const cli = cliById[e.client_id];
                const dt = new Date(e.start_time);
                return (
                  <div
                    key={e.id}
                    onClick={() => { setEditEntry(e); setManualOpen(true); }}
                    className="flex items-center gap-4 px-4 md:px-6 py-3 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors group cursor-pointer"
                    data-testid={`entry-${e.id}`}
                  >
                    <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: proj?.color || "#71717A" }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{proj?.name || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {cli?.name}{e.description && <span> · {e.description}</span>}
                      </div>
                    </div>
                    <div className="hidden md:block font-mono text-xs text-muted-foreground text-right whitespace-nowrap">
                      <div>{dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}</div>
                      <div>
                        {dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {new Date(e.end_time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-sm timer-digits whitespace-nowrap">
                      {formatDuration(e.duration_seconds)}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setEditEntry(e); setManualOpen(true); }}
                        className="w-8 h-8 rounded-md hover:bg-secondary flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                        data-testid={`edit-entry-${e.id}`}
                        title="Bearbeiten"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id); }}
                        className="w-8 h-8 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
                        data-testid={`delete-entry-${e.id}`}
                        title="Löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {filteredEntries.length > 8 && (
          <div className="mt-2 text-xs text-muted-foreground text-center font-mono">
            {filteredEntries.length} Einträge · scrollen für mehr
          </div>
        )}
      </section>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Schritt kann nicht rückgängig gemacht werden. Die erfasste Zeit geht dauerhaft verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && delEntry(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="delete-confirm"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManualEntryDialog({ projects, clients, entry, onClose, onSaved }) {
  const [projectId, setProjectId] = useState(entry?.project_id || "");
  const [description, setDescription] = useState(entry?.description || "");
  const [start, setStart] = useState(entry ? toLocalInput(entry.start_time) : toLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(entry?.end_time ? toLocalInput(entry.end_time) : toLocalInput(new Date().toISOString()));
  const cliById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const save = async () => {
    if (!projectId) { toast.error("Projekt wählen"); return; }
    try {
      const payload = { project_id: projectId, description, start_time: fromLocalInput(start), end_time: fromLocalInput(end) };
      if (entry) await api.put(`/time-entries/${entry.id}`, payload);
      else await api.post("/time-entries", payload);
      toast.success(entry ? "Aktualisiert" : "Hinzugefügt");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <DialogContent data-testid="manual-entry-dialog">
      <DialogHeader><DialogTitle>{entry ? "Eintrag bearbeiten" : "Manueller Eintrag"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Projekt</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="mt-1.5" data-testid="manual-project-select"><SelectValue placeholder="Projekt wählen…" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} — {cliById[p.client_id]?.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Start</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" data-testid="manual-start-input" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Ende</Label>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" data-testid="manual-end-input" />
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Beschreibung</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5" data-testid="manual-description-input" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button onClick={save} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="save-manual-entry">Speichern</Button>
      </DialogFooter>
    </DialogContent>
  );
}

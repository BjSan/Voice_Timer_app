import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#FF3B30", "#0EA5E9", "#22C55E", "#F59E0B", "#A855F7", "#18181B", "#EC4899"];

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api.get("/projects"), api.get("/clients")]);
      setProjects(p.data); setClients(c.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const cliById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const del = async (id) => {
    if (!window.confirm("Projekt und zugehörige Einträge löschen?")) return;
    try { await api.delete(`/projects/${id}`); toast.success("Gelöscht"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 fade-up">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Verwaltung</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight mt-1">Projekte</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEdit(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEdit(null)} disabled={clients.length === 0} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2" data-testid="new-project-button">
              <Plus className="w-4 h-4" /> Neues Projekt
            </Button>
          </DialogTrigger>
          <ProjectDialog key={edit?.id || "new"} project={edit} clients={clients} onClose={() => { setOpen(false); setEdit(null); }} onSaved={() => { setOpen(false); setEdit(null); load(); }} />
        </Dialog>
      </header>

      {clients.length === 0 && (
        <div className="border border-border rounded-md p-6 bg-secondary/30 text-sm">
          Bitte zuerst einen <strong>Kunden</strong> anlegen.
        </div>
      )}

      <div className="border border-border rounded-md overflow-hidden" data-testid="projects-list">
        <div className="grid grid-cols-[auto_2fr_1fr_auto_auto] gap-4 px-6 py-3 border-b border-border bg-secondary/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div></div><div>Projekt</div><div>Kunde</div><div className="text-right">Satz</div><div></div>
        </div>
        {projects.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">Noch keine Projekte.</div>}
        {projects.map((p) => {
          const cli = cliById[p.client_id];
          const rate = p.hourly_rate ?? cli?.hourly_rate ?? 0;
          return (
            <div key={p.id} className="grid grid-cols-[auto_2fr_1fr_auto_auto] gap-4 px-6 py-4 border-b border-border last:border-b-0 items-center hover:bg-secondary/30 transition-colors group" data-testid={`project-row-${p.name}`}>
              <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-muted-foreground">{cli?.name || "—"}</div>
              <div className="font-mono text-sm text-right">{rate.toFixed(2)} €/h</div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEdit(p); setOpen(true); }} className="w-8 h-8 rounded-md hover:bg-secondary flex items-center justify-center" data-testid={`edit-project-${p.name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => del(p.id)} className="w-8 h-8 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center" data-testid={`delete-project-${p.name}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectDialog({ project, clients, onClose, onSaved }) {
  const [name, setName] = useState(project?.name || "");
  const [clientId, setClientId] = useState(project?.client_id || clients[0]?.id || "");
  const [rate, setRate] = useState(project?.hourly_rate ?? "");
  const [color, setColor] = useState(project?.color || COLORS[1]);

  const save = async () => {
    if (!name.trim() || !clientId) { toast.error("Name & Kunde erforderlich"); return; }
    try {
      const payload = {
        name: name.trim(), client_id: clientId, color,
        hourly_rate: rate === "" ? null : Number(rate),
      };
      if (project) await api.put(`/projects/${project.id}`, payload);
      else await api.post("/projects", payload);
      toast.success(project ? "Aktualisiert" : "Projekt angelegt");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <DialogContent data-testid="project-dialog">
      <DialogHeader><DialogTitle>{project ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="mt-1.5" placeholder="Vertrieb, Website, …" data-testid="project-name-input" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Kunde</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="mt-1.5" data-testid="project-client-select"><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Stundensatz (€) — optional, überschreibt Kunde</Label>
          <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1.5" placeholder="leer lassen für Kunden-Satz" data-testid="project-rate-input" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Farbe</Label>
          <div className="mt-1.5 flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button onClick={save} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="save-project-button">Speichern</Button>
      </DialogFooter>
    </DialogContent>
  );
}

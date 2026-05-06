import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#FF3B30", "#0EA5E9", "#22C55E", "#F59E0B", "#A855F7", "#18181B", "#EC4899"];

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    try { const { data } = await api.get("/clients"); setClients(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Kunde und zugehörige Projekte wirklich löschen?")) return;
    try { await api.delete(`/clients/${id}`); toast.success("Gelöscht"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 fade-up">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Verwaltung</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight mt-1">Kunden</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEdit(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEdit(null)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2" data-testid="new-client-button">
              <Plus className="w-4 h-4" /> Neuer Kunde
            </Button>
          </DialogTrigger>
          <ClientDialog key={edit?.id || "new"} client={edit} onClose={() => { setOpen(false); setEdit(null); }} onSaved={() => { setOpen(false); setEdit(null); load(); }} />
        </Dialog>
      </header>

      <div className="border border-border rounded-md overflow-hidden" data-testid="clients-list">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-3 border-b border-border bg-secondary/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div></div><div>Name</div><div className="text-right">Stundensatz</div><div></div>
        </div>
        {clients.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">Noch keine Kunden. Leg deinen ersten an.</div>}
        {clients.map((c) => (
          <div key={c.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-4 border-b border-border last:border-b-0 items-center hover:bg-secondary/30 transition-colors group" data-testid={`client-row-${c.name}`}>
            <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
            <div className="font-semibold">{c.name}</div>
            <div className="font-mono text-sm text-right">{(c.hourly_rate || 0).toFixed(2)} €/h</div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEdit(c); setOpen(true); }} className="w-8 h-8 rounded-md hover:bg-secondary flex items-center justify-center" data-testid={`edit-client-${c.name}`}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => del(c.id)} className="w-8 h-8 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center" data-testid={`delete-client-${c.name}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientDialog({ client, onClose, onSaved }) {
  const [name, setName] = useState(client?.name || "");
  const [rate, setRate] = useState(client?.hourly_rate ?? 80);
  const [color, setColor] = useState(client?.color || COLORS[0]);

  const save = async () => {
    if (!name.trim()) { toast.error("Name erforderlich"); return; }
    try {
      const payload = { name: name.trim(), hourly_rate: Number(rate) || 0, color };
      if (client) await api.put(`/clients/${client.id}`, payload);
      else await api.post("/clients", payload);
      toast.success(client ? "Aktualisiert" : "Kunde angelegt");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <DialogContent data-testid="client-dialog">
      <DialogHeader><DialogTitle>{client ? "Kunde bearbeiten" : "Neuer Kunde"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="mt-1.5" placeholder="Firma XYZ" data-testid="client-name-input" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold">Stundensatz Kunde (€)</Label>
          <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1.5" data-testid="client-rate-input" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Wird verwendet, wenn das Projekt keinen eigenen Satz hat. Es gilt immer der <strong>höhere</strong> der beiden Sätze.
          </p>
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
        <Button onClick={save} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="save-client-button">Speichern</Button>
      </DialogFooter>
    </DialogContent>
  );
}

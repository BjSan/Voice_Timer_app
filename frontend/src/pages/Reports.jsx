import React, { useEffect, useState } from "react";
import { api, BACKEND_URL, formatApiError } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Download } from "lucide-react";
import { toast } from "sonner";

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function Reports() {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [start, setStart] = useState(daysAgo(29));
  const [end, setEnd] = useState(daysAgo(0));
  const [clientId, setClientId] = useState("all");
  const [projectId, setProjectId] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([api.get("/clients"), api.get("/projects")]);
        setClients(c.data); setProjects(p.data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, []);

  const filteredProjects = projects.filter((p) => clientId === "all" || p.client_id === clientId);

  const download = async () => {
    try {
      const params = new URLSearchParams({ start: `${start}T00:00:00`, end: `${end}T23:59:59` });
      if (clientId !== "all") params.set("client_id", clientId);
      if (projectId !== "all") params.set("project_id", projectId);
      const token = localStorage.getItem("auth_token");
      const resp = await fetch(`${BACKEND_URL}/api/export/csv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Export fehlgeschlagen");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `zeiterfassung_${start}_${end}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("CSV heruntergeladen");
    } catch (e) { toast.error(e.message || "Fehler"); }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 fade-up">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Export</p>
        <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight mt-1">Berichte</h1>
        <p className="text-muted-foreground mt-3 max-w-lg">
          Exportiere deine Zeiteinträge als CSV für Rechnungsstellung & Buchhaltung. Semikolon-separiert, kompatibel mit Excel (DE).
        </p>
      </header>

      <div className="border border-border rounded-md bg-card p-6 md:p-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Von</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" data-testid="report-start-date" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Bis</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" data-testid="report-end-date" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Kunde</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId("all"); }}>
              <SelectTrigger className="mt-1.5" data-testid="report-client-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kunden</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Projekt</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="mt-1.5" data-testid="report-project-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Projekte</SelectItem>
                {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={download} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-semibold" data-testid="download-csv-button">
          <Download className="w-4 h-4" /> CSV herunterladen
        </Button>
      </div>
    </div>
  );
}

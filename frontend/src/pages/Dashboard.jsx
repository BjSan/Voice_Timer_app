import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatApiError, formatHours } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [start, setStart] = useState(daysAgo(29));
  const [end, setEnd] = useState(daysAgo(0));

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/summary", {
        params: { start: `${start}T00:00:00`, end: `${end}T23:59:59` },
      });
      setSummary(data);
    } catch (e) { toast.error(formatApiError(e)); }
  }, [start, end]);
  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    if (!summary) return null;
    return {
      totalH: (summary.total_seconds / 3600).toFixed(2),
      totalAmount: summary.total_amount.toFixed(2),
      entries: summary.entries_count,
      avgHoursPerDay: summary.daily.length ? ((summary.total_seconds / 3600) / summary.daily.length).toFixed(2) : "0.00",
    };
  }, [summary]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 fade-up">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Abrechnung</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight mt-1">Dashboard</h1>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Von</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5 h-10 w-40" data-testid="dashboard-start-date" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Bis</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5 h-10 w-40" data-testid="dashboard-end-date" />
          </div>
        </div>
      </header>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="kpi-cards">
          <KPI label="Gesamtzeit" value={`${kpis.totalH} h`} accent />
          <KPI label="Abrechnungsbetrag" value={`${kpis.totalAmount} €`} accent />
          <KPI label="Einträge" value={kpis.entries} />
          <KPI label="Ø Stunden/Tag" value={`${kpis.avgHoursPerDay} h`} />
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 border border-border rounded-md bg-card p-6" data-testid="daily-chart">
            <h3 className="font-heading text-lg font-bold mb-4">Tägliche Stunden</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={summary.daily.map((d) => ({ date: d.date.slice(5), hours: +(d.seconds / 3600).toFixed(2) }))}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="border border-border rounded-md bg-card p-6" data-testid="client-pie">
            <h3 className="font-heading text-lg font-bold mb-4">Nach Kunde</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={summary.by_client.map((c) => ({ name: c.client_name, value: +(c.seconds / 3600).toFixed(2), color: c.color }))}
                    dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                    {summary.by_client.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-border rounded-md overflow-hidden" data-testid="by-client-table">
            <div className="px-6 py-3 border-b border-border bg-secondary/30">
              <h3 className="font-heading text-lg font-bold">Kunden</h3>
            </div>
            {summary.by_client.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Keine Daten</div>}
            {summary.by_client.map((c) => (
              <div key={c.client_id} className="flex items-center gap-3 px-6 py-3 border-b border-border last:border-b-0">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <div className="flex-1 font-semibold">{c.client_name}</div>
                <div className="font-mono text-sm text-muted-foreground">{(c.seconds / 3600).toFixed(2)} h</div>
                <div className="font-mono text-sm font-bold w-24 text-right">{c.amount.toFixed(2)} €</div>
              </div>
            ))}
          </div>
          <div className="border border-border rounded-md overflow-hidden" data-testid="by-project-table">
            <div className="px-6 py-3 border-b border-border bg-secondary/30">
              <h3 className="font-heading text-lg font-bold">Projekte</h3>
            </div>
            {summary.by_project.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Keine Daten</div>}
            {summary.by_project.map((p) => (
              <div key={p.project_id} className="flex items-center gap-3 px-6 py-3 border-b border-border last:border-b-0">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{p.project_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.client_name}</div>
                </div>
                <div className="font-mono text-sm text-muted-foreground">{(p.seconds / 3600).toFixed(2)} h</div>
                <div className="font-mono text-sm font-bold w-24 text-right">{p.amount.toFixed(2)} €</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, accent }) {
  return (
    <div className="border border-border rounded-md bg-card p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className={`mt-2 font-heading text-3xl font-black tracking-tight timer-digits ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

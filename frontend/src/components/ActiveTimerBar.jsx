import React, { useEffect, useState } from "react";
import { api, formatDuration } from "../lib/api";
import { Square, Circle } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

export default function ActiveTimerBar() {
  const [active, setActive] = useState(null);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [elapsed, setElapsed] = useState(0);

  const refresh = async () => {
    try {
      const [a, p, c] = await Promise.all([
        api.get("/time-entries/active"),
        api.get("/projects"),
        api.get("/clients"),
      ]);
      setActive(a.data);
      setProjects(p.data);
      setClients(c.data);
    } catch {}
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    const handler = () => refresh();
    window.addEventListener("chrono:refresh", handler);
    return () => { clearInterval(id); window.removeEventListener("chrono:refresh", handler); };
  }, []);

  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const update = () => {
      const st = new Date(active.start_time).getTime();
      setElapsed(Math.floor((Date.now() - st) / 1000));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [active]);

  const stop = async () => {
    try {
      await api.post("/time-entries/stop");
      setActive(null);
      toast.success("Timer gestoppt");
      window.dispatchEvent(new CustomEvent("chrono:refresh"));
    } catch (e) {
      toast.error("Konnte Timer nicht stoppen");
    }
  };

  if (!active) return null;
  const proj = projects.find((p) => p.id === active.project_id);
  const cli = clients.find((c) => c.id === active.client_id);

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-56 z-20 border-t border-border bg-background" data-testid="active-timer-bar">
      <div className="px-4 md:px-8 py-3 flex items-center gap-3">
        <Circle className="w-3 h-3 fill-primary text-primary animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-lg truncate" data-testid="active-project-name">{proj?.name || "—"}</span>
            <span className="text-xs text-muted-foreground truncate">{cli?.name}</span>
          </div>
          {active.description && <div className="text-xs text-muted-foreground truncate">{active.description}</div>}
        </div>
        <div className="font-mono text-xl md:text-2xl font-bold timer-digits text-primary" data-testid="active-timer-elapsed">
          {formatDuration(elapsed)}
        </div>
        <Button
          onClick={stop}
          variant="outline"
          size="sm"
          className="gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          data-testid="stop-timer-button"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Stop
        </Button>
      </div>
    </div>
  );
}

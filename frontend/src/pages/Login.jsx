import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Timer, Moon, Sun } from "lucide-react";

export default function Login() {
  const { user, login, error } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await login(email, password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left: art panel */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden border-r border-border">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <Timer className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-heading font-black text-2xl tracking-tight">CHRONO</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">Zeit ist Geld.</p>
            <h1 className="font-heading text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
              Erfasse deine Zeit.<br />
              <span className="text-primary">Ohne Reibung.</span>
            </h1>
            <p className="mt-6 text-muted-foreground max-w-md">
              Start / Stop per Klick oder Sprachbefehl. Automatische Abrechnung nach
              Stundensatz. Export als CSV für deine Rechnung.
            </p>
          </div>
          <div className="flex gap-6 font-mono text-xs text-muted-foreground">
            <div><span className="text-foreground font-semibold">01</span> Kunden</div>
            <div><span className="text-foreground font-semibold">02</span> Projekte</div>
            <div><span className="text-foreground font-semibold">03</span> Timer</div>
            <div><span className="text-foreground font-semibold">04</span> Abrechnung</div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <button
          onClick={toggle}
          className="absolute top-6 right-6 w-10 h-10 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors"
          data-testid="theme-toggle-login"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <form onSubmit={submit} className="w-full max-w-sm fade-up" data-testid="login-form">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <Timer className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-heading font-black text-2xl">CHRONO</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">Willkommen zurück</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mb-8">Anmelden</h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs uppercase tracking-wider font-semibold">E-Mail</Label>
              <Input
                id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoFocus className="mt-1.5 h-11" placeholder="du@firma.de"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="pw" className="text-xs uppercase tracking-wider font-semibold">Passwort</Label>
              <Input
                id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required className="mt-1.5 h-11" placeholder="••••••••"
                data-testid="login-password-input"
              />
            </div>
            {error && <div className="text-sm text-destructive font-medium" data-testid="login-error">{error}</div>}
            <Button type="submit" disabled={loading} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" data-testid="login-submit-button">
              {loading ? "Anmelden…" : "Anmelden →"}
            </Button>
          </div>

          <div className="mt-6 text-sm text-muted-foreground">
            Noch kein Konto?{" "}
            <Link to="/register" className="text-foreground font-semibold hover:text-primary transition-colors" data-testid="goto-register-link">
              Registrieren
            </Link>
          </div>

          <div className="mt-8 p-3 rounded-md border border-border bg-secondary/30">
            <p className="text-xs font-mono text-muted-foreground">
              Demo: <span className="text-foreground">admin@timetrack.app</span> / admin123
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

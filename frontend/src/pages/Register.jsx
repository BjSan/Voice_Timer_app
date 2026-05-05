import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Timer, Moon, Sun } from "lucide-react";

export default function Register() {
  const { user, register, error } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await register(email, password, name);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      <button
        onClick={toggle}
        className="absolute top-6 right-6 w-10 h-10 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors"
        data-testid="theme-toggle-register"
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <form onSubmit={submit} className="w-full max-w-sm relative z-10 fade-up" data-testid="register-form">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
            <Timer className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-black text-2xl">CHRONO</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">Neu hier?</p>
        <h2 className="font-heading text-3xl sm:text-4xl font-black tracking-tight mb-8">Konto erstellen</h2>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" placeholder="Max Mustermann" data-testid="register-name-input" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">E-Mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5 h-11" placeholder="du@firma.de" data-testid="register-email-input" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold">Passwort</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1.5 h-11" placeholder="Mind. 6 Zeichen" data-testid="register-password-input" />
          </div>
          {error && <div className="text-sm text-destructive font-medium" data-testid="register-error">{error}</div>}
          <Button type="submit" disabled={loading} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" data-testid="register-submit-button">
            {loading ? "Erstellen…" : "Konto erstellen →"}
          </Button>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          Bereits registriert?{" "}
          <Link to="/login" className="text-foreground font-semibold hover:text-primary transition-colors" data-testid="goto-login-link">Anmelden</Link>
        </div>
      </form>
    </div>
  );
}

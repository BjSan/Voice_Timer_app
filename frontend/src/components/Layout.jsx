import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Timer, BarChart3, Users, Folder, FileText, LogOut, Moon, Sun, Menu, X } from "lucide-react";
import ActiveTimerBar from "./ActiveTimerBar";

const nav = [
  { to: "/", label: "Timer", icon: Timer, end: true },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/clients", label: "Kunden", icon: Users },
  { to: "/projects", label: "Projekte", icon: Folder },
  { to: "/reports", label: "Berichte", icon: FileText },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav_ = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => { await logout(); nav_("/login"); };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-56 border-r border-border sticky top-0 h-screen" data-testid="sidebar">
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Timer className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-heading font-black text-xl tracking-tight">CHRONO</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`
              }
              data-testid={`nav-${n.label.toLowerCase()}`}
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-border space-y-1">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
          </button>
          <div className="px-3 py-2">
            <div className="text-xs font-mono text-muted-foreground truncate" data-testid="user-email">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" /> Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 border-b border-border bg-background flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Timer className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-black text-lg">CHRONO</span>
        </div>
        <button onClick={() => setOpen(!open)} className="w-10 h-10 flex items-center justify-center rounded-md border border-border" data-testid="mobile-menu-toggle">
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 top-14 z-20 bg-background border-t border-border p-4 space-y-1 fade-up">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium ${
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
                }`
              }
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          ))}
          <div className="border-t border-border pt-3 mt-3 space-y-1">
            <button onClick={() => { toggle(); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm text-muted-foreground">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Heller Modus" : "Dunkler Modus"}
            </button>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm text-destructive">
              <LogOut className="w-4 h-4" /> Abmelden
            </button>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-24">
        <Outlet />
      </main>

      {/* Active timer sticky bar */}
      <ActiveTimerBar />
    </div>
  );
}

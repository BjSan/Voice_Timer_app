# CHRONO - Zeit-Tracking-App (PRD)

## Original Problem Statement
Freelancer-Zeiterfassung, mobil + desktop, Kunden/Projekte anlegen, niederschwellig, Start/Stop Timer,
Spracherkennung ("Firma Orca, Projekt Vertrieb, Arbeitszeit beginnt jetzt!"), Dashboard als
Abrechnungsgrundlage mit Stundensätzen, Orientierung an Toggl.

## User Choices (from first ask_human)
- Spracherkennung: Web Speech API (browser-native, de-DE)
- Auth: JWT Email/Passwort
- Dashboard: Zeit je Kunde/Projekt + Stundensatz + Gesamtbetrag + CSV-Export
- Design: Modern + Dark/Light Mode Toggle
- Features: Start/Stop Timer + manuelle Einträge + Tagesansicht

## Architecture
- Backend: FastAPI + Motor (MongoDB) + PyJWT + bcrypt
- Frontend: React 19, Shadcn UI, Tailwind, Recharts, Sonner, Lucide icons
- Auth: Bearer JWT in localStorage (cookie path exists but unused cross-origin)

## Data Model
- users: id, email, password_hash, name, created_at
- clients: id, user_id, name, hourly_rate, color, created_at
- projects: id, user_id, client_id, name, hourly_rate?, color, created_at
- time_entries: id, user_id, project_id, client_id, description, start_time, end_time?, duration_seconds

## Implemented (2026-02)
- Email/Passwort Auth (Register/Login/Logout/Me) mit JWT Bearer
- Seeded Admin: admin@timetrack.app / admin123
- Kunden CRUD inkl. Stundensatz, Farbe; Cascade-Delete
- Projekte CRUD mit Client-Zuordnung, optionalem Stundensatz, Farbe
- Start/Stop Timer (ein aktiver Timer pro User); sticky ActiveTimerBar mit Live-Update
- Manueller Zeiteintrag (Dialog), Bearbeiten + Löschen
- Tagesansicht mit Datumspicker + Timeline
- Sprachbefehle (de-DE, Web Speech API): Start/Stop/Dauer eintragen
- Dashboard: KPIs (Gesamtzeit, Betrag, Einträge, Ø h/Tag), Tagesbalken, Kunden-Pie, Aufschlüsselung je Kunde/Projekt
- CSV-Export (Excel-DE kompatibel, ; Delimiter) mit Filter: Zeitraum, Kunde, Projekt
- Dark/Light Mode Toggle (persistent in localStorage)
- Mobile Nav (Hamburger) + Desktop Sidebar

## Test Credentials
Siehe `/app/memory/test_credentials.md`

## Backlog (P1 / P2)
- P1: Wochenansicht / Kalender-Gitter
- P1: Rechnung als PDF (mit Firmenlogo/Kopfzeile)
- P1: Favoriten-Projekte fürs 1-Tap Starten vom Mobile-Homescreen
- P2: Pomodoro / Idle-Detection
- P2: Teams & Mehrbenutzer mit geteilten Kunden
- P2: Stripe-Rechnungsintegration / Toggl-Datenimport
- P2: Tagesziel + Streak (Gamification)

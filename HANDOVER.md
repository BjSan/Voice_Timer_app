# CHRONO — Voice Timer App
## Vollständiger Übergabe- und Rebuild-Plan

> **Zielgruppe dieses Dokuments:** Eine externe KI (z.B. Claude Code, Cursor, GitHub Copilot Workspace) oder ein Entwickler, der die App von Grund auf eigenständig nachbauen soll. Das Dokument ist so geschrieben, dass es als alleinige Spezifikation reicht — kein Zugriff auf den Original-Code nötig.

---

## 1. EXECUTIVE SUMMARY

**CHRONO** ist eine minimalistische Zeit-Tracking-App im Stil von Toggl, speziell für Freelancer, die für mehrere Kunden parallel an verschiedenen Projekten arbeiten.

### Kern-Wertversprechen
1. **Niederschwellige Zeiterfassung** auf Mobile + Desktop
2. **Spracherkennung in Deutsch** zum Start/Stop via Voice-Command
3. **Automatische Abrechnungsbasis** mit Stundensätzen pro Kunde/Projekt
4. **CSV-Export** für die Rechnungslegung
5. **Schnellstart-Buttons** für die letzten 4 unique Projekt+Tätigkeits-Kombinationen

### Primärer Use-Case
Freelancer sagt: *„Firma Orca, Projekt Vertrieb, Arbeitszeit beginnt jetzt!"* → Timer startet automatisch.

---

## 2. TECH STACK (verbindlich)

| Layer | Technologie | Version |
|---|---|---|
| Backend | **FastAPI** (Python) | 0.110+ |
| ASGI Server | Uvicorn | latest |
| Database | **MongoDB** (via Motor async driver) | 6.0+ |
| Auth | **PyJWT** + **bcrypt** | latest |
| Frontend | **React** | 19.x |
| Build Tool | **Create React App** mit **CRACO** | – |
| UI Library | **Shadcn/UI** + **Tailwind CSS** | latest |
| Charts | **Recharts** | latest |
| Icons | **lucide-react** | latest |
| HTTP Client | **axios** | latest |
| Toasts | **sonner** | latest |
| Routing | **react-router-dom v6** | latest |
| Voice | **Web Speech API** (browser-native, `de-DE`) | – |
| Package Manager | **yarn** (NICHT npm) | – |

### Wichtige Gestaltungsregeln
- **Keine Authentifizierung über Cookies** für Cross-Origin-Setups → JWT als Bearer Token in `localStorage`
- Alle Backend-Routen müssen das Präfix **`/api`** haben (für Kubernetes-Ingress)
- Frontend nutzt ausschließlich `process.env.REACT_APP_BACKEND_URL`
- Backend nutzt ausschließlich `os.environ.get('MONGO_URL')` und `DB_NAME`

---

## 3. ARCHITEKTUR

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│  ┌──────────────┐                                          │
│  │ Web Speech   │──de-DE──► STT (Google Cloud, in Chrome)   │
│  │     API      │                                          │
│  └──────────────┘                                          │
│         │                                                  │
│  ┌──────▼─────────────────────────────────────────────┐   │
│  │  React SPA (Shadcn + Tailwind)                     │   │
│  │  ┌────────┬───────────┬────────┬──────────┬────┐  │   │
│  │  │ Login  │ Tracker   │ Clients│ Projects │ …  │  │   │
│  │  └────────┴───────────┴────────┴──────────┴────┘  │   │
│  │  Auth: JWT in localStorage["auth_token"]           │   │
│  └────────────────┬──────────────────────────────────┘   │
└───────────────────┼──────────────────────────────────────┘
                    │  REST  /api/...
                    │  Authorization: Bearer <jwt>
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI (uvicorn, port 8001)               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Routes (alle mit /api Prefix)                      │    │
│  │  - /auth/register, /login, /logout, /me             │    │
│  │  - /clients (CRUD)                                  │    │
│  │  - /projects (CRUD)                                 │    │
│  │  - /time-entries (CRUD + /start /stop /active)      │    │
│  │  - /dashboard/summary                               │    │
│  │  - /export/csv                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│  Auth Middleware: Bearer JWT → get_current_user             │
└───────────────────┬─────────────────────────────────────────┘
                    │  Motor async
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   MongoDB (port 27017)                      │
│  Collections: users, clients, projects, time_entries        │
└─────────────────────────────────────────────────────────────┘
```

### Routing-Struktur Frontend
```
/                 → Tracker (Hauptseite, Default)
/login            → Login (anonym, sonst redirect /)
/register         → Registrierung
/dashboard        → KPIs + Charts
/clients          → Kunden-Verwaltung
/projects         → Projekt-Verwaltung
/reports          → CSV-Export
```

### Service-Verzeichnis
```
/app
├── backend/
│   ├── server.py          (komplettes FastAPI in einer Datei, ~500 LOC)
│   ├── requirements.txt
│   └── .env               (MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, CORS_ORIGINS)
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── .env               (REACT_APP_BACKEND_URL)
    ├── public/
    └── src/
        ├── index.js
        ├── App.js
        ├── App.css
        ├── index.css      (Theme variables, fonts, animations)
        ├── lib/
        │   └── api.js     (axios instance + helpers)
        ├── contexts/
        │   ├── AuthContext.jsx
        │   └── ThemeContext.jsx
        ├── hooks/
        │   └── useVoiceCommand.js
        ├── components/
        │   ├── Layout.jsx        (Sidebar + Mobile Nav)
        │   ├── ActiveTimerBar.jsx (Sticky Bottom Bar)
        │   └── ui/                (Shadcn components)
        └── pages/
            ├── Login.jsx
            ├── Register.jsx
            ├── Tracker.jsx        (Hauptseite)
            ├── Clients.jsx
            ├── Projects.jsx
            ├── Dashboard.jsx
            └── Reports.jsx
```

---

## 4. DATENMODELL (MongoDB)

Alle IDs sind **UUIDv4-Strings** (NICHT MongoDB's `ObjectId`!), damit sie JSON-serialisierbar sind und der `_id`-Bug vermieden wird.

### Collection: `users`
```javascript
{
  id: "uuid-v4-string",           // Primary identifier
  email: "user@example.com",       // unique index
  password_hash: "$2b$12$...",     // bcrypt hash
  name: "Max Mustermann",
  created_at: "2026-02-01T10:00:00+00:00"  // ISO 8601 string
}
```

### Collection: `clients`
```javascript
{
  id: "uuid-v4-string",
  user_id: "uuid-of-owner",
  name: "Firma Orca",
  hourly_rate: 100.0,              // €/Stunde
  color: "#FF3B30",                // Hex für UI
  created_at: "ISO-string"
}
```

### Collection: `projects`
```javascript
{
  id: "uuid-v4-string",
  user_id: "uuid-of-owner",
  client_id: "uuid-of-client",
  name: "Vertrieb",
  hourly_rate: 150.0 | null,       // optional; null = nur Kunden-Satz
  color: "#0EA5E9",
  created_at: "ISO-string"
}
```

### Collection: `time_entries`
```javascript
{
  id: "uuid-v4-string",
  user_id: "uuid-of-owner",
  project_id: "uuid-of-project",
  client_id: "uuid-of-client",     // denormalisiert für schnelle Queries
  description: "Was wurde gemacht",
  start_time: "2026-02-01T09:00:00+00:00",
  end_time: "2026-02-01T10:30:00+00:00" | null,  // null = aktiv laufend
  duration_seconds: 5400,           // 0, solange end_time null
  created_at: "ISO-string"
}
```

### Indizes (im `startup`-Event anlegen)
```python
await db.users.create_index("email", unique=True)
await db.clients.create_index([("user_id", 1), ("name", 1)])
await db.projects.create_index([("user_id", 1), ("client_id", 1)])
await db.time_entries.create_index([("user_id", 1), ("start_time", -1)])
```

### KRITISCH: MongoDB-Konventionen
- **Niemals `_id` zurückgeben** — Projektion: `{"_id": 0}` bei jeder `find()` / `find_one()`
- **`datetime.now(timezone.utc).isoformat()`** statt deprecated `utcnow()`
- **Niemals Original-Dict nach `insert_one()` direkt returnen** — MongoDB mutiert es und fügt `_id` hinzu → `doc.pop("_id", None)` davor

---

## 5. BACKEND API SPEC

Alle Routen unter Präfix `/api`. Authorization via `Authorization: Bearer <jwt>` Header (außer `/auth/register` und `/auth/login`).

### 5.1 Authentication

#### `POST /api/auth/register`
```json
// Request
{ "email": "user@example.com", "password": "strongpass", "name": "Max" }
// Response 200
{ "id": "uuid", "email": "...", "name": "...", "token": "<jwt>" }
// Errors
400 "Email already registered"
```

#### `POST /api/auth/login`
```json
// Request
{ "email": "...", "password": "..." }
// Response 200
{ "id": "uuid", "email": "...", "name": "...", "token": "<jwt>" }
// Errors
401 "Invalid credentials"
```

#### `GET /api/auth/me` (auth required)
```json
// Response
{ "id": "uuid", "email": "...", "name": "...", "created_at": "..." }
```

#### `POST /api/auth/logout`
Löscht das `access_token` Cookie. (Token im localStorage muss zusätzlich vom Frontend gelöscht werden.)

### 5.2 Clients

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/clients` | – | Liste aller Kunden des Users, sortiert nach `name` |
| POST | `/api/clients` | `{name, hourly_rate, color}` | – |
| PUT | `/api/clients/{id}` | wie POST | – |
| DELETE | `/api/clients/{id}` | – | **Kaskadiert:** löscht zugehörige Projekte und Time-Entries |

### 5.3 Projects

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/projects` | – | Alle Projekte des Users |
| POST | `/api/projects` | `{name, client_id, hourly_rate?, color}` | Reject 404 wenn `client_id` nicht existiert/dem User gehört |
| PUT | `/api/projects/{id}` | wie POST | – |
| DELETE | `/api/projects/{id}` | – | Kaskadiert: löscht zugehörige Time-Entries |

### 5.4 Time Entries

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/time-entries?start=&end=&project_id=` | – | Filter: ISO-Strings, optional. Sortiert `start_time` DESC |
| GET | `/api/time-entries/active` | – | Aktuell laufender Eintrag oder `null` |
| POST | `/api/time-entries/start` | `{project_id, description?}` | **Stoppt automatisch jeden bereits laufenden Timer und berechnet dessen Dauer**, dann startet neuen |
| POST | `/api/time-entries/stop` | – | Stoppt aktiven Timer, schreibt `end_time` + `duration_seconds` |
| POST | `/api/time-entries` | `{project_id, description, start_time, end_time?}` | Manueller Eintrag |
| PUT | `/api/time-entries/{id}` | partial | Recompute `duration_seconds` bei Änderung von start/end |
| DELETE | `/api/time-entries/{id}` | – | – |

**Geschäftsregel:** Genau **ein** aktiver Timer pro User. `/start` stoppt alle anderen.

### 5.5 Dashboard

#### `GET /api/dashboard/summary?start=&end=`
Aggregiert alle abgeschlossenen Time-Entries im Zeitraum.

**KRITISCHE BERECHNUNGSREGEL — Effektiver Stundensatz:**
```python
rate = max(
    project.hourly_rate or 0,
    client.hourly_rate or 0
)
```
**Es gilt IMMER der höhere Satz.** Das ist eine bewusste Sicherheits-Regel, damit der Freelancer nie unter Wert abrechnet, wenn er beim Projekt versehentlich einen niedrigeren Satz einträgt.

```json
// Response
{
  "total_seconds": 36000,
  "total_amount": 1000.00,
  "entries_count": 12,
  "by_client": [
    {"client_id":"...", "client_name":"...", "color":"#...", "seconds":18000, "amount":500.0}
  ],
  "by_project": [
    {"project_id":"...", "project_name":"...", "client_name":"...", "color":"#...", "seconds":..., "amount":...}
  ],
  "daily": [
    {"date":"2026-02-01", "seconds":7200}
  ]
}
```

### 5.6 CSV Export

#### `GET /api/export/csv?start=&end=&client_id=&project_id=`
Liefert UTF-8 CSV mit **Semikolon-Delimiter** (Excel-DE-kompatibel) und deutschen Zahlenformat (Komma als Dezimaltrenner).

**Spalten:**
```
Datum;Start;Ende;Dauer (h);Kunde;Projekt;Beschreibung;Stundensatz;Betrag
```

Stundensatz und Betrag nutzen die gleiche `max()`-Regel.

---

## 6. AUTHENTICATION-IMPLEMENTIERUNG (DETAILS)

### JWT
- Algorithmus: `HS256`
- Payload: `{sub: user_id, email, exp (7 Tage), type: "access"}`
- Secret aus `JWT_SECRET` env var (mind. 256 bit random hex)
- Login-Response enthält das Token im Body als Feld `token` UND setzt es als HttpOnly Cookie (Cookie wird aber bei Cross-Origin im Preview-iframe nicht zuverlässig genutzt → Bearer-Header ist Primärquelle)

### Bcrypt
- Cost-Factor: Default (12)
- **Niemals Passwort in Logs/Response leaken**
- Bei `find_one` für User: Projektion `{"password_hash": 0, "_id": 0}` außer beim Login-Verify

### Backend Auth-Dependency
```python
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user: raise HTTPException(401, "User not found")
    return user
```

### Admin Seeding (Startup)
Beim Backend-Start: prüfen ob `ADMIN_EMAIL` existiert; falls nein, mit `ADMIN_PASSWORD` anlegen. Falls Email existiert aber Passwort nicht passt, Passwort updaten. (Idempotent)

---

## 7. FRONTEND-SEITEN (DETAIL)

### 7.1 Login (`/login`)
- **Layout:** Split-Screen Desktop (Art-Panel links, Form rechts), Single-Column Mobile
- **Form-Fields:** Email + Passwort + Submit "Anmelden →"
- **Demo-Hint-Box:** zeigt `admin@timetrack.app / admin123`
- **Theme-Toggle** oben rechts
- **Link** zu `/register`
- Bei Erfolg: JWT in `localStorage["auth_token"]`, redirect `/`

### 7.2 Register (`/register`)
- Felder: Name, Email, Passwort (min 6)
- Auto-Login nach erfolgreicher Registrierung

### 7.3 Layout (alle authenticated Pages)
- **Desktop:** linke Sidebar 224px breit, sticky
  - Logo "CHRONO" + Timer-Icon (Primary rot)
  - Nav: Timer / Dashboard / Kunden / Projekte / Berichte
  - Footer: Theme-Toggle, User-Email, Abmelden
- **Mobile:** Top-Bar mit Hamburger → Vollbild-Overlay
- **Sticky Bottom Bar (`ActiveTimerBar.jsx`)** wenn Timer läuft:
  - Pulsierender roter Dot
  - Projekt-Name, Kunde, Beschreibung
  - Live-Counter `HH:MM:SS` (tabellarische Ziffern, Update jede Sekunde)
  - Stop-Button (Outline, primary)

### 7.4 Tracker (`/`) — HAUPTSEITE

**Sektionen von oben nach unten:**

#### A) Header
- Eyebrow „ZEITERFASSUNG"
- H1 „Timer"
- Rechts: „HEUTE" + heutiger Gesamtcounter (Summe duration_seconds aller heutigen abgeschlossenen Einträge)

#### B) Start-Panel
Grid mit 5 Spalten auf Desktop (1fr 1fr auto auto auto):
1. **Projekt-Select** (Shadcn Select; zeigt "Projektname — Kundenname")
2. **Beschreibung-Input** (optional, „Was hast du gemacht?")
3. **Start-Button** (rot, gefüllter Play-Icon)
   - Disabled wenn kein Projekt gewählt
   - Label: „Start" wenn kein Timer aktiv, „Wechseln" wenn aktiv
4. **Stop-Button** (Outline)
   - Disabled wenn kein Timer aktiv
5. **Sprache-Button** (Outline)
   - Disabled wenn Web Speech API nicht verfügbar
   - Aktiv pulsiert mit `voice-listening` Klasse (CSS keyframes)

Darunter Hilfetexte mit Beispiel-Sprachbefehlen.
Bei Sprach-Treffer: roter Hint-Text mit Transkript.

#### C) Schnellstart-Sektion
- Überschrift „Schnellstart" + Hint „Klick = Start / Stop"
- Grid: 1 col mobile, 2 col tablet, 4 col desktop
- Logik: aus den letzten 30 Tagen Time-Entries die letzten **4 unique Kombinationen** von (project_id, description.toLowerCase()) extrahieren
- Pro Kachel:
  - Color-Dot + Projekt-Name + Toggle-Button (Play/Stop)
  - Kunden-Name (klein)
  - Beschreibung (2-line clamp)
  - Wenn aktiv: Primary Border + Ring + roter „● Läuft"-Hint
- Klick = `quickToggle(qs)`:
  - Wenn dieser exakte Eintrag gerade läuft → `/api/time-entries/stop`
  - Sonst → `/api/time-entries/start` mit `project_id` + `description`

#### D) Letzte Einträge
- H2 „Letzte Einträge"
- Pill-Filter rechts: **Letzte 5** | **7 Tage** | **30 Tage** | **Jahr**
- Manuell-Button neben Filter (öffnet Manual-Entry-Dialog)
- **Liste** (max-height 480px wenn >8 Einträge, dann scrollbar)
- Pro Zeile:
  - Color-Bar (4px breit, Projekt-Farbe)
  - Projekt + Kunde · Beschreibung
  - Datum + Zeitfenster (Desktop only)
  - Dauer (mono, fett)
  - Edit / Delete Icons (opacity 60%, hover 100%)
- **Klick auf Zeile** öffnet Bearbeiten-Dialog
- **Delete** öffnet AlertDialog mit Bestätigung („Eintrag wirklich löschen? Dieser Schritt kann nicht rückgängig gemacht werden.")

### 7.5 Clients (`/clients`)
- Liste mit Spalten: Color-Dot | Name | Stundensatz €/h | Edit/Delete
- „Neuer Kunde" Button öffnet Dialog
- Dialog-Felder: Name, Stundensatz (€), Farb-Picker (7 vordefinierte Farben)
- **WICHTIG:** Dialog mit `key={edit?.id || "new"}` prop, damit useState beim Wechsel zwischen Bearbeiten/Neu korrekt neu initialisiert wird
- Hinweis im Dialog: „Wird verwendet, wenn das Projekt keinen eigenen Satz hat. Es gilt immer der höhere der beiden Sätze."

### 7.6 Projects (`/projects`)
- Liste: Color-Dot | Projekt | Kunde | Effektiver Satz | Edit/Delete
- Effektiver Satz = `Math.max(projectRate ?? 0, clientRate)`
- Wenn Project-Rate gesetzt aber unterschiedlich: kleine Untertext-Zeile zeigt „Projekt: X · Kunde: Y"
- Dialog: Name, Kunde-Select, Stundensatz Projekt (optional), Farb-Picker
- Hinweis: „Für die Abrechnung gilt immer der höhere Satz aus Kunde und Projekt."

### 7.7 Dashboard (`/dashboard`)
- Date-Range-Picker (Default: letzte 30 Tage)
- **4 KPI-Cards:** Gesamtzeit, Abrechnungsbetrag, Einträge, Ø Stunden/Tag (primary-Akzent auf den ersten beiden)
- **Bar-Chart** (Recharts): Tägliche Stunden (XAxis = Datum verkürzt, YAxis = Stunden)
- **Pie-Chart:** Anteil pro Kunde
- **Zwei Tabellen:** Kunden / Projekte mit jeweils Color-Dot, Name, Stunden, Betrag

### 7.8 Reports (`/reports`)
- Filter: Datum Von/Bis, Kunde-Select („Alle Kunden" + Liste), Projekt-Select (gefiltert nach Kunde)
- „CSV herunterladen" Button → Fetch mit Bearer-Token → Blob-Download als `zeiterfassung_<start>_<end>.csv`

---

## 8. VOICE-COMMAND-LOGIK (`useVoiceCommand.js`)

### Browser-API
```javascript
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const r = new SR();
r.lang = "de-DE";
r.continuous = false;
r.interimResults = false;
r.maxAlternatives = 1;
```

### Parser (`parseVoiceCommand(text, clients, projects)`)
Erkennt:
1. **Stop:** Regex `/\b(stopp?|beende|anhalten|ende)\b/` → `intent: "stop"`
2. **Kunde:** sucht `client.name.toLowerCase()` im Transkript
3. **Projekt:** sucht `project.name.toLowerCase()`, bevorzugt Projekte des erkannten Kunden
4. **Dauer:** Regex `(\d+)\s*(minuten|min|minute)` ODER `(\d+(?:[.,]\d+)?)\s*(stunden|std|h)`
5. **Intent:**
   - `minutes` gefunden → `intent: "log"` (manueller Eintrag mit dieser Dauer rückwirkend bis jetzt)
   - Sonst, wenn Projekt gefunden + Keywords „beginnt/starte/los/jetzt" → `intent: "start"`
   - Sonst, wenn nur Projekt erkannt → `intent: "start"` (default)

### Retry-Strategie
- Bei `network`, `no-speech`, `aborted` Errors: bis zu **2× automatischer Retry** im Hintergrund
- Bei dauerhaftem Fehler: klare deutsche Toast-Message
- Vor `.start()`: explizit Mikrofon-Permission via `navigator.mediaDevices.getUserMedia({audio:true})` triggern (hilft in iframes)
- Online-Check: `navigator.onLine` vor Start prüfen

### Wichtig
- Web Speech API streamt Audio an **Google-Server** (in Chrome) → benötigt Internet
- In Firmen-Firewalls oft blockiert → User muss Browser/Netzwerk wechseln
- iframe-Embed (z.B. Preview) blockiert Mikrofon ohne `allow="microphone"` — App in neuem Tab öffnen

---

## 9. UI/UX DESIGN-SPEZIFIKATION

### Typografie
- **Heading-Font:** `Outfit` (700–900), letter-spacing: -0.02em
- **Body:** `IBM Plex Sans` (400–700)
- **Mono/Timer-Ziffern:** `IBM Plex Mono` mit `font-variant-numeric: tabular-nums`
- Beide von Google Fonts.

### Farb-System (CSS Variables, HSL)

#### Light Mode
- `--background: 0 0% 100%` (weiß)
- `--foreground: 240 6% 10%` (fast schwarz)
- `--primary: 4 100% 59%` (Signal Red #FF3B30)
- `--border: 240 6% 88%`
- `--muted-foreground: 240 4% 46%`

#### Dark Mode
- `--background: 0 0% 4%` (sehr dunkles schwarz)
- `--foreground: 0 0% 98%`
- `--primary: 0 100% 65%` (helleres Rot für Kontrast)
- `--card: 0 0% 8%`
- `--border: 240 4% 15%`

### Layout-Prinzipien
- **Asymmetrisch links-ausgerichtet** (nicht zentriert)
- **2–3× mehr Spacing als „bequem"** — viel Whitespace
- **Eyebrow-Tags** über Headlines: kleine UPPERCASE-Labels mit `tracking-[0.2em]`
- **Mono-Schrift** für Timer-Ziffern, Zahlenwerte, Counter

### Animations
```css
@keyframes voice-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.6) } 50% { box-shadow: 0 0 0 16px rgba(255,59,48,0) } }
.voice-listening { animation: voice-pulse 1.4s ease-in-out infinite; }

@keyframes fade-up { from {opacity:0; transform:translateY(8px)} to {opacity:1; transform:translateY(0)} }
.fade-up { animation: fade-up 0.35s ease-out both; }
```

### Grid-Background-Pattern (Login)
```css
.grid-bg {
  background-image:
    linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
    linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px);
  background-size: 48px 48px;
}
```

### Iconography
- **lucide-react** Icons, NIEMALS Emojis
- Standard-Größe: `w-4 h-4` für Inline, `w-5 h-5` für Headline-Icons

---

## 10. ENVIRONMENT VARIABLES

### Backend `.env`
```bash
MONGO_URL="mongodb://localhost:27017"
DB_NAME="timetrack_db"
CORS_ORIGINS="*"
JWT_SECRET="<256-bit-random-hex>"
ADMIN_EMAIL="admin@timetrack.app"
ADMIN_PASSWORD="admin123"      # NUR für Initial-Setup — User sollte direkt ändern
```

### Frontend `.env`
```bash
REACT_APP_BACKEND_URL="https://your-backend.example.com"
```

**WICHTIG:**
- Keine Defaults im Code hardcoden — soll bei fehlender ENV fail-fast
- `CORS_ORIGINS="*"` ist OK weil Auth via Bearer-Token (kein Credentials-Cookie)
- In Production: `allow_credentials=False` lassen oder Origins explizit setzen

---

## 11. WÄHREND DER ENTWICKLUNG AUFGETRETENE PROBLEME

Diese Fallstricke unbedingt vermeiden:

### Problem 1: React Dialog behält State zwischen Bearbeitungen
**Symptom:** Edit-Button auf Kunde A öffnet immer noch das Formular von Kunde B (oder leere „Neu"-Form).

**Ursache:** `useState(client?.name || "")` initialisiert nur beim ersten Mount. Wenn der Dialog dauerhaft im DOM bleibt und nur die `client`-Prop wechselt, behält der State seine alten Werte.

**Fix:**
```jsx
<ClientDialog
  key={edit?.id || "new"}    // ← erzwingt Remount
  client={edit}
  ...
/>
```
Gleiche Lösung für `ProjectDialog` und `ManualEntryDialog`.

### Problem 2: Cross-Origin Cookies funktionieren nicht zuverlässig
**Symptom:** Login klappt, aber `/auth/me` gibt 401 zurück.

**Ursache:** Browser blockiert `SameSite=None; Secure` Cookies in einigen Konstellationen (iframes, Drittanbieter-Cookies disabled).

**Fix:** JWT zusätzlich im Login-Response-Body als `token` zurückgeben. Frontend speichert in `localStorage["auth_token"]` und sendet via `Authorization: Bearer <token>` Header. Cookie bleibt als Fallback.

### Problem 3: MongoDB `_id` leaks in JSON Response
**Symptom:** FastAPI wirft `bson.objectid.ObjectId is not JSON serializable`.

**Ursache:** Nach `insert_one(doc)` enthält das Original-Dict ein neues `_id`-Feld.

**Fix:** Vor Return immer `doc.pop("_id", None)` ODER bei `find()` immer Projektion `{"_id": 0}`.

### Problem 4: Web Speech API "network" Error
**Symptom:** Sprach-Button startet, bricht aber mit „Netzwerk-Fehler" ab.

**Ursache:** Chrome's Web Speech API leitet Audio an Google-Server weiter; Firewalls/VPN/Adblocker können das blockieren.

**Fix:** Automatischer Retry (bis zu 2×) bei transienten Fehlern. Klare User-Message wenn dauerhaft. Alternativ: serverseitige STT mit Whisper.

### Problem 5: Start-Button ausgegraut bei laufendem Timer
**Symptom:** User kann nicht zu neuem Projekt wechseln.

**Ursache:** Frontend disabled Start, wenn `active != null`.

**Fix:** Backend `/start` stoppt automatisch den laufenden Timer. Frontend-Check entfernen — Button-Label dynamisch „Start" vs „Wechseln" setzen.

### Problem 6: ENV-Variablen mit `$` in Bcrypt-Hashes
**Symptom:** Admin-Login schlägt fehl, weil das Passwort in `.env` Sonderzeichen enthält.

**Ursache:** Some shells expanden `$VAR` in `.env`-Werten beim Source.

**Fix:** `.env`-Werte in `"…"` quoten. NIEMALS bcrypt-Hashes in `.env` legen — Passwort als plain string speichern, im Code hashen.

### Problem 7: Time-Entry "duration_seconds" stimmt nicht
**Symptom:** Nach Edit eines Eintrags zeigt das Dashboard alte Werte.

**Ursache:** PUT updatet `start_time`/`end_time`, vergisst aber `duration_seconds` neu zu berechnen.

**Fix:** Bei jedem PUT, der start oder end ändert: `duration_seconds = max(0, int((end-start).total_seconds()))` mit-updaten.

### Problem 8: Falsche Abrechnung wegen Project-Rate-Override
**Symptom:** Freelancer trägt beim Projekt „50€" ein, Kunde hat aber „100€" → es wurden 50€ abgerechnet, obwohl der Kundensatz höher liegt.

**Ursache:** Klassische Override-Logik (Projekt überschreibt Kunde) führte zu Underbilling.

**Fix:** `rate = max(project_rate or 0, client_rate or 0)`. Es gilt IMMER der höhere Satz. Im UI klar kommunizieren.

---

## 12. SICHERHEITS-CHECKLISTE

### Authentifizierung
- ✅ Passwörter mit **bcrypt** gehashed (cost 12)
- ✅ JWT mit langem Random-Secret (mind. 256 bit)
- ✅ Token-Expiration: 7 Tage
- ⚠️ **Kein Refresh-Token-Flow** implementiert — bei Token-Ablauf muss User neu einloggen
- ⚠️ **Keine Rate-Limiting** auf `/login` — Brute-Force-Schutz fehlt
- ⚠️ **Keine Email-Verifikation** bei Registrierung
- ⚠️ **Kein Passwort-Reset-Flow**

### Daten-Isolation
- ✅ Alle Queries filtern nach `user_id` aus JWT
- ✅ Kein User kann Daten anderer User sehen/ändern
- ⚠️ Aber: **keine zusätzliche Authorization-Layer** — wer einen gültigen Token hat, hat vollen Zugriff auf sein User-Konto

### Input-Validation
- ✅ Pydantic-Models validieren Request-Bodies
- ⚠️ **Keine Längen-Limits** auf Strings (z.B. Description) — Memory-DoS möglich
- ⚠️ **Keine HTML/Script-Sanitization** — XSS in description-Feld wenn das jemals als `dangerouslySetInnerHTML` gerendert würde (aktuell sicher, da nur als text content gerendert)

### MongoDB
- ✅ Keine raw-string Queries → kein NoSQL-Injection
- ✅ `_id` wird NIE returned
- ⚠️ **Keine Datenbank-Auth** in der lokalen Setup → in Production: Connection-String mit User+Password

### Transport
- ✅ HTTPS via Kubernetes-Ingress
- ⚠️ JWT in `localStorage` ist **anfällig für XSS** — bei Script-Injection könnte Token gestohlen werden. Alternative: HttpOnly Cookies (bei Cross-Origin schwierig)

### Empfehlungen für Production-Hardening
1. **Rate-Limiting** auf `/login` und `/register` (z.B. slowapi)
2. **Brute-Force-Lockout** nach 5 Fehlversuchen (login_attempts Collection)
3. **Refresh-Token-Flow** mit kurzem Access-Token + langem Refresh-Token
4. **Email-Verifikation** via Magic-Link
5. **Passwort-Reset** via Token-Email
6. **Audit-Log** für sensible Aktionen (Delete-Operationen)
7. **CORS** auf konkrete Origin(s) einschränken
8. **Content-Security-Policy** Header setzen
9. **MongoDB Atlas** mit aktivierter Authentication

---

## 13. STEP-BY-STEP REBUILD-PLAN

### Phase 1: Setup (15 Min)
1. Neues Projekt anlegen mit Struktur aus Abschnitt 3
2. Dependencies installieren:
   - Backend: `fastapi uvicorn motor pyjwt bcrypt python-dotenv pydantic[email]`
   - Frontend: `react react-router-dom axios sonner lucide-react recharts` + Shadcn CLI setup mit Tailwind
3. Shadcn-Components installieren: `button input label select dialog alert-dialog`
4. `.env`-Files anlegen (Abschnitt 10)

### Phase 2: Backend (1 h)
1. `server.py` mit Routes-Skeleton (Abschnitt 5)
2. JWT + Bcrypt Helpers + `get_current_user` Dependency (Abschnitt 6)
3. Pydantic-Models (Abschnitt 4 als Vorlage)
4. Auth-Routes (`/auth/register`, `/login`, `/me`, `/logout`)
5. Clients CRUD
6. Projects CRUD (mit Client-Validierung)
7. Time-Entries CRUD + `/start` (mit Auto-Stop) + `/stop` + `/active`
8. Dashboard-Aggregation mit `max(rate)`-Regel
9. CSV-Export
10. Admin-Seeding im Startup-Event
11. MongoDB-Indizes anlegen

### Phase 3: Frontend Core (1 h)
1. `App.js` mit Router-Setup + AuthProvider + ThemeProvider
2. `api.js` mit axios-Instance + Bearer-Interceptor
3. `AuthContext.jsx` mit `/auth/me`-Check + Login/Register/Logout
4. `ThemeContext.jsx` mit Dark/Light-Toggle persistent in localStorage
5. `index.css` mit CSS-Variables (Abschnitt 9)
6. `Layout.jsx` mit Sidebar + Mobile-Nav
7. `Login.jsx` + `Register.jsx`

### Phase 4: Frontend Features (2 h)
1. `ActiveTimerBar.jsx` mit Live-Counter
2. `useVoiceCommand.js` Hook mit Parser + Retry (Abschnitt 8)
3. `Tracker.jsx` mit Start-Panel + Schnellstart + Letzte Einträge
4. `Clients.jsx` mit Dialog (denke an `key={edit?.id || "new"}`!)
5. `Projects.jsx` mit Effective-Rate-Anzeige
6. `Dashboard.jsx` mit Recharts (Bar + Pie + Tabellen)
7. `Reports.jsx` mit CSV-Download

### Phase 5: Testing (30 Min)
1. Backend: Curl-Tests für alle Endpoints
2. Frontend: Login → Kunde anlegen → Projekt → Timer Start/Stop → Schnellstart → Dashboard → CSV-Export
3. Voice: Mikrofon-Test in neuem Tab (nicht iframe!)
4. Edge-Cases: Project-Delete-Kaskade, doppelter Login, ablaufender JWT

### Phase 6: Deployment
**Option A — Railway + Vercel + MongoDB Atlas:**
1. MongoDB Atlas Cluster (Free Tier) anlegen, Connection-String kopieren
2. Backend zu Railway pushen, `MONGO_URL` + alle anderen ENV setzen
3. Frontend zu Vercel, `REACT_APP_BACKEND_URL` setzen
4. CORS Origins auf Vercel-Domain einschränken

**Option B — Self-Hosted VPS:**
1. Docker-Compose mit `mongo:6`, Backend-Image, Frontend-Build hinter Nginx
2. Let's-Encrypt für HTTPS
3. Backup-Cronjob für MongoDB-Dump

---

## 14. ROADMAP / DEFERRED FEATURES (P1)

Nicht implementiert, aber sinnvoll als nächste Schritte:
- **Wochenansicht/Kalender-Gitter** für die Time-Entries
- **PDF-Rechnungs-Generator** mit Logo, UStID, Empfänger-Adresse
- **Pomodoro / Idle-Detection** (Warnung bei 5 Min Inaktivität)
- **Tagesziel + Streak** Gamification
- **Multi-User / Teams** mit geteilten Kunden
- **Imports** aus Toggl/Harvest CSV
- **Recurring Reminders** („Hast du heute schon getrackt?")
- **API-Tokens** für 3rd-Party-Integrationen
- **Mobile PWA** mit Offline-Sync
- **Server-side Whisper** als robusterer Sprach-Fallback

---

## 15. ABNAHME-CHECKLISTE FÜR DEN REBUILD

Nach Fertigstellung müssen folgende Flows fehlerfrei laufen:

- [ ] Login mit Admin-Seed funktioniert
- [ ] Registration neuer User funktioniert
- [ ] Kunden CRUD mit korrektem Stundensatz
- [ ] Projekt CRUD mit Client-Bindung
- [ ] Timer-Start setzt aktiven Eintrag
- [ ] Timer-Stop berechnet `duration_seconds` korrekt
- [ ] Zweiter `/start` stoppt ersten automatisch
- [ ] Manueller Eintrag mit Start/Ende
- [ ] Edit eines Eintrags zeigt korrekte initial values (key-Trick!)
- [ ] Delete eines Eintrags zeigt AlertDialog
- [ ] Schnellstart zeigt letzte 4 unique Kombinationen
- [ ] Schnellstart-Klick toggelt Start/Stop für gleiche Kombi
- [ ] Sprach-Button: „Firma X, Projekt Y, Start" startet Timer
- [ ] Sprach-Button: „Stopp" stoppt Timer
- [ ] Sprach-Button: „30 Minuten an Y" loggt manuellen Eintrag
- [ ] Dashboard nutzt `max(rate)` korrekt
- [ ] CSV-Export liefert Excel-DE-kompatible Datei
- [ ] Dark/Light-Toggle persistiert über Reload
- [ ] Mobile-Nav funktioniert auf Smartphone-Viewport
- [ ] Cascade-Delete: Kunde löschen entfernt auch Projekte + Entries
- [ ] JWT-Expiration → User wird zu /login redirected

---

## 16. PROMPT-VORLAGE FÜR DEN REBUILD-AGENT

> „Baue eine Zeit-Tracking-Web-App namens CHRONO basierend auf der Spezifikation in HANDOVER.md. Tech-Stack: FastAPI + MongoDB Backend, React 19 + Shadcn/UI Frontend, Web Speech API für deutsche Sprachbefehle, JWT-Auth mit Bearer-Token in localStorage. Folge der Datei-Struktur in Abschnitt 3, der API-Spec in Abschnitt 5, dem Datenmodell in Abschnitt 4 und der UI-Spec in Abschnitt 9. Achte besonders auf die in Abschnitt 11 dokumentierten Probleme (insbesondere das `key`-Prop-Pattern bei Dialogs und die `max(rate)`-Abrechnungsregel). Teste alle Punkte in der Abnahme-Checkliste in Abschnitt 15."

---

**Dokument-Version:** 1.0 · **Stand:** Februar 2026
**Geschätzter Rebuild-Aufwand:** 4–5 h für einen erfahrenen Full-Stack-Entwickler oder eine fähige KI mit Tool-Access.

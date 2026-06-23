# CLAUDE.md — Migrations- und Deployment-Briefing

> Diese Datei ist der Steuerungskontext für Claude Code. Die vollständige fachliche
> Spezifikation der App steht in `HANDOVER.md` im selben Ordner. Lies sie als
> Referenz für Datenmodell, API, Auth-Details und die acht dokumentierten Bugfixes.
> Dieses Dokument beschreibt **nur**, was für die Migration weg von Emergent zu tun ist.

## Ausgangslage

Die App **CHRONO** (Voice Timer / projektbezogene Zeiterfassung) wurde auf Emergent
gebaut und nach GitHub exportiert. Der Code ist vollständig und lauffähig. Das
Emergent-Deployment ist abgelaufen, dabei gingen Daten ab dem 03.06. verloren.

**Ziel: Den bestehenden Code unverändert in der Funktion lauffähig machen und dauerhaft
selbst hosten. Das ist eine Migration, kein Rebuild. Keine Neuprogrammierung von Features.**

Stack (verbindlich, nicht ändern): FastAPI + MongoDB (Motor) im Backend, React 19 +
Shadcn/UI + Tailwind im Frontend, Auth via JWT + bcrypt, Voice via Web Speech API (de-DE).

Ziel-Hosting:
- Frontend: Vercel (kostenlos, dauerhaft)
- Backend: Render (Free Tier zum Start, später optional Starter 7 USD/Monat)
- Datenbank: MongoDB Atlas, Cluster M0 (kostenlos, dauerhaft)

## Bekannte Stolpersteine (zuerst beheben)

1. **`emergentintegrations==0.1.0` aus `backend/requirements.txt` entfernen.**
   Das Paket ist nicht öffentlich verfügbar und wird im Code nicht importiert.
   Ohne Entfernung schlägt `pip install` außerhalb von Emergent fehl.

2. **Cross-Origin-Auth.** Frontend und Backend laufen auf verschiedenen Domains.
   Der Code unterstützt bereits Cookie- und Bearer-Token-Auth. Stelle sicher, dass
   der Frontend-HTTP-Client (axios) den JWT bei jedem Request im
   `Authorization: Bearer`-Header mitschickt und nicht ausschließlich auf das Cookie
   vertraut. Siehe `HANDOVER.md`, Problem 2.

3. **CORS.** `CORS_ORIGINS` im Backend in Produktion auf die konkrete Vercel-Domain
   setzen, nicht auf `*`, sobald die Domain feststeht.

4. **Fail-fast bei fehlenden ENV-Variablen.** Keine Defaults für `MONGO_URL`,
   `DB_NAME`, `JWT_SECRET` hardcoden.

## ENV-Variablen

Backend `.env` (lokal) bzw. Render-Environment (Produktion):
```
MONGO_URL="<Atlas Connection String>"
DB_NAME="timetrack_db"
CORS_ORIGINS="<lokal: *  /  prod: https://<dein-projekt>.vercel.app>"
JWT_SECRET="<256-bit Hex, neu generieren>"
ADMIN_EMAIL="<deine E-Mail>"
ADMIN_PASSWORD="<starkes Initial-Passwort, danach in der App aendern>"
```
Frontend `.env` (lokal) bzw. Vercel-Environment (Produktion):
```
REACT_APP_BACKEND_URL="<lokal: http://localhost:8000  /  prod: https://<backend>.onrender.com>"
```
Hinweis: JWT_SECRET neu generieren, nicht den alten Emergent-Wert wiederverwenden.

## Lokales Setup (Windows)

Voraussetzungen vorhanden: Node, Python, Git, GitHub-Account.

1. Repo ist bereits geklont. Im Projektordner `claude` starten.
2. Backend:
   - `cd backend`
   - virtuelle Umgebung anlegen und aktivieren (`python -m venv venv`, dann
     `venv\Scripts\activate`)
   - `requirements.txt` bereinigen (Stolperstein 1), dann `pip install -r requirements.txt`
   - `.env` anlegen (siehe oben). Fuer den ersten lokalen Test entweder lokales MongoDB
     oder direkt der Atlas-String.
   - Backend starten: `uvicorn server:app --reload --port 8000`
3. Frontend:
   - `cd frontend`
   - `npm install`
   - `.env` mit `REACT_APP_BACKEND_URL="http://localhost:8000"` anlegen
   - `npm start`
4. Ziel von Phase 1: App laeuft lokal, Login funktioniert, ein Testeintrag laesst sich
   anlegen und wieder auslesen.

## Aufgabenreihenfolge fuer Claude Code

1. `HANDOVER.md` lesen und das Datenmodell (Collections `users`, `clients`,
   `projects`, `time_entries`) bestaetigen.
2. Stolpersteine 1 bis 4 abarbeiten.
3. App lokal lauffaehig machen (Setup oben).
4. Smoke-Test: Registrierung, Login, Kunde anlegen, Projekt mit Stundensatz anlegen,
   Zeiteintrag manuell und per Voice, CSV-Export.
5. Import-Skript fuer die Altdaten schreiben (siehe naechster Abschnitt).
6. Deployment vorbereiten (Konfigurationsdateien, siehe uebernaechster Abschnitt).
7. Backup-Automatisierung einrichten.

## Datenimport der Altbestaende

Es existiert ein Excel-Export mit Stand 03.06. (Sheet `in`) mit den Spalten:
`Datum, Start, Ende, Dauer (h), Kunde, Projekt, Beschreibung, Stundensatz, Betrag`.

Aufgabe: Ein einmaliges Python-Import-Skript (`backend/scripts/import_legacy.py`)
schreiben, das diese Datei einliest und in die `time_entries`-Collection schreibt,
passend zum Datenmodell aus `HANDOVER.md` Abschnitt 4. Dabei:
- Kunden und Projekte aus den Spalten `Kunde`/`Projekt` ableiten und in den Collections
  `clients`/`projects` anlegen, falls noch nicht vorhanden (keine Duplikate).
- Die Eintraege dem eingeloggten Hauptnutzer zuordnen.
- Umlaute korrekt behandeln (die Quelldatei hat ein Encoding-Problem, z. B. erscheint
  "Strukturierungsgespraech" verfaelscht; beim Import nach UTF-8 normalisieren).
- Idempotent arbeiten: ein zweiter Lauf darf keine Doubletten erzeugen.
Die Zeiten nach dem 03.06. traegt der Nutzer manuell in der App nach.

## Deployment

Reihenfolge: erst Atlas, dann Backend, dann Frontend.

1. **MongoDB Atlas:** M0-Cluster anlegen, Datenbanknutzer und Netzwerkzugriff
   konfigurieren, Connection-String holen.
2. **Backend zu Render:** als Web Service aus dem GitHub-Repo, Root `backend`,
   Start-Command `uvicorn server:app --host 0.0.0.0 --port $PORT`. Alle Backend-ENV
   setzen. Pruefen, dass der Startup-Event Admin-Seeding und Indizes anlegt.
3. **Frontend zu Vercel:** aus demselben Repo, Root `frontend`,
   `REACT_APP_BACKEND_URL` auf die Render-URL setzen.
4. `CORS_ORIGINS` im Backend auf die Vercel-Domain einschraenken.
5. End-to-End-Test gegen die Live-URLs, mit Fokus auf Login (Stolperstein 2).

## Backup-Automatisierung (wichtig, da Datenverlust der Ausloeser war)

Atlas M0 hat keine automatischen Backups. Einrichten:
- Einen GitHub-Actions-Workflow (`.github/workflows/backup.yml`), der woechentlich per
  Cron laeuft, `mongodump` gegen die Atlas-Datenbank ausfuehrt und den Dump als
  Artefakt ablegt oder in einen privaten Storage schreibt.
- Atlas-Connection-String als GitHub-Secret hinterlegen, nicht im Klartext committen.
- Alternativ oder zusaetzlich: einen Button in der App, der einen vollstaendigen
  JSON/CSV-Export aller eigenen Daten herunterlaedt.

## Leitplanken

- Sprache der App: Deutsch. Keine Gedankenstriche als Stilmittel in UI-Texten.
- Keine Secrets ins Repo committen. `.env` steht in `.gitignore`, das so lassen.
- Funktionsumfang nicht erweitern, solange die Migration nicht abgeschlossen und
  live getestet ist. Neue Features (z. B. Passwort-Reset per E-Mail) erst danach.

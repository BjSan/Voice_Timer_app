"""Backend API tests for Zeit-Tracking-App"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://voice-timer-app-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@timetrack.app"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and len(data["token"]) > 20
    return data["token"]


@pytest.fixture(scope="session")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_register_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "pass1234", "name": "T"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == email.lower() and "token" in d
        # me
        m = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {d['token']}"}, timeout=15)
        assert m.status_code == 200
        assert m.json()["email"] == email

    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_protected_endpoints_require_auth(self):
        for path in ["/api/clients", "/api/projects", "/api/time-entries", "/api/dashboard/summary"]:
            r = requests.get(f"{BASE_URL}{path}", timeout=15)
            assert r.status_code == 401, f"{path} should require auth"


# ---------- Clients CRUD ----------
class TestClients:
    def test_client_crud(self, hdr):
        # Create
        r = requests.post(f"{BASE_URL}/api/clients", headers=hdr, json={"name": "TEST_Client_A", "hourly_rate": 80.0, "color": "#FF0000"}, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        cid = c["id"]
        assert c["name"] == "TEST_Client_A" and c["hourly_rate"] == 80.0
        # List/Get
        r = requests.get(f"{BASE_URL}/api/clients", headers=hdr, timeout=15)
        assert r.status_code == 200 and any(x["id"] == cid for x in r.json())
        # Update
        r = requests.put(f"{BASE_URL}/api/clients/{cid}", headers=hdr, json={"name": "TEST_Client_A2", "hourly_rate": 90.0, "color": "#00FF00"}, timeout=15)
        assert r.status_code == 200 and r.json()["name"] == "TEST_Client_A2" and r.json()["hourly_rate"] == 90.0
        # Delete
        r = requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=hdr, timeout=15)
        assert r.status_code == 200


# ---------- Projects ----------
class TestProjects:
    def test_project_rejects_unknown_client(self, hdr):
        r = requests.post(f"{BASE_URL}/api/projects", headers=hdr, json={"name": "TEST_BadProj", "client_id": "nonexistent-id"}, timeout=15)
        assert r.status_code == 404

    def test_project_crud(self, hdr):
        c = requests.post(f"{BASE_URL}/api/clients", headers=hdr, json={"name": "TEST_C_P", "hourly_rate": 50.0}, timeout=15).json()
        cid = c["id"]
        r = requests.post(f"{BASE_URL}/api/projects", headers=hdr, json={"name": "TEST_Proj1", "client_id": cid, "hourly_rate": 100.0}, timeout=15)
        assert r.status_code == 200 and r.json()["client_id"] == cid
        pid = r.json()["id"]
        r = requests.get(f"{BASE_URL}/api/projects", headers=hdr, timeout=15)
        assert any(x["id"] == pid for x in r.json())
        r = requests.put(f"{BASE_URL}/api/projects/{pid}", headers=hdr, json={"name": "TEST_Proj1b", "client_id": cid, "hourly_rate": 110.0}, timeout=15)
        assert r.status_code == 200 and r.json()["name"] == "TEST_Proj1b"
        r = requests.delete(f"{BASE_URL}/api/projects/{pid}", headers=hdr, timeout=15)
        assert r.status_code == 200
        requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=hdr, timeout=15)


# ---------- Time entries + timer ----------
class TestTimeEntries:
    @pytest.fixture
    def setup_proj(self, hdr):
        c = requests.post(f"{BASE_URL}/api/clients", headers=hdr, json={"name": "TEST_C_T", "hourly_rate": 60.0}, timeout=15).json()
        p = requests.post(f"{BASE_URL}/api/projects", headers=hdr, json={"name": "TEST_P_T", "client_id": c["id"], "hourly_rate": 120.0}, timeout=15).json()
        yield c["id"], p["id"]
        requests.delete(f"{BASE_URL}/api/clients/{c['id']}", headers=hdr, timeout=15)

    def test_start_stop_timer(self, hdr, setup_proj):
        cid, pid = setup_proj
        r = requests.post(f"{BASE_URL}/api/time-entries/start", headers=hdr, json={"project_id": pid, "description": "TEST_run"}, timeout=15)
        assert r.status_code == 200 and r.json()["end_time"] is None
        # Active
        r = requests.get(f"{BASE_URL}/api/time-entries/active", headers=hdr, timeout=15)
        assert r.status_code == 200 and r.json() is not None
        # Stop
        import time; time.sleep(1.2)
        r = requests.post(f"{BASE_URL}/api/time-entries/stop", headers=hdr, json={}, timeout=15)
        assert r.status_code == 200 and r.json()["duration_seconds"] >= 1
        # Active should be null
        r = requests.get(f"{BASE_URL}/api/time-entries/active", headers=hdr, timeout=15)
        assert r.status_code == 200 and r.json() is None

    def test_start_stops_running(self, hdr, setup_proj):
        _, pid = setup_proj
        requests.post(f"{BASE_URL}/api/time-entries/start", headers=hdr, json={"project_id": pid}, timeout=15)
        requests.post(f"{BASE_URL}/api/time-entries/start", headers=hdr, json={"project_id": pid}, timeout=15)
        # Only one active
        actives = requests.get(f"{BASE_URL}/api/time-entries", headers=hdr, timeout=15).json()
        running = [e for e in actives if e.get("end_time") is None]
        assert len(running) == 1
        requests.post(f"{BASE_URL}/api/time-entries/stop", headers=hdr, json={}, timeout=15)

    def test_manual_entry_crud_and_filter(self, hdr, setup_proj):
        _, pid = setup_proj
        st = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        et = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        r = requests.post(f"{BASE_URL}/api/time-entries", headers=hdr, json={"project_id": pid, "description": "TEST_m", "start_time": st, "end_time": et}, timeout=15)
        assert r.status_code == 200
        e = r.json()
        assert 3500 <= e["duration_seconds"] <= 3700
        eid = e["id"]
        # Update
        new_et = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        r = requests.put(f"{BASE_URL}/api/time-entries/{eid}", headers=hdr, json={"end_time": new_et}, timeout=15)
        assert r.status_code == 200 and r.json()["duration_seconds"] > 3700
        # filter
        start_q = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        end_q = datetime.now(timezone.utc).isoformat()
        r = requests.get(f"{BASE_URL}/api/time-entries", headers=hdr, params={"start": start_q, "end": end_q}, timeout=15)
        assert r.status_code == 200 and any(x["id"] == eid for x in r.json())
        # delete
        r = requests.delete(f"{BASE_URL}/api/time-entries/{eid}", headers=hdr, timeout=15)
        assert r.status_code == 200


# ---------- Dashboard + CSV ----------
class TestDashboardAndCsv:
    def test_dashboard_summary(self, hdr):
        c = requests.post(f"{BASE_URL}/api/clients", headers=hdr, json={"name": "TEST_C_D", "hourly_rate": 50.0}, timeout=15).json()
        p = requests.post(f"{BASE_URL}/api/projects", headers=hdr, json={"name": "TEST_P_D", "client_id": c["id"], "hourly_rate": 100.0}, timeout=15).json()
        st = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        et = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        requests.post(f"{BASE_URL}/api/time-entries", headers=hdr, json={"project_id": p["id"], "start_time": st, "end_time": et, "description": "TEST"}, timeout=15)
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_seconds", "total_amount", "by_client", "by_project", "daily"]:
            assert k in d
        assert d["total_seconds"] >= 3600
        # 1 hour * 100/h = 100 (project rate overrides client rate)
        assert d["total_amount"] >= 100.0
        requests.delete(f"{BASE_URL}/api/clients/{c['id']}", headers=hdr, timeout=15)

    def test_csv_export(self, hdr):
        r = requests.get(f"{BASE_URL}/api/export/csv", headers={"Authorization": hdr["Authorization"]}, timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
        assert ";" in r.text
        assert "Datum" in r.text and "Kunde" in r.text


# ---------- Cascade delete ----------
class TestCascade:
    def test_cascade_delete_client(self, hdr):
        c = requests.post(f"{BASE_URL}/api/clients", headers=hdr, json={"name": "TEST_Cascade", "hourly_rate": 10.0}, timeout=15).json()
        p = requests.post(f"{BASE_URL}/api/projects", headers=hdr, json={"name": "TEST_PCasc", "client_id": c["id"]}, timeout=15).json()
        st = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        et = datetime.now(timezone.utc).isoformat()
        e = requests.post(f"{BASE_URL}/api/time-entries", headers=hdr, json={"project_id": p["id"], "start_time": st, "end_time": et}, timeout=15).json()
        requests.delete(f"{BASE_URL}/api/clients/{c['id']}", headers=hdr, timeout=15)
        # Project gone
        projs = requests.get(f"{BASE_URL}/api/projects", headers=hdr, timeout=15).json()
        assert not any(x["id"] == p["id"] for x in projs)
        # Entry gone
        entries = requests.get(f"{BASE_URL}/api/time-entries", headers=hdr, timeout=15).json()
        assert not any(x["id"] == e["id"] for x in entries)

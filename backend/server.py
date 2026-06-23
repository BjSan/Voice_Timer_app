from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import csv
import uuid
import logging
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# Models
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ClientIn(BaseModel):
    name: str
    hourly_rate: float = 0.0
    color: Optional[str] = "#FF3B30"


class ClientOut(ClientIn):
    id: str
    user_id: str
    created_at: str


class ProjectIn(BaseModel):
    name: str
    client_id: str
    hourly_rate: Optional[float] = None
    color: Optional[str] = "#18181B"


class ProjectOut(ProjectIn):
    id: str
    user_id: str
    created_at: str


class TimeEntryIn(BaseModel):
    project_id: str
    description: Optional[str] = ""
    start_time: str
    end_time: Optional[str] = None


class TimeEntryUpdate(BaseModel):
    project_id: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class StartTimerIn(BaseModel):
    project_id: str
    description: Optional[str] = ""


# App
app = FastAPI()
api = APIRouter(prefix="/api")


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


# ---- Auth ----
@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name or email.split("@")[0],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    return {"id": user_id, "email": email, "name": doc["name"], "token": token}


@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"id": user["id"], "email": email, "name": user.get("name", ""), "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ---- Clients ----
@api.get("/clients", response_model=List[ClientOut])
async def list_clients(user=Depends(get_current_user)):
    items = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(1000)
    return items


@api.post("/clients", response_model=ClientOut)
async def create_client(data: ClientIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": data.name,
        "hourly_rate": data.hourly_rate,
        "color": data.color or "#FF3B30",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/clients/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, data: ClientIn, user=Depends(get_current_user)):
    await db.clients.update_one(
        {"id": client_id, "user_id": user["id"]},
        {"$set": {"name": data.name, "hourly_rate": data.hourly_rate, "color": data.color}},
    )
    doc = await db.clients.find_one({"id": client_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Client not found")
    return doc


@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    await db.clients.delete_one({"id": client_id, "user_id": user["id"]})
    # Also delete related projects & time entries
    project_ids = [p["id"] async for p in db.projects.find({"user_id": user["id"], "client_id": client_id}, {"id": 1})]
    await db.projects.delete_many({"user_id": user["id"], "client_id": client_id})
    if project_ids:
        await db.time_entries.delete_many({"user_id": user["id"], "project_id": {"$in": project_ids}})
    return {"ok": True}


# ---- Projects ----
@api.get("/projects", response_model=List[ProjectOut])
async def list_projects(user=Depends(get_current_user)):
    items = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(1000)
    return items


@api.post("/projects", response_model=ProjectOut)
async def create_project(data: ProjectIn, user=Depends(get_current_user)):
    cli = await db.clients.find_one({"id": data.client_id, "user_id": user["id"]})
    if not cli:
        raise HTTPException(404, "Client not found")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_id": data.client_id,
        "name": data.name,
        "hourly_rate": data.hourly_rate,
        "color": data.color or "#18181B",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, data: ProjectIn, user=Depends(get_current_user)):
    await db.projects.update_one(
        {"id": project_id, "user_id": user["id"]},
        {"$set": {"name": data.name, "client_id": data.client_id, "hourly_rate": data.hourly_rate, "color": data.color}},
    )
    doc = await db.projects.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user=Depends(get_current_user)):
    await db.projects.delete_one({"id": project_id, "user_id": user["id"]})
    await db.time_entries.delete_many({"user_id": user["id"], "project_id": project_id})
    return {"ok": True}


# ---- Time entries ----
def _duration_sec(start_iso: str, end_iso: Optional[str]) -> int:
    if not end_iso:
        return 0
    s = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    e = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    return max(0, int((e - s).total_seconds()))


@api.get("/time-entries")
async def list_entries(
    user=Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
    project_id: Optional[str] = None,
):
    q = {"user_id": user["id"]}
    if project_id:
        q["project_id"] = project_id
    if start or end:
        q["start_time"] = {}
        if start:
            q["start_time"]["$gte"] = start
        if end:
            q["start_time"]["$lte"] = end
    items = await db.time_entries.find(q, {"_id": 0}).sort("start_time", -1).to_list(5000)
    return items


@api.get("/time-entries/active")
async def active_entry(user=Depends(get_current_user)):
    doc = await db.time_entries.find_one(
        {"user_id": user["id"], "end_time": None}, {"_id": 0}
    )
    return doc


@api.post("/time-entries/start")
async def start_timer(data: StartTimerIn, user=Depends(get_current_user)):
    # Stop any currently running
    await db.time_entries.update_many(
        {"user_id": user["id"], "end_time": None},
        {"$set": {"end_time": datetime.now(timezone.utc).isoformat()}},
    )
    # Recompute duration for the stopped ones
    async for d in db.time_entries.find({"user_id": user["id"], "duration_seconds": 0}):
        if d.get("end_time"):
            await db.time_entries.update_one(
                {"id": d["id"]},
                {"$set": {"duration_seconds": _duration_sec(d["start_time"], d["end_time"])}},
            )
    proj = await db.projects.find_one({"id": data.project_id, "user_id": user["id"]})
    if not proj:
        raise HTTPException(404, "Project not found")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "project_id": data.project_id,
        "client_id": proj["client_id"],
        "description": data.description or "",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "end_time": None,
        "duration_seconds": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.time_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/time-entries/stop")
async def stop_timer(user=Depends(get_current_user)):
    active = await db.time_entries.find_one({"user_id": user["id"], "end_time": None})
    if not active:
        raise HTTPException(404, "No active timer")
    end_iso = datetime.now(timezone.utc).isoformat()
    dur = _duration_sec(active["start_time"], end_iso)
    await db.time_entries.update_one(
        {"id": active["id"]},
        {"$set": {"end_time": end_iso, "duration_seconds": dur}},
    )
    active["end_time"] = end_iso
    active["duration_seconds"] = dur
    active.pop("_id", None)
    return active


@api.post("/time-entries")
async def create_entry(data: TimeEntryIn, user=Depends(get_current_user)):
    proj = await db.projects.find_one({"id": data.project_id, "user_id": user["id"]})
    if not proj:
        raise HTTPException(404, "Project not found")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "project_id": data.project_id,
        "client_id": proj["client_id"],
        "description": data.description or "",
        "start_time": data.start_time,
        "end_time": data.end_time,
        "duration_seconds": _duration_sec(data.start_time, data.end_time),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.time_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/time-entries/{entry_id}")
async def update_entry(entry_id: str, data: TimeEntryUpdate, user=Depends(get_current_user)):
    existing = await db.time_entries.find_one({"id": entry_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "start_time" in update or "end_time" in update:
        st = update.get("start_time", existing["start_time"])
        et = update.get("end_time", existing.get("end_time"))
        update["duration_seconds"] = _duration_sec(st, et) if et else 0
    if update:
        await db.time_entries.update_one({"id": entry_id, "user_id": user["id"]}, {"$set": update})
    doc = await db.time_entries.find_one({"id": entry_id, "user_id": user["id"]}, {"_id": 0})
    return doc


@api.delete("/time-entries/{entry_id}")
async def delete_entry(entry_id: str, user=Depends(get_current_user)):
    await db.time_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    return {"ok": True}


# ---- Dashboard ----
@api.get("/dashboard/summary")
async def dashboard_summary(
    user=Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    q = {"user_id": user["id"], "end_time": {"$ne": None}}
    if start or end:
        q["start_time"] = {}
        if start:
            q["start_time"]["$gte"] = start
        if end:
            q["start_time"]["$lte"] = end

    entries = await db.time_entries.find(q, {"_id": 0}).to_list(10000)
    clients = {c["id"]: c async for c in db.clients.find({"user_id": user["id"]}, {"_id": 0})}
    projects = {p["id"]: p async for p in db.projects.find({"user_id": user["id"]}, {"_id": 0})}

    by_client = {}
    by_project = {}
    total_seconds = 0
    total_amount = 0.0

    for e in entries:
        dur = e.get("duration_seconds", 0) or 0
        total_seconds += dur
        proj = projects.get(e["project_id"])
        cli = clients.get(e.get("client_id"))
        rate = max(
            (proj.get("hourly_rate") or 0) if proj else 0,
            (cli.get("hourly_rate") or 0) if cli else 0,
        )
        amount = (dur / 3600.0) * rate
        total_amount += amount

        ckey = e.get("client_id") or "unassigned"
        by_client.setdefault(ckey, {
            "client_id": ckey,
            "client_name": cli["name"] if cli else "Unbekannt",
            "color": cli.get("color", "#FF3B30") if cli else "#FF3B30",
            "seconds": 0, "amount": 0.0,
        })
        by_client[ckey]["seconds"] += dur
        by_client[ckey]["amount"] += amount

        pkey = e["project_id"]
        by_project.setdefault(pkey, {
            "project_id": pkey,
            "project_name": proj["name"] if proj else "Unbekannt",
            "client_name": cli["name"] if cli else "Unbekannt",
            "color": proj.get("color", "#18181B") if proj else "#18181B",
            "seconds": 0, "amount": 0.0,
        })
        by_project[pkey]["seconds"] += dur
        by_project[pkey]["amount"] += amount

    # Daily breakdown for last period
    daily = {}
    for e in entries:
        day = e["start_time"][:10]
        daily.setdefault(day, 0)
        daily[day] += e.get("duration_seconds", 0) or 0
    daily_list = [{"date": k, "seconds": v} for k, v in sorted(daily.items())]

    return {
        "total_seconds": total_seconds,
        "total_amount": round(total_amount, 2),
        "entries_count": len(entries),
        "by_client": list(by_client.values()),
        "by_project": list(by_project.values()),
        "daily": daily_list,
    }


# ---- CSV Export ----
@api.get("/export/csv")
async def export_csv(
    user=Depends(get_current_user),
    start: Optional[str] = None,
    end: Optional[str] = None,
    client_id: Optional[str] = None,
    project_id: Optional[str] = None,
):
    q = {"user_id": user["id"], "end_time": {"$ne": None}}
    if client_id:
        q["client_id"] = client_id
    if project_id:
        q["project_id"] = project_id
    if start or end:
        q["start_time"] = {}
        if start:
            q["start_time"]["$gte"] = start
        if end:
            q["start_time"]["$lte"] = end
    entries = await db.time_entries.find(q, {"_id": 0}).sort("start_time", 1).to_list(10000)
    clients = {c["id"]: c async for c in db.clients.find({"user_id": user["id"]}, {"_id": 0})}
    projects = {p["id"]: p async for p in db.projects.find({"user_id": user["id"]}, {"_id": 0})}

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["Datum", "Start", "Ende", "Dauer (h)", "Kunde", "Projekt", "Beschreibung", "Stundensatz", "Betrag"])
    for e in entries:
        proj = projects.get(e["project_id"], {})
        cli = clients.get(e.get("client_id"), {})
        rate = max(
            (proj.get("hourly_rate") or 0),
            (cli.get("hourly_rate") or 0),
        )
        hours = (e.get("duration_seconds", 0) or 0) / 3600.0
        amount = hours * rate
        st = e["start_time"]
        et = e.get("end_time") or ""
        writer.writerow([
            st[:10],
            st[11:16],
            et[11:16] if et else "",
            f"{hours:.2f}".replace(".", ","),
            cli.get("name", ""),
            proj.get("name", ""),
            e.get("description", ""),
            f"{rate:.2f}".replace(".", ","),
            f"{amount:.2f}".replace(".", ","),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=zeiterfassung.csv"},
    )


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # using Bearer token from localStorage for cross-origin compatibility
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index([("user_id", 1), ("name", 1)])
    await db.projects.create_index([("user_id", 1), ("client_id", 1)])
    await db.time_entries.create_index([("user_id", 1), ("start_time", -1)])

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@timetrack.app").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )


@app.on_event("shutdown")
async def shutdown():
    client.close()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

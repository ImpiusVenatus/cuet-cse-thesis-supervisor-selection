"""FastAPI application entry (run from backend: `fastapi dev app/main.py`)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.migrate import run_migrations_to_head
from app.routers import batches, supervisors, students, session, allocation
from app.websocket.handler import websocket_endpoint


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations_to_head()
    yield


app = FastAPI(
    title="CUET CSE Thesis Supervisor Selection System",
    description="Real-time supervisor allocation system for thesis ceremonies",
    version="1.0.0",
    lifespan=lifespan,
    # Avoid trailing-slash redirects (breaks POST + browser CORS on cross-origin callers).
    redirect_slashes=False,
)

_settings = get_settings()
_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
]
for _chunk in (_settings.cors_origins_extra or "").split(","):
    _o = _chunk.strip()
    if _o and _o not in _cors_origins:
        _cors_origins.append(_o)

# In development, tolerate other host:port combos (LAN IP access to Next, alternate ports).
_cors_regex = None
if (_settings.environment or "").lower() in ("development", "dev"):
    _cors_regex = (
        r"https?://(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\:\d+$"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(batches.router)
app.include_router(supervisors.router)
app.include_router(students.router)
app.include_router(session.router)
app.include_router(allocation.router)

app.add_websocket_route("/ws", websocket_endpoint)


@app.get("/")
def root():
    return {
        "message": "CUET CSE Thesis Supervisor Selection System API",
        "docs": "/docs",
        "websocket": "/ws",
    }


@app.get("/health")
def health():
    return {"status": "ok"}

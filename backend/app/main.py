"""FastAPI application entry (run from backend: `fastapi dev app/main.py`)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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

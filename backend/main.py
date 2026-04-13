"""Main FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import engine, Base
from app.routers import supervisors, students, session, allocation
from app.websocket.handler import websocket_endpoint

# Create tables on startup (fallback if alembic not used)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CUET CSE Thesis Supervisor Selection System",
    description="Real-time supervisor allocation system for thesis ceremonies",
    version="1.0.0",
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(supervisors.router)
app.include_router(students.router)
app.include_router(session.router)
app.include_router(allocation.router)

# WebSocket endpoint
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

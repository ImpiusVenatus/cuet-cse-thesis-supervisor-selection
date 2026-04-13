"""WebSocket handler for real-time updates."""

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
import json
import asyncio

from app.models.models import Supervisor, Student, SessionConfig


class ConnectionManager:
    """Manages WebSocket connections."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        # Clean up disconnected
        for conn in disconnected:
            self.active_connections.remove(conn)

    async def send_slot_update(self, supervisor: Supervisor):
        await self.broadcast({
            "type": "slot_update",
            "data": {
                "supervisor_id": supervisor.id,
                "supervisor_name": supervisor.name,
                "choice_filled": supervisor.choice_filled,
                "choice_capacity": supervisor.choice_capacity,
                "lottery_filled": supervisor.lottery_filled,
                "lottery_capacity": supervisor.lottery_capacity,
                "is_available": supervisor.is_available,
            }
        })

    async def send_queue_advance(self, queue_state: dict):
        await self.broadcast({
            "type": "queue_advance",
            "data": queue_state,
        })

    async def send_assignment_made(self, student: Student, supervisor: Supervisor):
        await self.broadcast({
            "type": "assignment_made",
            "data": {
                "student_id": student.id,
                "student_name": student.name,
                "supervisor_id": supervisor.id,
                "supervisor_name": supervisor.name,
                "assignment_type": student.assignment_type,
            }
        })

    async def send_phase_change(self, new_phase: str):
        await self.broadcast({
            "type": "phase_change",
            "data": {
                "new_phase": new_phase,
            }
        })

    async def send_supervisor_update(self, supervisor: Supervisor):
        await self.broadcast({
            "type": "supervisor_update",
            "data": {
                "supervisor_id": supervisor.id,
                "name": supervisor.name,
                "is_available": supervisor.is_available,
                "choice_filled": supervisor.choice_filled,
                "lottery_filled": supervisor.lottery_filled,
            }
        })


# Global manager instance
manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive - client may send ping
            data = await websocket.receive_text()
            # Handle ping/pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


def get_manager():
    """Get the connection manager."""
    return manager

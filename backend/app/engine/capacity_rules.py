"""Supervisor quota rules — shared single-seat (lecturers with one student in either phase)."""

from __future__ import annotations

from app.models.models import Supervisor, SupervisorUsage


def uses_shared_single_seat(supervisor: Supervisor) -> bool:
    """
    Exactly one supervisee total; the seat may be filled in choice or lottery.

    Encode as total_capacity == 1 with both phase quotas ≥ 1 (typically 1/1/1).

    Exclusive choice-only seat: total 1, choice 1, lottery 0 — not shared.
    Exclusive lottery-only: total 1, choice 0, lottery 1 — not shared.
    """

    return (
        supervisor.total_capacity == 1
        and supervisor.choice_capacity >= 1
        and supervisor.lottery_capacity >= 1
    )


def combined_used(usage: SupervisorUsage) -> int:
    return usage.choice_filled + usage.lottery_filled


def has_room_for_choice(supervisor: Supervisor, usage: SupervisorUsage) -> bool:
    if combined_used(usage) >= supervisor.total_capacity:
        return False
    if uses_shared_single_seat(supervisor):
        return True
    return usage.choice_filled < supervisor.choice_capacity


def has_room_for_lottery(supervisor: Supervisor, usage: SupervisorUsage) -> bool:
    if combined_used(usage) >= supervisor.total_capacity:
        return False
    if uses_shared_single_seat(supervisor):
        return True
    return usage.lottery_filled < supervisor.lottery_capacity

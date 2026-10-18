"""Pure trip-progress transitions and guarded itinerary revision proposals."""

from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Callable
from datetime import datetime, timezone

from planner import PlannerError, validate_schema


def create_trip_state(trip_id: str, plan: dict, created_at: str | None = None) -> dict:
    validate_schema(plan, "trip-plan.schema.json")
    if not trip_id.strip():
        raise PlannerError("trip_id_required")
    if plan["status"] != "draft":
        raise PlannerError("new_trip_requires_draft_plan")
    state = {
        "schemaVersion": "1.0",
        "tripId": trip_id,
        "revision": 1,
        "status": "draft",
        "activePlanRevision": plan["revision"],
        "completedPoiIds": [],
        "skippedPoiIds": [],
        "confirmedItems": [],
        "locationPolicy": "none",
        "updatedAt": created_at or datetime.now(timezone.utc).isoformat(),
        "extensions": {"appliedEventIds": []},
    }
    validate_schema(state, "trip-state.schema.json")
    return state


def apply_trip_event(state: dict, plan: dict, event: dict) -> dict:
    validate_schema(state, "trip-state.schema.json")
    validate_schema(plan, "trip-plan.schema.json")
    validate_schema(event, "trip-event.schema.json")
    if event["tripId"] != state["tripId"]:
        raise PlannerError("trip_event_id_mismatch")
    applied_ids = state.get("extensions", {}).get("appliedEventIds", [])
    if event["eventId"] in applied_ids:
        prior_digest = state.get("extensions", {}).get("appliedEventDigests", {}).get(event["eventId"])
        if prior_digest != _event_digest(event):
            raise PlannerError("trip_event_id_reused")
        return copy.deepcopy(state)
    if event["expectedStateRevision"] != state["revision"]:
        raise PlannerError("trip_state_revision_conflict")
    if plan["revision"] != state["activePlanRevision"]:
        raise PlannerError("active_plan_revision_mismatch")

    updated = copy.deepcopy(state)
    event_type = event["eventType"]
    payload = event["payload"]
    stop_ids = {
        stop["poiId"]
        for day in plan["days"]
        for stop in day["stops"]
    }

    if event_type == "trip_confirmed":
        if updated["status"] != "draft":
            raise PlannerError("trip_cannot_be_confirmed_from_current_state")
        updated["status"] = "confirmed"
    elif event_type in {"stop_completed", "stop_skipped"}:
        _apply_stop_event(updated, stop_ids, event_type, payload["poiId"])
        updated["status"] = "in_progress"
    elif event_type == "delay_reported":
        if updated["status"] not in {"confirmed", "in_progress"}:
            raise PlannerError("delay_requires_confirmed_trip")
        updated["delayMinutes"] = updated.get("delayMinutes", 0) + payload["delayMinutes"]
        updated["status"] = "in_progress"
    elif event_type == "trip_completed":
        if updated["status"] not in {"confirmed", "in_progress"}:
            raise PlannerError("trip_completion_requires_active_trip")
        handled_ids = set(updated["completedPoiIds"]) | set(updated["skippedPoiIds"])
        if stop_ids - handled_ids:
            raise PlannerError("trip_has_unresolved_stops")
        updated["status"] = "completed"
    elif event_type == "trip_cancelled":
        if updated["status"] in {"completed", "cancelled"}:
            raise PlannerError("trip_is_already_terminal")
        updated["status"] = "cancelled"
    elif event_type == "plan_revision_accepted":
        raise PlannerError("revision_acceptance_requires_proposal")

    updated["revision"] += 1
    updated["updatedAt"] = event["occurredAt"]
    updated.setdefault("extensions", {}).setdefault("appliedEventIds", []).append(event["eventId"])
    updated["extensions"].setdefault("appliedEventDigests", {})[event["eventId"]] = _event_digest(event)
    validate_schema(updated, "trip-state.schema.json")
    return updated


def _apply_stop_event(state: dict, plan_stop_ids: set[str], event_type: str, poi_id: str) -> None:
    if state["status"] not in {"confirmed", "in_progress"}:
        raise PlannerError("stop_update_requires_confirmed_trip")
    if poi_id not in plan_stop_ids:
        raise PlannerError("trip_event_references_unknown_stop")
    opposite = state["skippedPoiIds"] if event_type == "stop_completed" else state["completedPoiIds"]
    target = state["completedPoiIds"] if event_type == "stop_completed" else state["skippedPoiIds"]
    if poi_id in opposite:
        raise PlannerError("stop_already_has_opposite_status")
    if poi_id not in target:
        target.append(poi_id)

    for item in state["confirmedItems"]:
        if item["itemId"] == poi_id and item["kind"] == "user_confirmed_stop":
            item["status"] = "completed" if event_type == "stop_completed" else "cancelled"


def propose_plan_revision(
    state: dict,
    current_plan: dict,
    candidate_plan: dict,
    validate_route: Callable[[dict], bool],
    validate_pois: Callable[[dict], bool],
) -> dict:
    """Preserve fixed stops, then require route and POI validation on the merged proposal."""
    validate_schema(state, "trip-state.schema.json")
    validate_schema(current_plan, "trip-plan.schema.json")
    validate_schema(candidate_plan, "trip-plan.schema.json")
    if state["activePlanRevision"] != current_plan["revision"]:
        raise PlannerError("active_plan_revision_mismatch")
    if state["status"] not in {"confirmed", "in_progress"}:
        raise PlannerError("replan_requires_active_trip")
    if candidate_plan["requestId"] != current_plan["requestId"]:
        raise PlannerError("candidate_request_mismatch")
    if candidate_plan["status"] != "draft":
        raise PlannerError("candidate_plan_must_be_draft")

    fixed_ids = set(state["completedPoiIds"])
    fixed_ids.update(
        item["itemId"]
        for item in state["confirmedItems"]
        if item["kind"] == "user_confirmed_stop" and item["status"] == "confirmed"
    )
    current_stops = _stops_by_id(current_plan)
    if fixed_ids - set(current_stops):
        raise PlannerError("fixed_stop_missing_from_current_plan")

    proposal = copy.deepcopy(candidate_plan)
    day_by_number = {day["dayNumber"]: day for day in proposal["days"]}
    for day in proposal["days"]:
        day["stops"] = [
            stop for stop in day["stops"] if stop["poiId"] not in state["skippedPoiIds"]
        ]
    for poi_id in sorted(fixed_ids):
        old_day, old_stop = current_stops[poi_id]
        for day in proposal["days"]:
            day["stops"] = [stop for stop in day["stops"] if stop["poiId"] != poi_id]
        if old_day not in day_by_number:
            raise PlannerError("candidate_missing_fixed_stop_day")
        day_by_number[old_day]["stops"].append(copy.deepcopy(old_stop))

    for day in proposal["days"]:
        day["stops"].sort(key=lambda stop: (stop["arrival"], stop["poiId"]))
    proposal["revision"] = current_plan["revision"] + 1
    proposal["status"] = "draft"
    if not validate_pois(proposal):
        raise PlannerError("candidate_poi_validation_failed")
    if not validate_route(proposal):
        raise PlannerError("candidate_route_validation_failed")

    current_ids = set(current_stops)
    proposed_stops = _stops_by_id(proposal)
    proposed_ids = set(proposed_stops)
    rescheduled_ids = sorted(
        poi_id
        for poi_id in current_ids & proposed_ids
        if current_stops[poi_id][1]["arrival"] != proposed_stops[poi_id][1]["arrival"]
        or current_stops[poi_id][1]["departure"] != proposed_stops[poi_id][1]["departure"]
    )
    fixed_stop_ids = sorted(fixed_ids)
    proposal.setdefault("extensions", {}).update(
        {
            "poiValidation": "passed",
            "routeLegValidation": "passed",
            "preservedPoiIds": fixed_stop_ids,
            "revisionDiff": {
                "addedPoiIds": sorted(proposed_ids - current_ids),
                "removedPoiIds": sorted(current_ids - proposed_ids),
                "rescheduledPoiIds": rescheduled_ids,
                "preservedPoiIds": fixed_stop_ids,
                "confirmedItems": copy.deepcopy(state["confirmedItems"]),
            },
        }
    )
    validate_schema(proposal, "trip-plan.schema.json")
    return proposal


def accept_plan_revision(state: dict, current_plan: dict, proposal: dict, event: dict) -> tuple[dict, dict]:
    validate_schema(state, "trip-state.schema.json")
    validate_schema(current_plan, "trip-plan.schema.json")
    validate_schema(proposal, "trip-plan.schema.json")
    validate_schema(event, "trip-event.schema.json")
    if event["eventType"] != "plan_revision_accepted":
        raise PlannerError("expected_revision_acceptance_event")
    if event["tripId"] != state["tripId"]:
        raise PlannerError("trip_event_id_mismatch")
    if event["eventId"] in state.get("extensions", {}).get("appliedEventIds", []):
        digest = state.get("extensions", {}).get("appliedEventDigests", {}).get(event["eventId"])
        if digest != _event_digest(event):
            raise PlannerError("trip_event_id_reused")
        if state["activePlanRevision"] == proposal["revision"]:
            active_plan = copy.deepcopy(proposal)
            active_plan["status"] = "in_progress"
            return copy.deepcopy(state), active_plan
        raise PlannerError("revision_acceptance_replay_conflict")
    if event["expectedStateRevision"] != state["revision"]:
        raise PlannerError("trip_state_revision_conflict")
    if state["status"] not in {"confirmed", "in_progress"}:
        raise PlannerError("replan_requires_active_trip")
    if (
        current_plan["revision"] != state["activePlanRevision"]
        or proposal["requestId"] != current_plan["requestId"]
        or proposal["revision"] != current_plan["revision"] + 1
        or event["payload"]["planRevision"] != proposal["revision"]
    ):
        raise PlannerError("plan_revision_mismatch")
    if (
        proposal.get("extensions", {}).get("poiValidation") != "passed"
        or proposal.get("extensions", {}).get("routeLegValidation") != "passed"
    ):
        raise PlannerError("unvalidated_revision_cannot_be_activated")

    activated_plan = copy.deepcopy(proposal)
    activated_plan["status"] = "in_progress"
    updated_state = copy.deepcopy(state)
    updated_state["revision"] += 1
    updated_state["activePlanRevision"] = activated_plan["revision"]
    updated_state["status"] = "in_progress"
    updated_state["updatedAt"] = event["occurredAt"]
    updated_state.setdefault("extensions", {}).setdefault("appliedEventIds", []).append(event["eventId"])
    updated_state["extensions"].setdefault("appliedEventDigests", {})[event["eventId"]] = _event_digest(event)
    validate_schema(activated_plan, "trip-plan.schema.json")
    validate_schema(updated_state, "trip-state.schema.json")
    return updated_state, activated_plan


def _stops_by_id(plan: dict) -> dict[str, tuple[int, dict]]:
    stops = {}
    for day in plan["days"]:
        for stop in day["stops"]:
            poi_id = stop["poiId"]
            if poi_id in stops:
                raise PlannerError("plan_repeats_poi")
            stops[poi_id] = (day["dayNumber"], stop)
    return stops


def _event_digest(event: dict) -> str:
    serialized = json.dumps(event, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

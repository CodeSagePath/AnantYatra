"""Shared schema-valid fixtures for planner evaluation tests."""

from test_planner import encode_polyline, poi_record, source_record


def make_evaluation_case() -> dict:
    source_id = "evaluation-source"
    route_points = [
        (12.95, 77.6),
        (12.95, 77.0),
        (12.95, 76.4),
        (12.95, 75.8),
        (12.95, 75.2),
        (12.95, 74.8),
    ]
    route = {
        "schemaVersion": "1.0",
        "routeId": "evaluation-route",
        "engine": {"name": "Valhalla", "version": "evaluation-fixture"},
        "snapshotId": "evaluation-route-snapshot",
        "distanceMeters": 350_000,
        "durationSeconds": 8 * 60 * 60,
        "geometry": encode_polyline(route_points),
        "legs": [
            {
                "from": "origin",
                "to": "destination",
                "distanceMeters": 350_000,
                "durationSeconds": 8 * 60 * 60,
            }
        ],
    }
    request = {
        "schemaVersion": "1.0",
        "requestId": "evaluation-request",
        "origin": {"label": "origin", "latitude": 12.95, "longitude": 77.6},
        "destination": {"label": "destination", "latitude": 12.95, "longitude": 74.8},
        "startDate": "2026-11-01",
        "durationDays": 3,
        "travelerCount": 2,
        "vehicle": {"mode": "car"},
        "preferences": {
            "interests": ["food"],
            "food": [],
            "requiredFacilities": ["toilets"],
            "avoid": [],
            "pace": "balanced",
            "accommodationNeeded": False,
        },
        "safety": {"profile": "balanced"},
    }
    on_route = poi_record("evaluation-on-route", source_id, 12.95, 77.2)
    on_route["facilities"] = {"toilets": "available"}
    return {
        "schemaVersion": "1.0",
        "caseId": "synthetic-route-grounding",
        "input": {
            "request": request,
            "route": route,
            "pois": [on_route],
            "sources": [source_record(source_id)],
        },
        "expectations": {
            "exactPoiIds": ["evaluation-on-route"],
            "forbiddenPoiIds": [],
            "expectedRequirementGaps": [],
        },
        "extensions": {
            "humanReview": {
                "status": "approved",
                "reviewerToken": "evaluation-reviewer-token",
                "reviewedAt": "2026-10-18T12:00:00Z",
            }
        },
    }

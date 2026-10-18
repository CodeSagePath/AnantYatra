"""Scenario checks for progress events and guarded plan revisions."""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_planner import source_record  # noqa: E402
from planner import PlannerError, plan_trip  # noqa: E402
from trip_lifecycle import (  # noqa: E402
    accept_plan_revision,
    apply_trip_event,
    create_trip_state,
    propose_plan_revision,
)


class TripLifecycleTests(unittest.TestCase):
    def setUp(self):
        from test_planner import PlannerScenarioTests

        fixture = PlannerScenarioTests()
        fixture.setUp()
        self.fixture = fixture
        self.fixture.pois[0]["facilities"] = {"toilets": "available"}
        self.plan = plan_trip(
            self.fixture.request,
            self.fixture.route,
            self.fixture.pois[:1],
            [source_record(self.fixture.source_id)],
            self.fixture.config,
        )
        self.poi_id = self.plan["days"][0]["stops"][0]["poiId"]
        self.state = create_trip_state(
            "trip-lifecycle-test",
            self.plan,
            "2026-11-01T08:00:00Z",
        )

    @staticmethod
    def event(event_id, trip_id, event_type, expected_revision, payload=None):
        return {
            "schemaVersion": "1.0",
            "eventId": event_id,
            "tripId": trip_id,
            "eventType": event_type,
            "occurredAt": "2026-11-01T09:00:00Z",
            "expectedStateRevision": expected_revision,
            "payload": payload or {},
        }

    def test_completion_event_moves_trip_to_progress_and_is_idempotent(self):
        confirmed = apply_trip_event(
            self.state,
            self.plan,
            self.event("confirm-1", self.state["tripId"], "trip_confirmed", 1),
        )
        completed_event = self.event(
            "complete-1", self.state["tripId"], "stop_completed", 2, {"poiId": self.poi_id}
        )
        progressed = apply_trip_event(confirmed, self.plan, completed_event)
        replayed = apply_trip_event(progressed, self.plan, completed_event)

        self.assertEqual(progressed["status"], "in_progress")
        self.assertEqual(progressed["completedPoiIds"], [self.poi_id])
        self.assertEqual(replayed, progressed)

        conflicting_replay = copy.deepcopy(completed_event)
        conflicting_replay["payload"]["poiId"] = "different-poi"
        with self.assertRaisesRegex(PlannerError, "trip_event_id_reused"):
            apply_trip_event(progressed, self.plan, conflicting_replay)

    def test_delay_requires_active_trip_and_updates_only_trip_state(self):
        delay = self.event(
            "delay-1", self.state["tripId"], "delay_reported", 1, {"delayMinutes": 90}
        )
        with self.assertRaises(PlannerError):
            apply_trip_event(self.state, self.plan, delay)

        confirmed = apply_trip_event(
            self.state,
            self.plan,
            self.event("confirm-1", self.state["tripId"], "trip_confirmed", 1),
        )
        delay["expectedStateRevision"] = confirmed["revision"]
        progressed = apply_trip_event(confirmed, self.plan, delay)

        self.assertEqual(progressed["delayMinutes"], 90)
        self.assertNotIn("currentLocation", progressed)

    def test_rejects_stale_state_revision(self):
        event = self.event("confirm-1", self.state["tripId"], "trip_confirmed", 3)
        with self.assertRaisesRegex(PlannerError, "trip_state_revision_conflict"):
            apply_trip_event(self.state, self.plan, event)

    def test_revision_preserves_completed_stop_and_requires_both_validators(self):
        confirmed = apply_trip_event(
            self.state,
            self.plan,
            self.event("confirm-1", self.state["tripId"], "trip_confirmed", 1),
        )
        completed = apply_trip_event(
            confirmed,
            self.plan,
            self.event("complete-1", self.state["tripId"], "stop_completed", 2, {"poiId": self.poi_id}),
        )
        candidate = copy.deepcopy(self.plan)
        candidate["days"][0]["stops"] = []
        validated = {"poi": False, "route": False}

        def validate_pois(proposal):
            validated["poi"] = any(
                stop["poiId"] == self.poi_id
                for day in proposal["days"]
                for stop in day["stops"]
            )
            return validated["poi"]

        def validate_route(proposal):
            validated["route"] = True
            return True

        proposal = propose_plan_revision(
            completed, self.plan, candidate, validate_route, validate_pois
        )
        kept_stop = proposal["days"][0]["stops"][0]
        original_stop = self.plan["days"][0]["stops"][0]

        self.assertEqual(kept_stop, original_stop)
        self.assertEqual(proposal["revision"], self.plan["revision"] + 1)
        self.assertEqual(proposal["status"], "draft")
        self.assertTrue(validated["poi"] and validated["route"])
        self.assertEqual(proposal["extensions"]["preservedPoiIds"], [self.poi_id])
        self.assertEqual(completed["activePlanRevision"], self.plan["revision"])

    def test_failed_route_validation_does_not_return_a_revision(self):
        confirmed = apply_trip_event(
            self.state,
            self.plan,
            self.event("confirm-1", self.state["tripId"], "trip_confirmed", 1),
        )
        with self.assertRaisesRegex(PlannerError, "candidate_route_validation_failed"):
            propose_plan_revision(
                confirmed,
                self.plan,
                copy.deepcopy(self.plan),
                lambda _plan: False,
                lambda _plan: True,
            )

    def test_revision_becomes_active_only_after_validated_proposal_is_accepted(self):
        confirmed = apply_trip_event(
            self.state,
            self.plan,
            self.event("confirm-1", self.state["tripId"], "trip_confirmed", 1),
        )
        proposal = propose_plan_revision(
            confirmed,
            self.plan,
            copy.deepcopy(self.plan),
            lambda _plan: True,
            lambda _plan: True,
        )
        acceptance = self.event(
            "accept-revision-2",
            self.state["tripId"],
            "plan_revision_accepted",
            confirmed["revision"],
            {"planRevision": proposal["revision"]},
        )

        active_state, active_plan = accept_plan_revision(
            confirmed, self.plan, proposal, acceptance
        )

        self.assertEqual(active_state["activePlanRevision"], 2)
        self.assertEqual(active_state["status"], "in_progress")
        self.assertEqual(active_plan["status"], "in_progress")
        self.assertEqual(self.plan["revision"], 1)

    def test_unvalidated_candidate_cannot_be_activated(self):
        confirmed = apply_trip_event(
            self.state,
            self.plan,
            self.event("confirm-1", self.state["tripId"], "trip_confirmed", 1),
        )
        proposal = copy.deepcopy(self.plan)
        proposal["revision"] = 2
        acceptance = self.event(
            "accept-revision-2",
            self.state["tripId"],
            "plan_revision_accepted",
            confirmed["revision"],
            {"planRevision": 2},
        )

        with self.assertRaisesRegex(PlannerError, "unvalidated_revision_cannot_be_activated"):
            accept_plan_revision(confirmed, self.plan, proposal, acceptance)


if __name__ == "__main__":
    unittest.main()

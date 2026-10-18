"""Configurable, versioned feedback category validation."""

from planner import PlannerError, validate_schema


def validate_feedback_event(event: dict, taxonomy: dict) -> None:
    validate_schema(event, "feedback-event.schema.json")
    validate_schema(taxonomy, "feedback-taxonomy.schema.json")
    enabled_categories = {
        category["categoryId"]
        for category in taxonomy["categories"]
        if category["enabled"]
    }
    if event["categoryId"] not in enabled_categories:
        raise PlannerError("feedback_category_not_enabled")
    if event["trainingConsent"] and not event.get("extensions", {}).get("consentRecordId"):
        raise PlannerError("feedback_training_consent_record_required")

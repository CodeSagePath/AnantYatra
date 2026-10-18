OSM data extraction environment

This virtual environment is separate from the QLoRA training environment.
Install its locked Python packages with:

    ./ai/scripts/setup-data-tools.sh

Rebuild a normalized POI snapshot with:

    ./ai/scripts/extract-osm-pois.sh

Validate the emitted JSONL against the versioned POI schema and regenerate
the snapshot manifest with:

    ./ai/scripts/validate-osm-pois.sh

The extraction config selects the input PBF, source snapshot timestamp, source
record ID, output paths, categories, and duplicate distance. The output is a
runtime POI dataset, not training data. OSM licensing and attribution rules in
ai/data/GOVERNANCE.txt apply. User-visible use and redistribution remain gated
on source-specific review.

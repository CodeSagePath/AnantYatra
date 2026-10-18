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

The current extraction config also includes bicycle repair stations, bicycle
shops, bicycle parking, and drinking-water points. These categories support
route-stop suggestions for bicycle trips. Their records remain unverified and
are filtered by the same source-use gate as all other POIs. Test extraction
rules with ./ai/scripts/test-osm-extractor.sh.

Wikidata training-source intake

Run the dated Karnataka Wikidata extract with:

    ./ai/scripts/extract-wikidata-pois.sh

Edit ai/configs/karnataka-wikidata.toml to change eligible instance-of classes,
query limits, or output directory. The script fetches English labels,
coordinates, and class IDs in a Karnataka bounding box, then checks each
item's administrative hierarchy against Karnataka (Q1185) using batched
Wikidata entity API requests. Items without that confirmation are omitted. It
does not copy article text or descriptions.

Each run writes an immutable directory under ignored
ai/data/processed/wikidata-karnataka/ with pois.jsonl, source-record.json,
report.json, SPARQL queries, API request notes, and raw source responses. The
report records hashes, exclusion counts, and the source ID. Re-run without
network access using `--response-dir /path/to/earlier/snapshot`; replay creates
a new dated output.

The source record documents the CC0 structured-data license and its internal
engineering review; it is not automatically added to source-register.jsonl.
Review the extracted facts and the source record before registering that
snapshot. POIs start as unverified, with unknown facilities, hours, and prices.
They are candidate facts, not training examples. Human-reviewed request/answer
examples and the normal dataset builder are still required before training.
The public query service can be slow or rate limited, and this extract will be
sparse for restaurants, fuel stations, and facilities. A result cap causes a
clear failure instead of silently truncating data. Use the configured request
delay and batch size responsibly.

Create a Bengaluru-centered geographic candidate subset from a downloaded
Wikidata snapshot with:

    python3 ai/scripts/subset_wikidata_radius.py \
      --snapshot ai/data/processed/wikidata-karnataka/<snapshot-id> \
      --output ai/data/processed/wikidata-bengaluru-250km/<subset-id> \
      --center-latitude 12.9716 \
      --center-longitude 77.5946 \
      --radius-km 250

The command retains source provenance and writes a manifest with input/output
hashes. This is a straight-line geographic prefilter, not a 250 km driving
range check. It creates place facts only; it does not generate training
examples, and record quality remains pending human review.

Test the extractor with ./ai/scripts/test-wikidata-extractor.sh. Official API
and licensing documentation:
https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
https://www.mediawiki.org/wiki/Wikibase/API
https://www.wikidata.org/wiki/Wikidata:Licensing

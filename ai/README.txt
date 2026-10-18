AnantYatra model training workspace

Environment

- Python environment: ai/.venv
- Separate OSM processing environment: ai/data-tools/.venv
- Hugging Face model cache: ai/model-cache
- Training outputs and adapters: ai/runs/
- GPU dependencies: ai/requirements-gpu.txt
- Exact installed dependency versions after setup: ai/requirements-gpu.lock.txt

Install the GPU stack

    ./ai/scripts/setup.sh

The setup script installs a CUDA 13.0 PyTorch wheel and the Hugging Face
training packages into ai/.venv. It does not use a CPU-only PyTorch wheel.
The installed GPU stack was verified on the GTX 1650. When a lock file exists,
setup reuses the recorded package versions.

Check GPU model loading

    ./ai/scripts/gpu-smoke.sh

Download and extract the Karnataka runtime POI snapshot

    ./ai/scripts/setup-data-tools.sh
    ./ai/scripts/download-osm-snapshot.sh
    ./ai/scripts/extract-osm-pois.sh

The snapshot downloader records the provider metadata, verifies its published
MD5, and writes a local SHA-256. Extracted POIs are written below the ignored
ai/data/processed/ directory with OSM evidence and unverified quality labels.
The PBF is a state extract without a neighboring-state buffer; see the Phase 3
report for that remaining boundary-route work.

Run the deterministic planner baseline

    ./ai/scripts/plan-trip.sh \
        --request /path/to/request.json \
        --route /path/to/route.json \
        --pois /path/to/pois.jsonl \
        --sources ai/data/source-register.jsonl \
        --output /path/to/draft-plan.json

The planner requires approved runtime_search and display permission for every
POI source. The current OSM source is pending review and is blocked from
recommendations. Planner output stays a draft until daily legs and stop
detours have been separately validated with Valhalla. Run the synthetic
scenario checks with ./ai/scripts/test-planner.sh.

The smoke command loads Qwen2.5-1.5B-Instruct in 4-bit NF4 and generates a
short response. It stops if CUDA is unavailable. It reports total and peak
GPU memory. Use --revision with an immutable model commit when available.

Train the first adapter

1. Put reviewed and permitted examples in ai/data/train.jsonl using the
   format described in ai/data/README.txt.
2. Adjust model, sequence length, optimizer settings, epochs, batch size,
   gradient accumulation, learning rate, LoRA rank, alpha, dropout, or target
   modules in ai/configs/karnataka-qlora.toml.
3. For the initial adapter, run:

       ./ai/scripts/train.sh

   Or select another TOML file:

       ./ai/scripts/train.sh ai/configs/another-run.toml

The Python source does not need to change when configuration values change.
Each run gets a timestamped directory under ai/runs/karnataka-qlora/ and saves
its adapter plus run_metadata.json with the requested and resolved base model
revisions, config, example count, and training-data hash. Re-running the same
command creates a separate run and does not overwrite a previous adapter.
Completed runs also save training_metrics.json with Trainer metrics; run metadata
records the GPU name, peak allocated/reserved VRAM, and installed GPU package
versions. Examples whose prompt plus answer exceed max_sequence_length are
rejected before training so structured answers are never silently truncated.

For a later candidate adapter, use the retraining gate instead of launching a
run directly:

    ./ai/scripts/retrain.sh \
        --config ai/configs/karnataka-qlora.toml \
        --decision /path/to/human-reviewed-retraining-decision.json \
        --dataset-dir /path/to/dataset-release \
        --evaluation-suite-dir /path/to/frozen-suite-version

The gate verifies the dataset and frozen evaluation-suite hashes, confirms the
training split count and evaluation case IDs, and requires a human-reviewed
reason. Defaults in the training TOML require 50 train examples for a data-size
trigger, or at least 10 examples plus failures in 3 distinct evaluation cases
for a recurring-failure trigger. These are conservative starting thresholds
and can be changed in TOML without editing Python. A defer decision exits
without training.

The initial training data file is intentionally not populated. The first real
training run must use examples that have passed source-rights and human quality
review. A synthetic QLoRA smoke step completed at 512 tokens, batch size 1, and
LoRA rank 4, using 3,054 MiB peak reserved VRAM. This confirms the training
path fits; it does not establish useful model quality or full-run duration.

The loader requires schema version 1.0, approved provenance, explicit training
permission, and a completed platform-brand scan. Edit ai/configs/data-policy.toml
to maintain the excluded platform terms. Hotel, restaurant, fuel station, and
attraction names remain valid when the source permits their use.

Prepare reviewed dataset splits with ./ai/scripts/build-dataset.sh. See
ai/datasets/README.txt for intake metadata, source and human-review gates,
grouped train/validation/test separation, frozen test handling, and manifest
checksums. Run ./ai/scripts/test-dataset-builder.sh for the split/freeze tests.

Run reviewed whole-planner scenarios with ./ai/scripts/evaluate-planner.sh.
The case format, report metrics, and current route-validation release gate are
described in ai/evaluation/README.txt. Run the evaluator tests with
./ai/scripts/test-planner-evaluation.sh.

The planner package also contains a pure trip lifecycle state machine for
completion, skip, delay, and validated plan revision proposals. See
ai/planner/README.txt. Persistent storage, server endpoints, client controls,
and live Valhalla/POI validation are still required before using it in trips.

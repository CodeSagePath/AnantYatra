AnantYatra model training workspace

Environment

- Python environment: ai/.venv
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

The smoke command loads Qwen2.5-1.5B-Instruct in 4-bit NF4 and generates a
short response. It stops if CUDA is unavailable. It reports total and peak
GPU memory. Use --revision with an immutable model commit when available.

Train or retrain

1. Put reviewed and permitted examples in ai/data/train.jsonl using the
   format described in ai/data/README.txt.
2. Adjust model, sequence length, optimizer settings, epochs, batch size,
   gradient accumulation, learning rate, LoRA rank, alpha, dropout, or target
   modules in ai/configs/karnataka-qlora.toml.
3. Run:

       ./ai/scripts/train.sh

   Or select another TOML file:

       ./ai/scripts/train.sh ai/configs/another-run.toml

The Python source does not need to change when configuration values change.
Each run gets a timestamped directory under ai/runs/karnataka-qlora/ and saves
its adapter plus run_metadata.json with the requested and resolved base model
revisions, config, example count, and training-data hash. Re-running the same
command creates a separate run and does not overwrite a previous adapter.

The initial training data file is intentionally not populated. The first real
training run must use examples that have passed source-rights and human quality
review. A synthetic QLoRA smoke step completed at 512 tokens, batch size 1, and
LoRA rank 4, using 3,054 MiB peak reserved VRAM. This confirms the training
path fits; it does not establish useful model quality or full-run duration.

The loader requires schema version 1.0, approved provenance, explicit training
permission, and a completed platform-brand scan. Edit ai/configs/data-policy.toml
to maintain the excluded platform terms. Hotel, restaurant, fuel station, and
attraction names remain valid when the source permits their use.

"""Verify 4-bit Qwen loading and a forward pass on the NVIDIA GPU only."""

import argparse
import sys

DEFAULT_MODEL_REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        default="Qwen/Qwen2.5-1.5B-Instruct",
        help="Hugging Face model ID",
    )
    parser.add_argument(
        "--revision",
        default=DEFAULT_MODEL_REVISION,
        help="Optional immutable model commit to test",
    )
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=16,
        help="Short generation length for the smoke check",
    )
    return parser.parse_args()


def require_cuda(torch):
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing CPU fallback.")
    if torch.cuda.device_count() < 1:
        raise RuntimeError("No CUDA device is visible; refusing CPU fallback.")


def main() -> int:
    args = parse_args()

    try:
        import torch
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
        )
    except ImportError as error:
        raise RuntimeError(
            "GPU dependencies are missing. Install the pinned GPU stack first."
        ) from error

    require_cuda(torch)
    torch.cuda.reset_peak_memory_stats()
    device = torch.cuda.current_device()
    device_name = torch.cuda.get_device_name(device)
    properties = torch.cuda.get_device_properties(device)

    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    load_options = {
        "quantization_config": quantization,
        "device_map": {"": device},
        "low_cpu_mem_usage": True,
    }
    if args.revision:
        load_options["revision"] = args.revision

    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision)
    model = AutoModelForCausalLM.from_pretrained(args.model, **load_options)
    prompt = "Plan a safe short road trip with verified stops."
    inputs = tokenizer(prompt, return_tensors="pt").to(f"cuda:{device}")

    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=args.max_new_tokens,
            do_sample=False,
        )

    torch.cuda.synchronize(device)
    print(f"GPU: {device_name}")
    print(f"Model revision: {args.revision}")
    print(f"VRAM total: {properties.total_memory / 1024**2:.0f} MiB")
    print(f"VRAM peak allocated: {torch.cuda.max_memory_allocated() / 1024**2:.0f} MiB")
    print(f"VRAM peak reserved: {torch.cuda.max_memory_reserved() / 1024**2:.0f} MiB")
    print(f"Output: {tokenizer.decode(output[0], skip_special_tokens=True)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"GPU smoke check failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error

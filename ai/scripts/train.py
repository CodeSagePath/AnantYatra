"""Train a QLoRA adapter using the TOML settings supplied on the command line."""

import argparse
import hashlib
import json
import math
import tomllib
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path)
    return parser.parse_args()


def resolve_path(path_value: str) -> Path:
    project_root = Path(__file__).resolve().parents[2]
    return (project_root / path_value).resolve()


def load_config(path: Path) -> dict:
    with path.open("rb") as config_file:
        return tomllib.load(config_file)


def load_records(path: Path, policy_path: Path) -> list[dict]:
    with policy_path.open("rb") as policy_file:
        policy = tomllib.load(policy_file)
    excluded_terms = policy.get("excluded_platform_terms", [])
    if not excluded_terms or not all(
        isinstance(term, str) and term.strip() for term in excluded_terms
    ):
        raise ValueError(f"Expected non-empty excluded_platform_terms in {policy_path}.")

    records = []
    with path.open(encoding="utf-8") as data_file:
        for line_number, line in enumerate(data_file, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"Invalid JSON on {path}:{line_number}: {error.msg}"
                ) from error
            if (
                not isinstance(record, dict)
                or record.get("schemaVersion") != "1.0"
            ):
                raise ValueError(
                    f"Expected schemaVersion '1.0' on {path}:{line_number}."
                )
            messages = record.get("messages")
            if not isinstance(messages, list):
                raise ValueError(
                    f"Expected a messages array on {path}:{line_number}."
                )
            if (
                len(messages) < 2
                or not isinstance(messages[-1], dict)
                or messages[-1].get("role") != "assistant"
            ):
                raise ValueError(
                    f"Expected user context and a final assistant answer on {path}:{line_number}."
                )
            for message in messages:
                if (
                    not isinstance(message, dict)
                    or message.get("role") not in {"system", "user", "assistant"}
                    or not isinstance(message.get("content"), str)
                    or not message["content"].strip()
                ):
                    raise ValueError(f"Invalid chat message on {path}:{line_number}.")
                content = message["content"].casefold()
                found_terms = [term for term in excluded_terms if term.casefold() in content]
                if found_terms:
                    raise ValueError(
                        f"Excluded platform term in {path}:{line_number}: {found_terms[0]}"
                    )
            provenance = record.get("provenance")
            if (
                not isinstance(provenance, dict)
                or not isinstance(provenance.get("sourceRecordIds"), list)
                or not provenance["sourceRecordIds"]
                or not all(
                    isinstance(source_id, str) and source_id.strip()
                    for source_id in provenance["sourceRecordIds"]
                )
                or provenance.get("permittedUse") != "training"
                or provenance.get("reviewState") != "approved"
                or provenance.get("brandScanStatus") != "passed"
                or provenance.get("consentState") not in {"not_applicable", "opted_in"}
                or not isinstance(provenance.get("reviewedAt"), str)
            ):
                raise ValueError(
                    f"Training approval provenance is incomplete on {path}:{line_number}."
                )
            records.append(messages)
    if not records:
        raise ValueError(f"Training data is empty: {path}")
    return records


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode_records(records, tokenizer, max_length: int) -> list[dict]:
    encoded = []
    for row_number, messages in enumerate(records, start=1):
        prompt_messages = messages[:-1]
        prompt_ids = tokenizer.apply_chat_template(
            prompt_messages,
            tokenize=True,
            add_generation_prompt=True,
        )["input_ids"]
        full_ids = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=False,
        )["input_ids"]
        if full_ids[: len(prompt_ids)] != prompt_ids:
            raise ValueError(
                f"Chat template did not preserve the prompt prefix on row {row_number}."
            )
        if len(prompt_ids) >= max_length:
            raise ValueError(
                f"Prompt exceeds max_sequence_length on row {row_number}; increase it in TOML."
            )
        input_ids = full_ids[:max_length]
        labels = [-100] * min(len(prompt_ids), len(input_ids))
        labels.extend(input_ids[len(labels) :])
        encoded.append({"input_ids": input_ids, "labels": labels})
    return encoded


def build_collator(torch, pad_token_id: int):
    def collate(batch):
        width = max(len(row["input_ids"]) for row in batch)
        input_ids = []
        attention_masks = []
        labels = []
        for row in batch:
            padding = width - len(row["input_ids"])
            input_ids.append(row["input_ids"] + [pad_token_id] * padding)
            attention_masks.append([1] * len(row["input_ids"]) + [0] * padding)
            labels.append(row["labels"] + [-100] * padding)
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_masks, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }

    return collate


def require_gpu(torch):
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; training will not fall back to CPU.")
    if torch.cuda.device_count() != 1:
        raise RuntimeError(
            "Training expects exactly one visible GPU; configure CUDA_VISIBLE_DEVICES."
        )


def train(config: dict) -> None:
    import torch
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        Trainer,
        TrainingArguments,
    )

    require_gpu(torch)
    model_config = config["model"]
    data_path = resolve_path(config["data"]["train_file"])
    policy_path = resolve_path(config["data"]["policy_file"])
    records = load_records(data_path, policy_path)
    run_started = datetime.now(timezone.utc)
    output_root = resolve_path(config["output"]["directory"])
    output_path = output_root / run_started.strftime("%Y%m%dT%H%M%S%fZ")
    output_path.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(
        model_config["id"], revision=model_config["revision"]
    )
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        model_config["id"],
        revision=model_config["revision"],
        quantization_config=quantization,
        device_map={"": 0},
        low_cpu_mem_usage=True,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=config["training"]["gradient_checkpointing"],
    )
    model = get_peft_model(
        model,
        LoraConfig(
            r=config["lora"]["rank"],
            lora_alpha=config["lora"]["alpha"],
            lora_dropout=config["lora"]["dropout"],
            target_modules=config["lora"]["target_modules"],
            bias="none",
            task_type="CAUSAL_LM",
        ),
    )
    model.print_trainable_parameters()

    encoded = encode_records(
        records,
        tokenizer,
        model_config["max_sequence_length"],
    )
    arguments = config["training"]
    batches_per_epoch = math.ceil(
        len(encoded) / arguments["batch_size"]
    )
    optimizer_steps_per_epoch = math.ceil(
        batches_per_epoch / arguments["gradient_accumulation_steps"]
    )
    total_optimizer_steps = optimizer_steps_per_epoch * arguments["epochs"]
    warmup_steps = round(total_optimizer_steps * arguments["warmup_ratio"])
    training_args = TrainingArguments(
        output_dir=str(output_path),
        num_train_epochs=arguments["epochs"],
        per_device_train_batch_size=arguments["batch_size"],
        gradient_accumulation_steps=arguments["gradient_accumulation_steps"],
        learning_rate=arguments["learning_rate"],
        warmup_steps=warmup_steps,
        weight_decay=arguments["weight_decay"],
        logging_steps=arguments["logging_steps"],
        save_strategy="epoch",
        save_total_limit=arguments["save_total_limit"],
        max_grad_norm=arguments["max_grad_norm"],
        gradient_checkpointing=arguments["gradient_checkpointing"],
        fp16=True,
        bf16=False,
        optim="paged_adamw_8bit",
        report_to="none",
        seed=arguments["seed"],
        dataloader_num_workers=0,
        use_cpu=False,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=encoded,
        data_collator=build_collator(torch, tokenizer.pad_token_id),
        processing_class=tokenizer,
    )
    torch.cuda.reset_peak_memory_stats()
    trainer.train()
    model.save_pretrained(output_path / "adapter")
    tokenizer.save_pretrained(output_path / "adapter")
    run_metadata = {
        "created_at_utc": run_started.isoformat(),
        "base_model": model_config["id"],
        "requested_revision": model_config["revision"],
        "resolved_revision": getattr(model.config, "_commit_hash", None),
        "training_data": str(data_path),
        "training_data_sha256": file_sha256(data_path),
        "training_example_count": len(records),
        "config": config,
    }
    (output_path / "run_metadata.json").write_text(
        json.dumps(run_metadata, indent=2) + "\n",
        encoding="utf-8",
    )
    torch.cuda.synchronize()
    print(f"Adapter saved to {output_path / 'adapter'}")
    print(f"Peak GPU memory: {torch.cuda.max_memory_reserved() / 1024**2:.0f} MiB")


def main() -> None:
    args = parse_args()
    train(load_config(args.config))


if __name__ == "__main__":
    main()

"""Tests assistant-only loss masking and sequence length protection."""

import unittest

from train import encode_records


class FixedTokenizer:
    def __init__(self, prompt_ids, full_ids):
        self.prompt_ids = prompt_ids
        self.full_ids = full_ids

    def apply_chat_template(self, messages, tokenize, add_generation_prompt):
        ids = self.prompt_ids if add_generation_prompt else self.full_ids
        return {"input_ids": ids}


class TrainingEncodingTests(unittest.TestCase):
    def test_masks_prompt_tokens_and_trains_assistant_tokens(self):
        tokenizer = FixedTokenizer([1, 2], [1, 2, 3, 4])
        rows = encode_records(
            [[{"role": "user", "content": "request"}, {"role": "assistant", "content": "answer"}]],
            tokenizer,
            max_length=4,
        )

        self.assertEqual(rows[0]["input_ids"], [1, 2, 3, 4])
        self.assertEqual(rows[0]["labels"], [-100, -100, 3, 4])

    def test_rejects_answer_that_would_be_truncated(self):
        tokenizer = FixedTokenizer([1, 2], [1, 2, 3, 4, 5])
        messages = [[
            {"role": "user", "content": "request"},
            {"role": "assistant", "content": "structured answer"},
        ]]

        with self.assertRaisesRegex(ValueError, "exceed max_sequence_length"):
            encode_records(messages, tokenizer, max_length=4)


if __name__ == "__main__":
    unittest.main()

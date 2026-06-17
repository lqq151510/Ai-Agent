import json
import logging
from pydantic import BaseModel, Field
from typing import Optional
from app.eval.model_clients import ModelClient

logger = logging.getLogger(__name__)

class EvalScore(BaseModel):
    score: int = Field(description="Score from 1 to 5, where 5 is the best.")
    reasoning: str = Field(description="Reasoning for the given score.")

class Evaluator:
    def __init__(self, judge_client: ModelClient):
        self.judge_client = judge_client

    def evaluate(self, original_task: dict, model_output: str) -> EvalScore:
        prompt = f"""
You are an expert code reviewer evaluating a refactoring task.

Task Title: {original_task['title']}
Task Description: {original_task['description']}

Original Code:
```{original_task['language']}
{original_task['original_code']}
```

Model Refactored Output:
{model_output}

Please evaluate the refactored output based on correctness, readability, and adherence to the task description.
Output your evaluation as a JSON object with two fields:
- "score": An integer from 1 to 5 (5 is excellent, 1 is poor).
- "reasoning": A brief explanation of why this score was given.

Only output valid JSON. Do not include markdown formatting like ```json.
"""
        try:
            response_str = self.judge_client.generate(prompt, system_prompt="You are a JSON-only evaluator. Always return strictly valid JSON.")
            logger.debug("Judge response received; length=%d", len(response_str))

            # Simple cleanup in case the model returns markdown code blocks
            response_str = response_str.strip()
            if response_str.startswith("```json"):
                response_str = response_str[7:]
            if response_str.startswith("```"):
                response_str = response_str[3:]
            if response_str.endswith("```"):
                response_str = response_str[:-3]

            # Find the first { and last } to extract JSON if there's surrounding text
            start_idx = response_str.find("{")
            end_idx = response_str.rfind("}")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                response_str = response_str[start_idx:end_idx+1]

            data = json.loads(response_str)
            return EvalScore(score=data.get("score", 1), reasoning=data.get("reasoning", "Failed to parse reasoning"))
        except Exception as e:
            return EvalScore(score=1, reasoning=f"Evaluation failed: {str(e)}")

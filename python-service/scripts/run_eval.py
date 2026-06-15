import os
import sys
import json
from dotenv import load_dotenv
from pathlib import Path

# Setup paths to allow importing from app
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

# Load .env from project root
env_path = BASE_DIR.parent / ".env"
load_dotenv(dotenv_path=env_path)

from app.eval.dataset import get_eval_tasks
from app.eval.model_clients import get_clients, ModelClient
from app.eval.evaluator import Evaluator

def main():
    print("🚀 Starting Model Evaluation...")
    
    # 1. Load tasks
    tasks = get_eval_tasks()
    print(f"Loaded {len(tasks)} refactoring tasks.")
    
    # 2. Setup Clients
    clients = get_clients()
    if not clients:
        print("❌ No model clients configured. Check your .env file.")
        return
        
    print(f"Loaded {len(clients)} models: {[c.name for c in clients]}")
    
    # 3. Setup Judge
    # Use OpenAI or DeepSeek as judge if available, otherwise fallback to whatever is first
    judge_client = next((c for c in clients if c.name in ["OpenAI", "DeepSeek"]), clients[0])
    print(f"⚖️ Using {judge_client.name} as the Judge.")
    evaluator = Evaluator(judge_client)
    
    results = []
    
    # 4. Run Evaluation
    for task in tasks:
        print(f"\n--- 📝 Task: {task.title} ---")
        task_prompt = f"""
Language: {task.language}
Task: {task.description}

Code to refactor:
```{task.language}
{task.original_code}
```
Please provide the refactored code.
"""
        task_results = {
            "task_id": task.id,
            "title": task.title,
            "models": {}
        }
        
        for client in clients:
            print(f"  🤖 {client.name} is thinking...")
            model_output = client.generate(task_prompt)
            
            print(f"  ⚖️ Evaluating {client.name}'s output...")
            eval_score = evaluator.evaluate(task.model_dump(), model_output)
            print(f"     => Score: {eval_score.score}/5, Reason: {eval_score.reasoning}")
            
            task_results["models"][client.name] = {
                "score": eval_score.score,
                "reasoning": eval_score.reasoning,
                "output": model_output
            }
            
        results.append(task_results)
        
    # 5. Calculate final summary
    print("\n📊 --- Final Benchmark Summary --- 📊")
    summary = {c.name: 0 for c in clients}
    for r in results:
        for model_name, data in r["models"].items():
            summary[model_name] += data["score"]
            
    for model_name, total_score in summary.items():
        avg_score = total_score / len(tasks)
        print(f"{model_name}: Total Score = {total_score}, Average = {avg_score:.2f}/5.0")
        
    # Save report
    report_path = BASE_DIR / "scripts" / "benchmark_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Detailed report saved to {report_path}")

if __name__ == "__main__":
    main()

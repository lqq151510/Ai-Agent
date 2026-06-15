import os
from openai import OpenAI
from typing import Optional

def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)

class ModelClient:
    def __init__(self, name: str, api_key: str, base_url: Optional[str] = None, model: str = ""):
        self.name = name
        self.model = model
        # If base_url is provided, use it. Otherwise, rely on default OpenAI URL
        if base_url:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
        else:
            self.client = OpenAI(api_key=api_key)

    def generate(self, prompt: str, system_prompt: str = "You are a senior software engineer.") -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            return f"Error calling {self.name}: {str(e)}"

def get_clients():
    """
    Load clients based on environment variables.
    """
    clients = []
    
    # 1. Local Qwen3.5
    local_url = get_env("OPENAI_BASE_URL", "http://127.0.0.1:1234/v1")
    local_key = get_env("OPENAI_API_KEY", "not-needed")
    local_model = get_env("OPENAI_MODEL", "qwen3.5-9b")
    clients.append(ModelClient("Qwen3.5", api_key=local_key, base_url=local_url, model=local_model))
    
    # 2. DeepSeek
    deepseek_key = get_env("DEEPSEEK_API_KEY")
    if deepseek_key:
        clients.append(ModelClient("DeepSeek", api_key=deepseek_key, base_url="https://api.deepseek.com", model="deepseek-chat"))
    
    # 3. OpenAI
    openai_key = get_env("REAL_OPENAI_API_KEY") # to distinguish from local LM studio key
    if openai_key:
        clients.append(ModelClient("OpenAI", api_key=openai_key, model="gpt-4o"))
        
    return clients

"""
本地模型客户端（占位，后续扩展）
可对接 Ollama、llama.cpp 等本地推理服务
"""
from typing import List
from ai_clients.base import BaseAIClient


class LocalLLMClient(BaseAIClient):
    """
    本地 LLM 客户端示例。
    默认对接 Ollama（http://localhost:11434/v1），
    可通过构造参数自定义 base_url 和 model。
    """

    def __init__(self, base_url: str = "http://localhost:11434/v1", model: str = "llama3"):
        self.base_url = base_url
        self.model = model

    def chat(
        self,
        messages: List[dict],
        temperature: float = 0.1,
        **kwargs,
    ) -> str:
        # 使用 openai SDK 对接 Ollama 兼容接口
        from openai import OpenAI
        client = OpenAI(api_key="ollama", base_url=self.base_url)
        response = client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            **kwargs,
        )
        return response.choices[0].message.content.strip()

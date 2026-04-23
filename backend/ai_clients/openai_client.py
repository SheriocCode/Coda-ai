"""
OpenAI 兼容客户端（支持火山引擎 ARK 等 OpenAI 兼容接口）
"""
import os
from typing import List, Optional
from openai import OpenAI
from ai_clients.base import BaseAIClient


class OpenAIClient(BaseAIClient):
    """
    封装 OpenAI SDK，支持任意 OpenAI 兼容的 base_url。
    配置优先级：构造参数 > 环境变量
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("ARK_API_KEY", "")
        self.base_url = base_url or os.environ.get("ARK_BASE_URL", "")
        self.model = model or os.environ.get("ARK_MODEL", "")

        if not self.api_key:
            raise ValueError("ARK_API_KEY environment variable is required")
        if not self.base_url:
            raise ValueError("ARK_BASE_URL environment variable is required")
        if not self.model:
            raise ValueError("ARK_MODEL environment variable is required")

        self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def chat(
        self,
        messages: List[dict],
        temperature: float = 0.1,
        **kwargs,
    ) -> str:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            **kwargs,
        )
        return response.choices[0].message.content.strip()


def get_default_client() -> OpenAIClient:
    """从环境变量构建默认客户端（每次调用都重新读取，支持运行时更新配置）"""
    return OpenAIClient()

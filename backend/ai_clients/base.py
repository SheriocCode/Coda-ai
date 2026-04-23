"""
AI 客户端统一接口（抽象基类）
"""
from abc import ABC, abstractmethod
from typing import List


class BaseAIClient(ABC):
    """所有 AI 客户端必须实现此接口"""

    @abstractmethod
    def chat(
        self,
        messages: List[dict],
        temperature: float = 0.1,
        **kwargs,
    ) -> str:
        """
        发送对话请求，返回模型的文本回复。

        :param messages: OpenAI 格式的消息列表
        :param temperature: 采样温度
        :return: 模型回复的纯文本内容
        """
        ...

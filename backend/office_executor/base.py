"""
本地能力执行器抽象基类
"""
from abc import ABC, abstractmethod
from typing import Tuple


class BaseExecutor(ABC):
    """所有本地执行器必须实现此接口"""

    @abstractmethod
    def execute(self, code: str) -> Tuple[str, str, bool]:
        """
        执行代码/命令。

        :param code: 要执行的代码字符串
        :return: (stdout, stderr, success)
        """
        ...

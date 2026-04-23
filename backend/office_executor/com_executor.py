"""
Win32COM 执行器（占位，后续扩展）
用于通过 win32com 直接操控 Excel/Word 进程
"""
from typing import Tuple
from office_executor.base import BaseExecutor


class COMExecutor(BaseExecutor):
    """
    通过 win32com 执行 VBA 宏或直接操控 Office 应用。
    当前为占位实现，后续按需扩展。
    """

    def execute(self, code: str) -> Tuple[str, str, bool]:
        # TODO: 实现 win32com 调用逻辑
        return "", "COMExecutor 尚未实现", False

"""
Executor：执行代码
"""
import asyncio
from typing import Tuple
from office_executor.python_executor import PythonExecutor

_executor = PythonExecutor()


async def run_code_async(code: str) -> Tuple[str, str, bool]:
    """在线程池中异步执行 Python 代码，避免阻塞事件循环（供 Agent 循环使用）"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _executor.execute, code)


def run_code_sync(code: str) -> Tuple[str, str, bool]:
    """同步执行 Python 代码（供用户手动执行接口使用）"""
    return _executor.execute(code)

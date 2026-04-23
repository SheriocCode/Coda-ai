"""
Python 子进程执行器
在独立子进程中安全执行 AI 生成的 Python 代码（pandas / openpyxl 等）
"""
import os
import sys
import tempfile
import subprocess
from typing import Tuple
from office_executor.base import BaseExecutor


class PythonExecutor(BaseExecutor):
    """在子进程中执行 Python 代码，超时 120 秒"""

    TIMEOUT = 120

    def execute(self, code: str) -> Tuple[str, str, bool]:
        """
        将代码写入临时文件后用当前 Python 解释器执行。
        自动注入 UTF-8 输出头，避免 Windows 乱码。
        """
        utf8_header = (
            "import sys, io\n"
            "sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')\n"
            "sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')\n"
        )
        full_code = utf8_header + code

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(full_code)
            tmp_path = f.name

        try:
            result = subprocess.run(
                [sys.executable, tmp_path],
                capture_output=True,
                timeout=self.TIMEOUT,
            )
            stdout = result.stdout.decode("utf-8", errors="replace")
            stderr = result.stderr.decode("utf-8", errors="replace")
            return stdout, stderr, result.returncode == 0
        except subprocess.TimeoutExpired:
            return "", f"执行超时（超过 {self.TIMEOUT} 秒）", False
        except Exception as e:
            return "", f"执行异常: {e}", False
        finally:
            os.unlink(tmp_path)

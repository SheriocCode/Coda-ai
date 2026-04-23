"""
AI 对话相关的请求/响应 Schema
"""
from typing import Optional, List
from pydantic import BaseModel


class AgentRunRequest(BaseModel):
    """Agent 循环接口请求体"""
    instruction: str          # 用户自然语言指令
    session_id: str           # 会话ID
    history: Optional[List[dict]] = None  # 对话历史（多轮对话上下文）


class ExecuteCodeRequest(BaseModel):
    """直接执行代码接口请求体"""
    session_id: str
    code: str


class ExecuteCodeResponse(BaseModel):
    """直接执行代码接口响应体"""
    code: str
    stdout: str
    stderr: str
    success: bool
    output_files: List[str]

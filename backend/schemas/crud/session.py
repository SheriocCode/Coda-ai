"""
会话相关的请求/响应 Schema
"""
from typing import Optional
from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    name: Optional[str] = None


class RenameSessionRequest(BaseModel):
    name: str


class SessionMeta(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str


class SessionListResponse(BaseModel):
    sessions: list[SessionMeta]

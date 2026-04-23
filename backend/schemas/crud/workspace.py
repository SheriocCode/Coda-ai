"""
工作区（文件管理）相关的请求/响应 Schema
"""
from typing import Optional, List
from pydantic import BaseModel


class FileInfo(BaseModel):
    name: str
    path: str
    size: int
    ext: str


class WorkspaceInfo(BaseModel):
    files: List[FileInfo]
    workspace_dir: str
    session_id: str


class UploadResponse(BaseModel):
    success: bool
    filename: str
    path: str
    size: int
    preview: Optional[str] = None

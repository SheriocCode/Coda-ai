"""
会话管理 CRUD 路由
"""
from fastapi import APIRouter
from schemas.crud.session import (
    CreateSessionRequest,
    RenameSessionRequest,
)
import services.crud.session_service as svc

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
def list_sessions():
    """获取所有会话列表（按更新时间倒序）"""
    return {"sessions": svc.list_sessions()}


@router.post("")
def create_session(req: CreateSessionRequest):
    """创建新会话"""
    return svc.create_session(req.name)


@router.patch("/{session_id}")
def rename_session(session_id: str, req: RenameSessionRequest):
    """重命名会话"""
    svc.rename_session(session_id, req.name)
    return {"success": True}


@router.delete("/{session_id}")
def delete_session(session_id: str):
    """删除会话及其工作区"""
    svc.delete_session(session_id)
    return {"success": True}

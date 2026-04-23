"""
会话 CRUD 业务服务
负责会话的创建、查询、重命名、删除，以及工作区目录管理
"""
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from fastapi import HTTPException

from db.database import SessionLocal
from db.models.session import Session


def _get_sessions_dir() -> Path:
    """获取 sessions 根目录"""
    import os
    _workspace_env = os.environ.get("WORKSPACE_DIR")
    base = Path(_workspace_env) if _workspace_env else Path("workspace")
    sessions_dir = base / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    return sessions_dir


def get_session_dir(session_id: str) -> Path:
    """获取某个会话的工作区目录"""
    return _get_sessions_dir() / session_id


def get_session_output_dir(session_id: str) -> Path:
    """获取某个会话的输出目录，不存在则创建"""
    output = get_session_dir(session_id) / "output"
    output.mkdir(parents=True, exist_ok=True)
    return output


def ensure_session_exists(session_id: str) -> Session:
    """确保会话存在，不存在则抛出 404；同时确保工作区目录存在"""
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"会话 {session_id} 不存在")
        # 确保目录存在
        get_session_dir(session_id).mkdir(parents=True, exist_ok=True)
        get_session_output_dir(session_id)
        return session
    finally:
        db.close()


def list_sessions() -> List[dict]:
    """获取所有会话，按 updated_at 倒序"""
    db = SessionLocal()
    try:
        sessions = db.query(Session).order_by(Session.updated_at.desc()).all()
        return [s.to_dict() for s in sessions]
    finally:
        db.close()


def create_session(name: Optional[str] = None) -> dict:
    """创建新会话，同时创建工作区目录"""
    session_id = f"session-{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow()
    session = Session(
        id=session_id,
        name=name or "新会话",
        created_at=now,
        updated_at=now,
    )
    db = SessionLocal()
    try:
        db.add(session)
        db.commit()
        db.refresh(session)
        result = session.to_dict()
    finally:
        db.close()

    # 创建工作区目录
    session_dir = get_session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "output").mkdir(exist_ok=True)

    return result


def rename_session(session_id: str, name: str) -> dict:
    """重命名会话"""
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        session.name = name
        session.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(session)
        return session.to_dict()
    finally:
        db.close()


def delete_session(session_id: str) -> None:
    """删除会话及其工作区目录"""
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        db.delete(session)
        db.commit()
    finally:
        db.close()

    # 删除工作区目录
    session_dir = get_session_dir(session_id)
    if session_dir.exists():
        shutil.rmtree(session_dir)


def touch_session(session_id: str) -> None:
    """更新会话的 updated_at 时间"""
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        if session:
            session.updated_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()

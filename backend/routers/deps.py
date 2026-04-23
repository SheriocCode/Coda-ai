"""
依赖注入：DB Session、当前会话校验等
"""
import os
from typing import Generator
from fastapi import HTTPException
from sqlalchemy.orm import Session

from db.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：提供数据库 Session，请求结束后自动关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_api_key() -> None:
    """FastAPI 依赖：确保已配置 API Key"""
    if not os.environ.get("ARK_API_KEY"):
        raise HTTPException(status_code=400, detail="未配置 API Key，请先在设置中填写")

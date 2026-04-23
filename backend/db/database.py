"""
数据库引擎、Session 工厂、Base 声明
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# workspace 目录（可由环境变量覆盖）
_workspace_env = os.environ.get("WORKSPACE_DIR")
BASE_DIR = Path(_workspace_env) if _workspace_env else Path("workspace")
BASE_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = BASE_DIR / "app.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    """创建所有表（应用启动时调用）"""
    from db.models import session, file, task  # noqa: F401 触发模型注册
    Base.metadata.create_all(bind=engine)

"""
系统管理路由：健康检查、配置读写
"""
import os
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health():
    """健康检查"""
    from services.crud.session_service import _get_sessions_dir
    return {"status": "ok", "sessions_dir": str(_get_sessions_dir().absolute())}


@router.get("/config")
def get_config():
    """获取当前 AI 配置"""
    return {
        "has_api_key": bool(os.environ.get("ARK_API_KEY")),
        "model": os.environ.get("ARK_MODEL", ""),
        "base_url": os.environ.get("ARK_BASE_URL", ""),
    }


@router.post("/config")
def set_config(data: dict):
    """运行时更新 AI 配置（写入环境变量，重启后失效）"""
    if data.get("api_key"):
        os.environ["ARK_API_KEY"] = data["api_key"]
    if data.get("model"):
        os.environ["ARK_MODEL"] = data["model"]
    if data.get("base_url"):
        os.environ["ARK_BASE_URL"] = data["base_url"]
    return {"success": True}

"""
工作区文件管理 CRUD 路由
"""
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import FileResponse

import services.crud.session_service as session_svc
import services.crud.workspace_service as ws_svc

router = APIRouter(tags=["workspace"])


@router.get("/api/workspace/{session_id}")
def get_workspace(session_id: str):
    """获取指定会话的工作区文件列表"""
    session_svc.ensure_session_exists(session_id)
    return ws_svc.get_workspace_info(session_id)


@router.post("/api/upload/{session_id}")
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    relative_path: Optional[str] = Form(None),
):
    """上传文件到指定会话的工作区，支持子文件夹路径"""
    session_svc.ensure_session_exists(session_id)
    return await ws_svc.upload_file(session_id, file, relative_path)


@router.delete("/api/workspace/{session_id}/{filename:path}")
def delete_file(session_id: str, filename: str):
    """删除指定会话工作区中的文件"""
    session_svc.ensure_session_exists(session_id)
    ws_svc.delete_file(session_id, filename)
    return {"success": True}


@router.get("/api/preview/{session_id}/{filename:path}")
def preview_file(session_id: str, filename: str, max_rows: int = 10):
    """预览指定会话工作区中的文件"""
    session_svc.ensure_session_exists(session_id)
    return ws_svc.preview_file(session_id, filename, max_rows)


@router.get("/api/download/{session_id}/{filepath:path}")
def download_file(session_id: str, filepath: str):
    """下载指定会话工作区中的文件"""
    session_svc.ensure_session_exists(session_id)
    target = ws_svc.get_file_path(session_id, filepath)
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream",
    )

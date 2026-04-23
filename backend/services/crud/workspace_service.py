"""
工作区文件管理业务服务
负责文件上传、删除、预览、下载、工作区信息查询
"""
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, UploadFile

from services.crud.session_service import (
    get_session_dir,
    get_session_output_dir,
    touch_session,
)


def get_workspace_info(session_id: str) -> dict:
    """获取指定会话的工作区文件信息"""
    workspace_dir = get_session_dir(session_id)
    workspace_dir.mkdir(parents=True, exist_ok=True)

    files = []
    for f in workspace_dir.rglob("*"):
        if f.is_file() and not f.name.startswith("."):
            rel = f.relative_to(workspace_dir)
            files.append({
                "name": f.name,
                "path": str(rel).replace("\\", "/"),
                "size": f.stat().st_size,
                "ext": f.suffix.lower(),
            })
    return {
        "files": files,
        "workspace_dir": str(workspace_dir.absolute()),
        "session_id": session_id,
    }


def get_output_files_after(session_id: str, before_files: set) -> list:
    """获取执行后新增的输出文件列表"""
    output_dir = get_session_output_dir(session_id)
    workspace_dir = get_session_dir(session_id)
    current_files: set = set()
    for f in output_dir.rglob("*"):
        if f.is_file():
            current_files.add(str(f.relative_to(workspace_dir).as_posix()))
    return sorted(current_files - before_files)


async def upload_file(
    session_id: str,
    file: UploadFile,
    relative_path: Optional[str] = None,
) -> dict:
    """上传文件到指定会话的工作区，支持子文件夹路径"""
    workspace_dir = get_session_dir(session_id)
    workspace_abs = workspace_dir.resolve()

    if relative_path and relative_path.strip():
        rel = Path(relative_path.strip().lstrip("/\\").replace("\\", "/"))
        dest = (workspace_abs / rel).resolve()
        try:
            dest.relative_to(workspace_abs)
        except ValueError:
            raise HTTPException(status_code=400, detail="非法路径")
    else:
        filename = file.filename or f"upload_{uuid.uuid4().hex[:8]}"
        filename = Path(filename).name
        dest = workspace_abs / filename

    dest.parent.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    preview = ""
    if dest.suffix.lower() in [".xlsx", ".xls", ".csv"]:
        preview = _get_file_preview(dest)

    touch_session(session_id)

    return {
        "success": True,
        "filename": dest.name,
        "path": str(dest.relative_to(workspace_abs).as_posix()),
        "size": dest.stat().st_size,
        "preview": preview,
    }


def delete_file(session_id: str, filename: str) -> None:
    """删除指定会话工作区中的文件或目录"""
    workspace_dir = get_session_dir(session_id)
    target = workspace_dir / filename

    try:
        target.resolve().relative_to(workspace_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")

    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    if target.is_file():
        try:
            target.unlink()
        except PermissionError:
            import gc, time
            gc.collect()
            time.sleep(0.3)
            try:
                target.unlink()
            except PermissionError as e:
                raise HTTPException(
                    status_code=409,
                    detail=f"文件正被占用，无法删除，请稍后重试：{e}",
                )
    elif target.is_dir():
        shutil.rmtree(target, ignore_errors=True)


def preview_file(session_id: str, filename: str, max_rows: int = 10) -> dict:
    """预览指定会话工作区中的文件"""
    workspace_dir = get_session_dir(session_id)
    target = workspace_dir / filename

    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    ext = target.suffix.lower()
    if ext in [".xlsx", ".xls", ".csv"]:
        try:
            import pandas as pd
            if ext in [".xlsx", ".xls"]:
                with pd.ExcelFile(target) as xl:
                    sheet_names = xl.sheet_names
                sheets = {}
                for sheet in sheet_names:
                    df = pd.read_excel(target, sheet_name=sheet, nrows=max_rows, dtype=str)
                    df = df.fillna("")
                    sheets[sheet] = {
                        "columns": df.columns.tolist(),
                        "rows": df.values.tolist(),
                        "total_hint": f"显示前{max_rows}行",
                    }
                return {"type": "excel", "sheets": sheets}
            else:
                df = pd.read_csv(target, nrows=max_rows, dtype=str).fillna("")
                return {
                    "type": "csv",
                    "sheets": {
                        "Sheet1": {
                            "columns": df.columns.tolist(),
                            "rows": df.values.tolist(),
                            "total_hint": f"显示前{max_rows}行",
                        }
                    },
                }
        except Exception as e:
            return {"type": "error", "message": str(e)}
    elif ext == ".docx":
        try:
            from docx import Document
            doc = Document(target)
            text = "\n".join(p.text for p in doc.paragraphs[:50])
            return {"type": "docx", "text": text}
        except Exception as e:
            return {"type": "error", "message": str(e)}
    else:
        return {"type": "unsupported", "message": f"不支持预览 {ext} 文件"}


def get_file_path(session_id: str, filepath: str) -> Path:
    """获取文件绝对路径，并做安全校验"""
    workspace_dir = get_session_dir(session_id)
    target = workspace_dir / filepath
    try:
        target.resolve().relative_to(workspace_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return target


# ── 内部工具 ──────────────────────────────────────────────────

def _get_file_preview(file_path: Path, max_rows: int = 5) -> str:
    """获取文件预览文本（xlsx/csv）"""
    try:
        import pandas as pd
        if file_path.suffix.lower() in [".xlsx", ".xls"]:
            with pd.ExcelFile(file_path) as xl:
                sheet_names = xl.sheet_names[:3]
            previews = []
            for sheet in sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet, nrows=max_rows, dtype=str)
                previews.append(f"Sheet: {sheet}\n{df.to_string(index=False)}")
            return "\n\n".join(previews)
        elif file_path.suffix.lower() == ".csv":
            df = pd.read_csv(file_path, nrows=max_rows, dtype=str)
            return df.to_string(index=False)
    except Exception as e:
        return f"预览失败: {e}"
    return ""

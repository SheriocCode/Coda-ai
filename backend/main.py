"""
AI 驱动的 Excel/Word 处理工具 - 后端服务
多会话版：每个会话拥有独立的工作区目录
"""

import os
import sys
import re
import json
import uuid
import shutil
import traceback
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from datetime import datetime

from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from openai import OpenAI

# 加载环境变量
load_dotenv()

# ============================================================
# 配置
# ============================================================
# 打包后 electron 会通过环境变量 WORKSPACE_DIR 传入用户数据目录
_workspace_env = os.environ.get("WORKSPACE_DIR")
BASE_DIR = Path(_workspace_env) if _workspace_env else Path("workspace")
BASE_DIR.mkdir(parents=True, exist_ok=True)

# 多会话根目录
SESSIONS_DIR = BASE_DIR / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

# 会话元数据文件
SESSIONS_META_FILE = BASE_DIR / "sessions.json"

# AI 客户端（从环境变量读取 key）
def get_ai_client():
    api_key = os.environ.get("ARK_API_KEY", "")
    base_url = os.environ.get("ARK_BASE_URL", "")
    model = os.environ.get("ARK_MODEL", "")
    if not api_key:
        raise ValueError("ARK_API_KEY environment variable is required")
    if not base_url:
        raise ValueError("ARK_BASE_URL environment variable is required")
    if not model:
        raise ValueError("ARK_MODEL environment variable is required")
    return OpenAI(api_key=api_key, base_url=base_url), model

app = FastAPI(title="AI Excel Helper", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 数据模型
# ============================================================
class ExecuteRequest(BaseModel):
    instruction: str          # 用户自然语言指令
    session_id: str           # 会话ID
    code: Optional[str] = None  # 可选：直接执行的代码（用于重试）
    context: Optional[dict] = None  # 工作区上下文
    history: Optional[list] = None  # 对话历史

class ExecuteResponse(BaseModel):
    code: str
    stdout: str
    stderr: str
    success: bool
    output_files: list  # 生成的文件列表

class SessionMeta(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str

class CreateSessionRequest(BaseModel):
    name: Optional[str] = None

class RenameSessionRequest(BaseModel):
    name: str

# ============================================================
# 会话元数据管理
# ============================================================
def load_sessions_meta() -> list:
    """加载会话元数据"""
    if not SESSIONS_META_FILE.exists():
        return []
    try:
        with open(SESSIONS_META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_sessions_meta(sessions: list):
    """保存会话元数据"""
    with open(SESSIONS_META_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)

def get_session_dir(session_id: str) -> Path:
    """获取会话工作区目录"""
    return SESSIONS_DIR / session_id

def get_session_output_dir(session_id: str) -> Path:
    """获取会话输出目录"""
    output = get_session_dir(session_id) / "output"
    output.mkdir(parents=True, exist_ok=True)
    return output

def ensure_session_exists(session_id: str):
    """确保会话存在，不存在则抛出异常"""
    sessions = load_sessions_meta()
    if not any(s["id"] == session_id for s in sessions):
        raise HTTPException(status_code=404, detail=f"会话 {session_id} 不存在")
    session_dir = get_session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    get_session_output_dir(session_id)

# ============================================================
# 工具函数
# ============================================================
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
                "ext": f.suffix.lower()
            })
    return {
        "files": files,
        "workspace_dir": str(workspace_dir.absolute()),
        "session_id": session_id
    }


def get_file_preview(file_path: Path, max_rows: int = 5) -> str:
    """获取文件预览（xlsx/csv）"""
    try:
        import pandas as pd
        if file_path.suffix.lower() in [".xlsx", ".xls"]:
            # 使用 with 语句确保句柄立即释放，避免 Windows 文件占用
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


def build_system_prompt(workspace_info: dict) -> str:
    """构建系统提示词"""
    files_desc = "\n".join(
        f"  - {f['path']} ({f['ext']}, {f['size']} bytes)"
        for f in workspace_info.get("files", [])
    )
    workspace_abs = workspace_info.get("workspace_dir", "workspace")

    return f"""你是一个专业的 Python 数据处理助手，擅长使用 openpyxl、pandas、python-docx 等库处理 Excel 和 Word 文件。

## 工作区信息
工作区绝对路径: {workspace_abs}
当前文件列表:
{files_desc if files_desc else "  （空）"}

## 你的任务
根据用户的自然语言指令，生成可直接执行的 Python 代码。

## 重要规则
1. **只输出 Python 代码**，不要有任何解释文字，不要用 markdown 代码块包裹
2. 所有文件路径必须使用绝对路径，工作区根目录为: {workspace_abs}
3. 输出文件统一保存到: {workspace_abs}/output/ 目录
4. 使用 print() 输出操作结果和进度信息，让用户知道发生了什么
5. 遇到错误要用 try/except 捕获并打印详细错误信息
6. 可用的库: pandas, openpyxl, python-docx (docx), os, sys, pathlib, json, re, datetime, collections 等标准库
7. 如果需要读取文件，先检查文件是否存在
8. 生成的文件名要有意义，包含时间戳或关键信息避免覆盖

## 示例代码风格
```python
import pandas as pd
from pathlib import Path

workspace = Path(r"{workspace_abs}")
output_dir = workspace / "output"
output_dir.mkdir(exist_ok=True)

# 读取文件
df = pd.read_excel(workspace / "data.xlsx")
print(f"读取到 {{len(df)}} 行数据")

# 处理...
# 保存结果
df.to_excel(output_dir / "result.xlsx", index=False)
print("✅ 已保存到 output/result.xlsx")
```
"""


def execute_python_code(code: str) -> tuple[str, str, bool]:
    """在子进程中安全执行 Python 代码"""
    utf8_header = (
        "import sys, io\n"
        "sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')\n"
        "sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')\n"
    )
    full_code = utf8_header + code

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        f.write(full_code)
        tmp_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            timeout=120,
        )
        stdout = result.stdout.decode("utf-8", errors="replace")
        stderr = result.stderr.decode("utf-8", errors="replace")
        return stdout, stderr, result.returncode == 0
    except subprocess.TimeoutExpired:
        return "", "执行超时（超过120秒）", False
    except Exception as e:
        return "", f"执行异常: {e}", False
    finally:
        os.unlink(tmp_path)


def extract_code(raw: str) -> str:
    """从 AI 返回的文本中提取 Python 代码"""
    pattern = r"```(?:python)?\s*\n?([\s\S]*?)```"
    matches = re.findall(pattern, raw)
    if matches:
        return max(matches, key=len).strip()
    return raw.strip()


def get_output_files_after(session_id: str, before_files: set) -> list:
    """获取执行后新增的输出文件"""
    output_dir = get_session_output_dir(session_id)
    workspace_dir = get_session_dir(session_id)
    current_files = set()
    for f in output_dir.rglob("*"):
        if f.is_file():
            current_files.add(str(f.relative_to(workspace_dir).as_posix()))
    new_files = current_files - before_files
    return sorted(new_files)


# ============================================================
# API 路由 - 健康检查 & 配置
# ============================================================

@app.get("/api/health")
def health():
    return {"status": "ok", "sessions_dir": str(SESSIONS_DIR.absolute())}


@app.get("/api/config")
def get_config():
    api_key = os.environ.get("ARK_API_KEY", "")
    model = os.environ.get("ARK_MODEL", "")
    base_url = os.environ.get("ARK_BASE_URL", "")
    return {
        "has_api_key": bool(api_key),
        "model": model,
        "base_url": base_url,
    }


@app.post("/api/config")
def set_config(data: dict):
    if "api_key" in data and data["api_key"]:
        os.environ["ARK_API_KEY"] = data["api_key"]
    if "model" in data and data["model"]:
        os.environ["ARK_MODEL"] = data["model"]
    if "base_url" in data and data["base_url"]:
        os.environ["ARK_BASE_URL"] = data["base_url"]
    return {"success": True}


# ============================================================
# API 路由 - 会话管理
# ============================================================

@app.get("/api/sessions")
def list_sessions():
    """获取所有会话列表"""
    sessions = load_sessions_meta()
    # 按更新时间倒序
    sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    return {"sessions": sessions}


@app.post("/api/sessions")
def create_session(req: CreateSessionRequest):
    """创建新会话"""
    session_id = f"session-{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()
    name = req.name or f"新会话"
    
    meta = {
        "id": session_id,
        "name": name,
        "created_at": now,
        "updated_at": now,
    }
    
    # 创建工作区目录
    session_dir = get_session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "output").mkdir(exist_ok=True)
    
    # 保存元数据
    sessions = load_sessions_meta()
    sessions.append(meta)
    save_sessions_meta(sessions)
    
    return meta


@app.patch("/api/sessions/{session_id}")
def rename_session(session_id: str, req: RenameSessionRequest):
    """重命名会话"""
    sessions = load_sessions_meta()
    found = False
    for s in sessions:
        if s["id"] == session_id:
            s["name"] = req.name
            s["updated_at"] = datetime.now().isoformat()
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="会话不存在")
    save_sessions_meta(sessions)
    return {"success": True}


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    """删除会话及其工作区"""
    sessions = load_sessions_meta()
    new_sessions = [s for s in sessions if s["id"] != session_id]
    if len(new_sessions) == len(sessions):
        raise HTTPException(status_code=404, detail="会话不存在")
    
    # 删除工作区目录
    session_dir = get_session_dir(session_id)
    if session_dir.exists():
        shutil.rmtree(session_dir)
    
    save_sessions_meta(new_sessions)
    return {"success": True}


# ============================================================
# API 路由 - 工作区（按会话隔离）
# ============================================================

@app.get("/api/workspace/{session_id}")
def get_workspace(session_id: str):
    """获取指定会话的工作区文件列表"""
    ensure_session_exists(session_id)
    return get_workspace_info(session_id)


@app.post("/api/upload/{session_id}")
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    relative_path: Optional[str] = Form(None),
):
    """上传文件到指定会话的工作区，支持子文件夹路径"""
    ensure_session_exists(session_id)
    workspace_dir = get_session_dir(session_id)

    print(f"[upload] file={file.filename!r}  relative_path={relative_path!r}")

    # 统一使用绝对路径，避免 relative_to 混用相对/绝对路径报错
    workspace_abs = workspace_dir.resolve()

    # 优先使用 relative_path（含子目录），否则退化为纯文件名
    if relative_path and relative_path.strip():
        # 安全清理：去掉开头的 / 或 \，规范化分隔符
        rel = Path(relative_path.strip().lstrip("/\\").replace("\\", "/"))
        # 防止路径穿越
        dest = (workspace_abs / rel).resolve()
        try:
            dest.relative_to(workspace_abs)
        except ValueError:
            raise HTTPException(status_code=400, detail="非法路径")
        print(f"[upload] -> dest={dest}")
    else:
        filename = file.filename or f"upload_{uuid.uuid4().hex[:8]}"
        filename = Path(filename).name
        dest = workspace_abs / filename
        print(f"[upload] -> dest(flat)={dest}")

    dest.parent.mkdir(parents=True, exist_ok=True)

    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    preview = ""
    if dest.suffix.lower() in [".xlsx", ".xls", ".csv"]:
        preview = get_file_preview(dest)

    # 更新会话的 updated_at
    sessions = load_sessions_meta()
    for s in sessions:
        if s["id"] == session_id:
            s["updated_at"] = datetime.now().isoformat()
            break
    save_sessions_meta(sessions)

    return {
        "success": True,
        "filename": dest.name,
        "path": str(dest.relative_to(workspace_abs).as_posix()),
        "size": dest.stat().st_size,
        "preview": preview
    }


@app.delete("/api/workspace/{session_id}/{filename:path}")
def delete_file(session_id: str, filename: str):
    """删除指定会话工作区中的文件"""
    ensure_session_exists(session_id)
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
            # Windows 上文件可能被其他进程（如 pandas/openpyxl）占用，
            # 强制垃圾回收后重试一次
            import gc, time
            gc.collect()
            time.sleep(0.3)
            try:
                target.unlink()
            except PermissionError as e:
                raise HTTPException(
                    status_code=409,
                    detail=f"文件正被占用，无法删除，请稍后重试：{e}"
                )
    elif target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
    
    return {"success": True}


@app.get("/api/preview/{session_id}/{filename:path}")
def preview_file(session_id: str, filename: str, max_rows: int = 10):
    """预览指定会话工作区中的文件"""
    ensure_session_exists(session_id)
    workspace_dir = get_session_dir(session_id)
    target = workspace_dir / filename
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    ext = target.suffix.lower()
    if ext in [".xlsx", ".xls", ".csv"]:
        try:
            import pandas as pd
            if ext in [".xlsx", ".xls"]:
                # 使用 with 语句确保 ExcelFile 句柄在读取完成后立即释放
                # 避免 Windows 上文件被占用导致后续删除失败
                with pd.ExcelFile(target) as xl:
                    sheet_names = xl.sheet_names
                sheets = {}
                for sheet in sheet_names:
                    df = pd.read_excel(target, sheet_name=sheet, nrows=max_rows, dtype=str)
                    df = df.fillna("")
                    sheets[sheet] = {
                        "columns": df.columns.tolist(),
                        "rows": df.values.tolist(),
                        "total_hint": f"显示前{max_rows}行"
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
                            "total_hint": f"显示前{max_rows}行"
                        }
                    }
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


@app.get("/api/download/{session_id}/{filepath:path}")
def download_file(session_id: str, filepath: str):
    """下载指定会话工作区中的文件"""
    ensure_session_exists(session_id)
    workspace_dir = get_session_dir(session_id)
    target = workspace_dir / filepath
    
    try:
        target.resolve().relative_to(workspace_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream"
    )


# ============================================================
# API 路由 - AI 执行
# ============================================================

@app.post("/api/execute")
async def execute(req: ExecuteRequest):
    """
    核心接口：
    1. 如果提供了 code，直接执行
    2. 否则调用 AI 生成代码再执行
    """
    ensure_session_exists(req.session_id)
    
    # 记录执行前的输出文件
    output_dir = get_session_output_dir(req.session_id)
    workspace_dir = get_session_dir(req.session_id)
    before_files = set()
    for f in output_dir.rglob("*"):
        if f.is_file():
            before_files.add(str(f.relative_to(workspace_dir).as_posix()))

    workspace_info = get_workspace_info(req.session_id)
    
    if not req.code:
        client, model = get_ai_client()
        system_prompt = build_system_prompt(workspace_info)
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if req.history:
            messages.extend(req.history)
        
        user_content = req.instruction
        if req.context and req.context.get("file_preview"):
            user_content += f"\n\n文件预览:\n{req.context['file_preview']}"
        
        messages.append({"role": "user", "content": user_content})
        
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.1,
            )
            raw = response.choices[0].message.content.strip()
            print("=" * 60)
            print("[AI RAW OUTPUT]")
            print(raw)
            print("=" * 60)
            code = extract_code(raw)
            print("[EXTRACTED CODE]")
            print(code)
            print("=" * 60)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI 调用失败: {e}")
    else:
        code = req.code
    
    stdout, stderr, success = execute_python_code(code)
    new_files = get_output_files_after(req.session_id, before_files)
    
    # 更新会话的 updated_at
    sessions = load_sessions_meta()
    for s in sessions:
        if s["id"] == req.session_id:
            s["updated_at"] = datetime.now().isoformat()
            break
    save_sessions_meta(sessions)
    
    return ExecuteResponse(
        code=code,
        stdout=stdout,
        stderr=stderr,
        success=success,
        output_files=new_files
    )


@app.post("/api/generate-code")
async def generate_code_only(req: ExecuteRequest):
    """只生成代码，不执行"""
    if not os.environ.get("ARK_API_KEY"):
        raise HTTPException(status_code=400, detail="未配置 API Key")
    
    ensure_session_exists(req.session_id)
    workspace_info = get_workspace_info(req.session_id)
    client, model = get_ai_client()
    system_prompt = build_system_prompt(workspace_info)
    
    messages = [{"role": "system", "content": system_prompt}]
    if req.history:
        messages.extend(req.history)
    messages.append({"role": "user", "content": req.instruction})
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.1,
        )
        raw = response.choices[0].message.content.strip()
        return {"code": extract_code(raw)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 调用失败: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)

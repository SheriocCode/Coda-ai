"""
AI 驱动的 Excel/Word 处理工具 - 后端服务
极简设计：接收指令 -> AI生成代码 -> 执行代码 -> 返回结果
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
WORKSPACE_DIR = Path(_workspace_env) if _workspace_env else Path("workspace")
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_DIR = WORKSPACE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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

app = FastAPI(title="AI Excel Helper", version="1.0.0")

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
    code: Optional[str] = None  # 可选：直接执行的代码（用于重试）
    context: Optional[dict] = None  # 工作区上下文（文件列表、表格预览等）
    history: Optional[list] = None  # 对话历史

class ExecuteResponse(BaseModel):
    code: str
    stdout: str
    stderr: str
    success: bool
    output_files: list  # 生成的文件列表

# ============================================================
# 工具函数
# ============================================================
def get_workspace_info() -> dict:
    """获取工作区文件信息"""
    files = []
    for f in WORKSPACE_DIR.rglob("*"):
        if f.is_file() and not f.name.startswith("."):
            rel = f.relative_to(WORKSPACE_DIR)
            files.append({
                "name": f.name,
                "path": str(rel).replace("\\", "/"),
                "size": f.stat().st_size,
                "ext": f.suffix.lower()
            })
    return {"files": files, "workspace_dir": str(WORKSPACE_DIR.absolute())}


def get_file_preview(file_path: Path, max_rows: int = 5) -> str:
    """获取文件预览（xlsx/csv）"""
    try:
        import pandas as pd
        if file_path.suffix.lower() in [".xlsx", ".xls"]:
            # 读取所有sheet
            xl = pd.ExcelFile(file_path)
            previews = []
            for sheet in xl.sheet_names[:3]:  # 最多3个sheet
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
    # 在代码头部插入 UTF-8 输出设置，解决 Windows 下中文乱码
    utf8_header = (
        "import sys, io\n"
        "sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')\n"
        "sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')\n"
    )
    full_code = utf8_header + code

    # 写入临时文件
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        f.write(full_code)
        tmp_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            timeout=120,  # 2分钟超时
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
    """
    从 AI 返回的文本中提取 Python 代码。
    兼容以下情况：
      1. 纯代码（无 markdown 包裹）
      2. ```python\\n...\\n```
      3. ```\\n...\\n```
      4. 代码前后有多余说明文字
    """
    # 优先匹配 ```python ... ``` 或 ``` ... ```
    pattern = r"```(?:python)?\s*\n?([\s\S]*?)```"
    matches = re.findall(pattern, raw)
    if matches:
        # 取最长的代码块（通常是主代码）
        return max(matches, key=len).strip()
    # 没有代码块标记，直接返回原文（去首尾空白）
    return raw.strip()


def get_output_files_after(before_files: set) -> list:
    """获取执行后新增的输出文件"""
    current_files = set()
    for f in OUTPUT_DIR.rglob("*"):
        if f.is_file():
            current_files.add(str(f.relative_to(WORKSPACE_DIR).as_posix()))
    new_files = current_files - before_files
    return sorted(new_files)


# ============================================================
# API 路由
# ============================================================

@app.get("/api/health")
def health():
    return {"status": "ok", "workspace": str(WORKSPACE_DIR.absolute())}


@app.get("/api/config")
def get_config():
    """获取当前配置（不返回敏感信息）"""
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
    """设置配置"""
    if "api_key" in data and data["api_key"]:
        os.environ["ARK_API_KEY"] = data["api_key"]
    if "model" in data and data["model"]:
        os.environ["ARK_MODEL"] = data["model"]
    if "base_url" in data and data["base_url"]:
        os.environ["ARK_BASE_URL"] = data["base_url"]
    return {"success": True}


@app.get("/api/workspace")
def get_workspace():
    """获取工作区文件列表"""
    return get_workspace_info()


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传文件到工作区"""
    # 安全处理文件名
    filename = file.filename or f"upload_{uuid.uuid4().hex[:8]}"
    # 去掉路径部分，只保留文件名
    filename = Path(filename).name
    
    dest = WORKSPACE_DIR / filename
    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # 如果是 xlsx，返回预览
    preview = ""
    if dest.suffix.lower() in [".xlsx", ".xls", ".csv"]:
        preview = get_file_preview(dest)
    
    return {
        "success": True,
        "filename": filename,
        "path": str(dest.relative_to(WORKSPACE_DIR).as_posix()),
        "size": dest.stat().st_size,
        "preview": preview
    }


@app.delete("/api/workspace/{filename:path}")
def delete_file(filename: str):
    """删除工作区文件"""
    target = WORKSPACE_DIR / filename
    # 安全检查：确保在工作区内
    try:
        target.resolve().relative_to(WORKSPACE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    if target.is_file():
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(target)
    
    return {"success": True}


@app.get("/api/preview/{filename:path}")
def preview_file(filename: str, max_rows: int = 10):
    """预览文件内容"""
    target = WORKSPACE_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    ext = target.suffix.lower()
    if ext in [".xlsx", ".xls", ".csv"]:
        try:
            import pandas as pd
            if ext in [".xlsx", ".xls"]:
                xl = pd.ExcelFile(target)
                sheets = {}
                for sheet in xl.sheet_names:
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


@app.post("/api/execute")
async def execute(req: ExecuteRequest):
    """
    核心接口：
    1. 如果提供了 code，直接执行
    2. 否则调用 AI 生成代码再执行
    """
    # 记录执行前的输出文件
    before_files = set()
    for f in OUTPUT_DIR.rglob("*"):
        if f.is_file():
            before_files.add(str(f.relative_to(WORKSPACE_DIR).as_posix()))

    workspace_info = get_workspace_info()
    
    # 如果没有直接提供代码，调用 AI 生成
    if not req.code:
        client, model = get_ai_client()
        system_prompt = build_system_prompt(workspace_info)
        
        # 构建消息历史
        messages = [{"role": "system", "content": system_prompt}]
        
        # 加入历史对话
        if req.history:
            messages.extend(req.history)
        
        # 加入当前指令
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
    
    # 执行代码
    stdout, stderr, success = execute_python_code(code)
    
    # 获取新生成的文件
    new_files = get_output_files_after(before_files)
    
    return ExecuteResponse(
        code=code,
        stdout=stdout,
        stderr=stderr,
        success=success,
        output_files=new_files
    )


@app.post("/api/generate-code")
async def generate_code_only(req: ExecuteRequest):
    """只生成代码，不执行（用于预览）"""
    if not os.environ.get("ARK_API_KEY"):
        raise HTTPException(status_code=400, detail="未配置 API Key")
    
    workspace_info = get_workspace_info()
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


@app.get("/api/download/{filepath:path}")
def download_file(filepath: str):
    """下载文件"""
    target = WORKSPACE_DIR / filepath
    try:
        target.resolve().relative_to(WORKSPACE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="非法路径")
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream"
    )


@app.post("/api/chat")
async def chat(data: dict):
    """
    纯对话接口（不执行代码），用于询问、解释等
    """
    if not os.environ.get("ARK_API_KEY"):
        raise HTTPException(status_code=400, detail="未配置 API Key")
    
    messages = data.get("messages", [])
    workspace_info = get_workspace_info()
    
    client, model = get_ai_client()
    
    system = f"""你是一个专业的数据处理助手，帮助用户处理 Excel 和 Word 文件。
当前工作区文件:
{json.dumps([f['path'] for f in workspace_info['files']], ensure_ascii=False)}

请用中文回答用户的问题。如果用户需要执行操作，告诉他们可以直接描述需求，系统会自动生成并执行代码。"""
    
    full_messages = [{"role": "system", "content": system}] + messages
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=full_messages,
        )
        return {"content": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 调用失败: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)

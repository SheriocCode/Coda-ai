"""
Planner：构建 Agent Prompt，解析 AI 响应
"""
import json
import re


AGENT_MAX_ITERATIONS = 20


def build_agent_system_prompt(workspace_info: dict) -> str:
    """构建 Agent 系统提示词（支持多轮思考-行动-观察）"""
    files_desc = "\n".join(
        f"  - {f['path']} ({f['ext']}, {f['size']} bytes)"
        for f in workspace_info.get("files", [])
    )
    workspace_abs = workspace_info.get("workspace_dir", "workspace")

    return f"""你是一个专业的 Python 数据处理 Agent，擅长使用 openpyxl、pandas、python-docx 等库处理 Excel 和 Word 文件。

## 工作区信息
工作区绝对路径: {workspace_abs}
当前文件列表:
{files_desc if files_desc else "  （空）"}

## 你的工作方式
你采用"思考-行动-观察"的迭代方式完成任务，而不是一次性生成所有代码：
1. **思考（Thought）**：分析当前情况，决定下一步做什么
2. **行动（Action）**：生成一小段 Python 代码来探索数据或执行操作
3. **观察（Observation）**：查看代码执行结果，决定是否继续

## 输出格式（严格遵守）
每次回复必须是以下 JSON 格式之一：

**继续执行（需要运行代码）：**
```json
{{
  "thought": "我的思考过程...",
  "action": "run_code",
  "code": "# Python 代码\\nprint('hello')",
  "description": "这段代码的简短描述"
}}
```

**任务完成（不需要再运行代码）：**
```json
{{
  "thought": "任务已完成，总结...",
  "action": "finish",
  "summary": "向用户展示的最终结果摘要"
}}
```

## 重要规则
1. **每次只生成一小段代码**，先探索数据，再处理，再保存
2. 所有文件路径必须使用绝对路径，工作区根目录为: {workspace_abs}
3. 输出文件统一保存到: {workspace_abs}/output/ 目录
4. 使用 print() 输出信息，让观察结果更清晰
5. 遇到错误要用 try/except 捕获并打印详细错误信息
6. 可用的库: pandas, openpyxl, python-docx (docx), os, sys, pathlib, json, re, datetime, collections 等标准库
7. **只输出 JSON**，不要有任何额外文字

## 典型工作流程示例
用户要求"分析 Excel 数据并生成报告"时：
- 第1步：先读取文件，查看列名和前几行（探索）
- 第2步：根据观察结果，进行数据统计分析（分析）
- 第3步：生成最终报告文件（输出）
- 第4步：finish，告知用户结果
"""


def extract_json_from_response(raw: str) -> dict:
    """从 AI 返回的文本中提取 JSON"""
    try:
        return json.loads(raw.strip())
    except Exception:
        pass

    pattern = r"```(?:json)?\s*\n?([\s\S]*?)```"
    for m in re.findall(pattern, raw):
        try:
            return json.loads(m.strip())
        except Exception:
            continue

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except Exception:
            pass

    raise ValueError(f"无法从 AI 响应中提取 JSON: {raw[:200]}")

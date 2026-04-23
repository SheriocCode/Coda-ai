"""
Agent Service：AI 总入口
包含 Agent 循环（SSE 流式）模式
"""
import json
import asyncio
from typing import AsyncGenerator

from ai_clients.openai_client import get_default_client
from services.ai.planner import (
    AGENT_MAX_ITERATIONS,
    build_agent_system_prompt,
    extract_json_from_response,
)
from services.ai.executor import run_code_async
from services.crud.workspace_service import get_output_files_after
from services.crud.session_service import (
    get_session_output_dir,
    get_session_dir,
    touch_session,
)


# ── SSE 工具 ──────────────────────────────────────────────────

def sse_event(event_type: str, data: dict) -> str:
    """构建 SSE 事件字符串"""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {payload}\n\n"


# ── Agent 循环（SSE 流式） ─────────────────────────────────────

async def run_agent_loop(
    session_id: str,
    instruction: str,
    history: list,
    workspace_info: dict,
) -> AsyncGenerator[str, None]:
    """
    Agent 循环：思考 → 行动（执行代码）→ 观察 → 循环
    通过 SSE 流式推送每一步的状态
    """
    client = get_default_client()
    system_prompt = build_agent_system_prompt(workspace_info)

    # 记录执行前的输出文件集合
    output_dir = get_session_output_dir(session_id)
    workspace_dir = get_session_dir(session_id)
    before_files: set = set()
    for f in output_dir.rglob("*"):
        if f.is_file():
            before_files.add(str(f.relative_to(workspace_dir).as_posix()))

    # 构建消息列表
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history[-10:])
    messages.append({"role": "user", "content": instruction})

    iteration = 0
    all_output_files: list = []

    yield sse_event("start", {
        "message": "Agent 开始工作...",
        "iteration": 0,
        "max_iterations": AGENT_MAX_ITERATIONS,
    })

    while iteration < AGENT_MAX_ITERATIONS:
        iteration += 1

        yield sse_event("thinking", {
            "message": f"第 {iteration} 轮思考中...",
            "iteration": iteration,
        })

        # 调用 AI
        try:
            raw = client.chat(messages, temperature=0.1)
            print(f"\n{'='*60}")
            print(f"[Agent 第{iteration}轮 AI 原始输出]")
            print(raw)
            print("=" * 60)
        except Exception as e:
            yield sse_event("error", {"message": f"AI 调用失败: {e}", "iteration": iteration})
            return

        # 解析 AI 响应
        try:
            agent_response = extract_json_from_response(raw)
        except ValueError as e:
            yield sse_event("error", {
                "message": f"AI 响应格式错误: {e}",
                "raw": raw[:500],
                "iteration": iteration,
            })
            return

        thought = agent_response.get("thought", "")
        action = agent_response.get("action", "")

        if thought:
            yield sse_event("thought", {"content": thought, "iteration": iteration})

        # finish 动作
        if action == "finish":
            summary = agent_response.get("summary", "任务已完成")
            new_files = get_output_files_after(session_id, before_files)
            all_output_files.extend(f for f in new_files if f not in all_output_files)
            yield sse_event("finish", {
                "summary": summary,
                "output_files": all_output_files,
                "iteration": iteration,
            })
            touch_session(session_id)
            return

        # run_code 动作
        if action == "run_code":
            code = agent_response.get("code", "")
            description = agent_response.get("description", "执行代码")

            if not code.strip():
                yield sse_event("error", {"message": "AI 返回了空代码", "iteration": iteration})
                return

            yield sse_event("action", {
                "description": description,
                "code": code,
                "iteration": iteration,
            })

            stdout, stderr, success = await run_code_async(code)

            new_files = get_output_files_after(session_id, before_files)
            step_new_files = [f for f in new_files if f not in all_output_files]
            all_output_files.extend(step_new_files)

            yield sse_event("observation", {
                "stdout": stdout,
                "stderr": stderr,
                "success": success,
                "new_files": step_new_files,
                "iteration": iteration,
            })

            # 将执行结果加入消息历史
            messages.append({"role": "assistant", "content": raw})
            obs_parts = []
            if stdout:
                obs_parts.append(f"执行输出:\n{stdout}")
            if stderr:
                obs_parts.append(f"错误信息:\n{stderr}")
            if not stdout and not stderr:
                obs_parts.append("代码执行完成，无输出")
            if step_new_files:
                obs_parts.append(f"新生成的文件: {', '.join(step_new_files)}")
            obs_parts.append(f"执行状态: {'成功' if success else '失败'}")
            messages.append({
                "role": "user",
                "content": f"[观察结果]\n{chr(10).join(obs_parts)}\n\n请继续下一步。",
            })
            continue

        # 未知动作
        yield sse_event("error", {
            "message": f"未知的 action 类型: {action}",
            "iteration": iteration,
        })
        return

    # 超过最大迭代次数
    yield sse_event("finish", {
        "summary": f"已达到最大迭代次数（{AGENT_MAX_ITERATIONS}轮），任务可能未完全完成。",
        "output_files": all_output_files,
        "iteration": iteration,
        "max_reached": True,
    })
    touch_session(session_id)

"""
AI 对话相关路由（Agent 循环 + 代码直接执行）
"""
import traceback
import asyncio
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from routers.deps import require_api_key
from schemas.ai.chat import AgentRunRequest, ExecuteCodeRequest, ExecuteCodeResponse
import services.crud.session_service as session_svc
import services.crud.workspace_service as ws_svc
from services.ai.agent_service import run_agent_loop, sse_event
from services.ai.executor import run_code_sync
from services.crud.session_service import get_session_output_dir, get_session_dir, touch_session
from services.crud.workspace_service import get_output_files_after

router = APIRouter(tags=["ai"])


@router.post("/api/agent/run")
async def agent_run(req: AgentRunRequest, _: None = Depends(require_api_key)):
    """
    Agent 循环接口：AI 自主决定"思考-行动-观察"多轮迭代
    使用 SSE（Server-Sent Events）流式推送每一步状态
    """
    session_svc.ensure_session_exists(req.session_id)
    workspace_info = ws_svc.get_workspace_info(req.session_id)
    history = req.history or []

    async def event_generator():
        try:
            async for event in run_agent_loop(
                session_id=req.session_id,
                instruction=req.instruction,
                history=history,
                workspace_info=workspace_info,
            ):
                yield event
                await asyncio.sleep(0)
        except Exception as e:
            tb = traceback.format_exc()
            print(f"[Agent Error] {tb}")
            yield sse_event("error", {"message": f"Agent 运行异常: {e}", "traceback": tb})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/api/execute", response_model=ExecuteCodeResponse)
def execute_code(req: ExecuteCodeRequest):
    """
    直接执行代码接口：用户在前端编辑 Agent 生成的代码后，提交执行
    只执行代码，不调用 AI
    """
    session_svc.ensure_session_exists(req.session_id)

    output_dir = get_session_output_dir(req.session_id)
    workspace_dir = get_session_dir(req.session_id)
    before_files: set = set()
    for f in output_dir.rglob("*"):
        if f.is_file():
            before_files.add(str(f.relative_to(workspace_dir).as_posix()))

    stdout, stderr, success = run_code_sync(req.code)
    new_files = get_output_files_after(req.session_id, before_files)
    touch_session(req.session_id)

    return ExecuteCodeResponse(
        code=req.code,
        stdout=stdout,
        stderr=stderr,
        success=success,
        output_files=new_files,
    )

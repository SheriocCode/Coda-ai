"""
AI 驱动的 Excel/Word 处理工具 - 后端服务入口
"""
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# 加载环境变量（必须在其他模块导入之前）
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db
from routers.system import router as system_router
from routers.crud.session import router as session_router
from routers.crud.workspace import router as workspace_router
from routers.ai.chat import router as ai_chat_router


# ── 生命周期管理 ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动时初始化数据库，关闭时做清理"""
    init_db()
    yield


# ── 应用初始化 ────────────────────────────────────────────────

app = FastAPI(
    title="AI Excel Helper",
    version="4.0.0",
    description="AI 驱动的 Excel/Word 处理工具后端服务",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 注册路由 ──────────────────────────────────────────────────

app.include_router(system_router)
app.include_router(session_router)
app.include_router(workspace_router)
app.include_router(ai_chat_router)


# ── 开发模式直接运行 ──────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)

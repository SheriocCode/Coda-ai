backend/
├── routers/                      # 【API 层】HTTP 接口定义
│   ├── __init__.py
│   ├── deps.py               # 依赖注入（DB Session、Current User）
│   ├── crud/                    # CRUD 接口
│   │   ├── __init__.py
│   │   ├── workspace.py         
│   │   └── session.py          
│   └── ai/                      # AI 相关接口
│       ├── __init__.py
│       ├── chat.py               # 对话接口
│       ├── commands.py           # 命令执行接口
│       └── workflows.py          # 工作流接口(扩展)
│
├── db/                   
│   ├── __init__.py
│   ├── database.py            # Engine、SessionLocal、Base 声明
│   ├── models/                # SQLAlchemy ORM 模型
│   │   ├── __init__.py
│   │   ├── session.py         # 会话表（存储上下文ID等）
│   │   ├── file.py            # 文件元数据表（路径、类型）
│   │   └── task.py            # 任务记录表（AI输入输出的载体）
│   └── repositories/          # 数据访问层（Repository）
│       ├── __init__.py
│       ├── base_repo.py       # 基础 CRUD 方法
│       ├── file_repo.py       # 文件查询/存储
│       └── task_repo.py       # 任务状态/日志查询
│
├── schemas/                  # 定义所有对外数据交换结构，包括前端 API 请求 / 响应，AI 输入 / 输出（黑盒边界），文件、会话等跨模块数据结构等
│   ├── __init__.py
│   ├── common.py             # 通用响应模型
│   ├── crud/               # 普通 CRUD 的 Schema
│   └── ai/             # AI 黑盒的输入/输出 Schema
│
├── services/                     # 唯一业务编排层
│   ├── __init__.py
│   │
│   ├── crud/                     # CRUD 业务
│   │   ├── workspace_service.py
│   │   └── session_service.py
│   │
│   └── ai/
│       ├── agent_service.py      # AI 总入口
│       ├── planner.py            # 决定“要不要调 AI / 调哪个”
│       └── executor.py           # 执行 AI 返回的 action
│
├── ai_clients/                   # AI 黑盒网络边界
│   ├── __init__.py
│   ├── base.py                   # 统一 client 接口
│   ├── openai_client.py          # 示例
│   └── local_llm_client.py       # 本地模型
│
├── office_executor/              # 本地能力执行
│   ├── __init__.py
│   ├── base.py
│   ├── python_executor.py        # pandas / openpyxl
│   └── com_executor.py           # win32com
│
├── utils/
│
├── workspace/                         # 输出存放目录
│   ├── sessions/
│   │   └── session-0a3800635ea8/    # 一个session对应一个文件夹
│   │        ├── uploads/         # 用户上传的原始文件
│   │        └── output/          # 输出的文件
│   └── app.db                      # 整个软件的database
├── main.py                       # FastAPI 应用入口
├── requirements.txt
└── README.md
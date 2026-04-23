"""
任务记录表 ORM 模型（AI 输入/输出的载体）
"""
from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    instruction: Mapped[str] = mapped_column(Text, nullable=False)   # 用户指令
    generated_code: Mapped[str] = mapped_column(Text, nullable=True)  # AI 生成的代码
    stdout: Mapped[str] = mapped_column(Text, nullable=True)
    stderr: Mapped[str] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=True)
    output_files: Mapped[str] = mapped_column(Text, nullable=True)   # JSON 序列化的文件列表
    iterations: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    def to_dict(self) -> dict:
        import json
        return {
            "id": self.id,
            "session_id": self.session_id,
            "instruction": self.instruction,
            "generated_code": self.generated_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "success": self.success,
            "output_files": json.loads(self.output_files) if self.output_files else [],
            "iterations": self.iterations,
            "created_at": self.created_at.isoformat(),
        }

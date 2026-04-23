"""
任务记录 Repository
"""
from typing import List
from sqlalchemy.orm import Session
from db.models.task import Task
from db.repositories.base_repo import BaseRepository


class TaskRepository(BaseRepository[Task]):
    def __init__(self, db: Session):
        super().__init__(Task, db)

    def get_by_session(self, session_id: str) -> List[Task]:
        return (
            self.db.query(Task)
            .filter(Task.session_id == session_id)
            .order_by(Task.created_at.asc())
            .all()
        )

    def delete_by_session(self, session_id: str) -> None:
        self.db.query(Task).filter(Task.session_id == session_id).delete()
        self.db.commit()

"""
文件元数据 Repository
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from db.models.file import File
from db.repositories.base_repo import BaseRepository


class FileRepository(BaseRepository[File]):
    def __init__(self, db: Session):
        super().__init__(File, db)

    def get_by_session(self, session_id: str) -> List[File]:
        return (
            self.db.query(File)
            .filter(File.session_id == session_id)
            .order_by(File.created_at.asc())
            .all()
        )

    def get_by_path(self, session_id: str, relative_path: str) -> Optional[File]:
        return (
            self.db.query(File)
            .filter(File.session_id == session_id, File.relative_path == relative_path)
            .first()
        )

    def delete_by_session(self, session_id: str) -> None:
        self.db.query(File).filter(File.session_id == session_id).delete()
        self.db.commit()

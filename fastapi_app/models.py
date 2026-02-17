import uuid
from datetime import datetime
from sqlalchemy import Column, Text, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(Text, nullable=False)
    slug = Column(Text, nullable=False, unique=True)
    plan = Column(Text, nullable=False, server_default=text("'free'"))
    status = Column(Text, nullable=False, server_default=text("'active'"))
    created_at = Column(DateTime, nullable=False, server_default=text("now()"))

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    roles = relationship("Role", back_populates="tenant", cascade="all, delete-orphan")


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)
    permissions = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    tenant = relationship("Tenant", back_populates="roles")
    users = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True)
    username = Column(Text, nullable=False, unique=True)
    email = Column(Text, nullable=False)
    password = Column(Text, nullable=False)
    reports_to = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(Text, nullable=False, server_default=text("'active'"))
    created_at = Column(DateTime, nullable=False, server_default=text("now()"))

    tenant = relationship("Tenant", back_populates="users")
    role = relationship("Role", back_populates="users")
    manager = relationship("User", remote_side="User.id", foreign_keys=[reports_to])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    table_name = Column(Text, nullable=False)
    operation = Column(Text, nullable=False)
    record_id = Column(UUID(as_uuid=True), nullable=True)
    old_data = Column(JSONB, nullable=True)
    new_data = Column(JSONB, nullable=True)
    changed_at = Column(DateTime, nullable=False, server_default=text("now()"))
    changed_by = Column(Text, nullable=True)

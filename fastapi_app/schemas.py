from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict, field_validator


class PermissionLevel(str, Enum):
    none = "none"
    read = "read"
    write = "write"
    admin = "admin"


class Permissions(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    projects: PermissionLevel = PermissionLevel.none
    billing: PermissionLevel = PermissionLevel.none
    users: PermissionLevel = PermissionLevel.none
    settings: PermissionLevel = PermissionLevel.none
    reports: PermissionLevel = PermissionLevel.none

    @field_validator("*", mode="before")
    @classmethod
    def validate_permission_level(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.lower()
            valid = {e.value for e in PermissionLevel}
            if v not in valid:
                raise ValueError(f"Invalid permission level '{v}'. Must be one of: {', '.join(valid)}")
        return v


class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    plan: str = Field(default="free", pattern=r"^(free|starter|pro|professional|enterprise)$")
    status: str = Field(default="active", pattern=r"^(active|inactive|suspended)$")


class TenantCreate(TenantBase):
    pass


class TenantResponse(TenantBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime


class RoleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    permissions: Permissions = Field(default_factory=Permissions)


class RoleCreate(RoleBase):
    tenant_id: UUID


class RoleResponse(RoleBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID


class UserBase(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=1, max_length=255)
    status: str = Field(default="active", pattern=r"^(active|inactive|suspended)$")


class UserCreate(UserBase):
    tenant_id: UUID
    role_id: Optional[UUID] = None
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[str] = Field(None, pattern=r"^(active|inactive|suspended)$")
    role_id: Optional[UUID] = None
    password: Optional[str] = Field(None, min_length=6)


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    role_id: Optional[UUID] = None
    created_at: datetime


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    table_name: str
    operation: str
    record_id: Optional[UUID] = None
    old_data: Optional[dict[str, Any]] = None
    new_data: Optional[dict[str, Any]] = None
    changed_at: datetime
    changed_by: Optional[str] = None


class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: UUID
    user_id: UUID


class RLSDemoResponse(BaseModel):
    tenant_id: UUID
    users: list[UserResponse]
    roles: list[RoleResponse]
    message: str

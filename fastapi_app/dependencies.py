import os
from typing import AsyncGenerator, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi_app.database import AsyncSessionLocal

JWT_SECRET = os.environ.get("SESSION_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"


class TenantContext:
    def __init__(self, tenant_id: Optional[str] = None, user_id: Optional[str] = None, username: Optional[str] = None):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.username = username


def get_tenant_context(request: Request) -> TenantContext:
    return getattr(request.state, "tenant_context", TenantContext())


async def get_tenant_session(
    request: Request,
) -> AsyncGenerator[AsyncSession, None]:
    ctx: TenantContext = getattr(request.state, "tenant_context", TenantContext())
    async with AsyncSessionLocal() as session:
        async with session.begin():
            if ctx.tenant_id:
                await session.execute(text("SET LOCAL ROLE app_user"))
                await session.execute(text("SELECT set_config('app.current_tenant_id', :v, true)"), {"v": str(ctx.tenant_id)})
                if ctx.username:
                    await session.execute(text("SELECT set_config('app.current_username', :v, true)"), {"v": ctx.username})
            yield session


async def get_admin_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session


def require_tenant(request: Request) -> TenantContext:
    ctx: TenantContext = getattr(request.state, "tenant_context", TenantContext())
    if not ctx.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-ID header is required",
        )
    return ctx


def require_auth(request: Request) -> TenantContext:
    ctx: TenantContext = getattr(request.state, "tenant_context", TenantContext())
    if not ctx.user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid JWT token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return ctx

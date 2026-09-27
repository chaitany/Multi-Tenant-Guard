import os
import logging
from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi_app.database import AsyncSessionLocal, engine
from fastapi_app.dependencies import (
    JWT_ALGORITHM,
    JWT_SECRET,
    TenantContext,
    get_admin_session,
    get_tenant_session,
    require_auth,
    require_tenant,
)
from fastapi_app.models import AuditLog, Base, Role, Tenant, User
from fastapi_app.schemas import (
    AuditLogResponse,
    RLSDemoResponse,
    RoleCreate,
    RoleResponse,
    TokenRequest,
    TokenResponse,
    TenantCreate,
    TenantResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tenantguard")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("TenantGuard FastAPI starting up")
    yield
    await engine.dispose()
    logger.info("TenantGuard FastAPI shut down")


app = FastAPI(
    title="TenantGuard API",
    description="Multi-tenant SaaS API with PostgreSQL RLS, JSONB permissions, and audit logging",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def tenant_jwt_middleware(request: Request, call_next) -> Response:
    tenant_id: Optional[str] = request.headers.get("X-Tenant-ID")
    user_id: Optional[str] = None
    username: Optional[str] = None

    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            username = payload.get("username")
            if not tenant_id:
                tenant_id = payload.get("tenant_id")
        except JWTError:
            pass

    if tenant_id:
        try:
            UUID(tenant_id)
        except (ValueError, TypeError):
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid X-Tenant-ID format, must be a valid UUID"},
            )

    request.state.tenant_context = TenantContext(
        tenant_id=tenant_id,
        user_id=user_id,
        username=username,
    )

    response = await call_next(request)
    return response


@app.post("/api/auth/token", response_model=TokenResponse, tags=["Auth"])
async def login(
    body: TokenRequest,
    db: AsyncSession = Depends(get_admin_session),
):
    result = await db.execute(
        select(User).where(User.username == body.username)
    )
    user = result.scalars().first()
    if not user or not verify_password(body.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token_data = {
        "sub": str(user.id),
        "username": user.username,
        "tenant_id": str(user.tenant_id),
    }
    access_token = jwt.encode(token_data, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return TokenResponse(
        access_token=access_token,
        tenant_id=user.tenant_id,
        user_id=user.id,
    )


@app.get("/api/tenants", response_model=list[TenantResponse], tags=["Tenants"])
async def list_tenants(db: AsyncSession = Depends(get_admin_session)):
    result = await db.execute(select(Tenant).order_by(Tenant.created_at))
    return result.scalars().all()


@app.post("/api/tenants", response_model=TenantResponse, status_code=201, tags=["Tenants"])
async def create_tenant(
    body: TenantCreate,
    db: AsyncSession = Depends(get_admin_session),
):
    tenant = Tenant(
        name=body.name,
        slug=body.slug,
        plan=body.plan,
        status=body.status,
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant


@app.get("/api/users", response_model=list[UserResponse], tags=["Users"])
async def list_users(db: AsyncSession = Depends(get_tenant_session)):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@app.post("/api/users", response_model=UserResponse, status_code=201, tags=["Users"])
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_admin_session),
):
    hashed_password = hash_password(body.password)
    user = User(
        tenant_id=body.tenant_id,
        role_id=body.role_id,
        username=body.username,
        email=body.email,
        password=hashed_password,
        status=body.status,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@app.patch("/api/users/{user_id}", response_model=UserResponse, tags=["Users"])
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_tenant_session),
    ctx: TenantContext = Depends(require_tenant),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["password"] = hash_password(update_data["password"])

    for key, value in update_data.items():
        setattr(user, key, value)
    await db.flush()
    await db.refresh(user)
    return user


@app.get("/api/roles", response_model=list[RoleResponse], tags=["Roles"])
async def list_roles(db: AsyncSession = Depends(get_tenant_session)):
    result = await db.execute(select(Role).order_by(Role.name))
    return result.scalars().all()


@app.post("/api/roles", response_model=RoleResponse, status_code=201, tags=["Roles"])
async def create_role(
    body: RoleCreate,
    db: AsyncSession = Depends(get_admin_session),
):
    role = Role(
        tenant_id=body.tenant_id,
        name=body.name,
        permissions=body.permissions.model_dump(),
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)
    return role


@app.get("/api/audit-logs", response_model=list[AuditLogResponse], tags=["Audit"])
async def list_audit_logs(db: AsyncSession = Depends(get_admin_session)):
    result = await db.execute(select(AuditLog).order_by(AuditLog.changed_at.desc()))
    return result.scalars().all()


@app.get("/api/rls-demo/{tenant_id}", response_model=RLSDemoResponse, tags=["RLS Demo"])
async def rls_demo(tenant_id: UUID):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(text("SET LOCAL ROLE app_user"))
            await session.execute(text("SELECT set_config('app.current_tenant_id', :v, true)"), {"v": str(tenant_id)})
            users_result = await session.execute(select(User).order_by(User.username))
            roles_result = await session.execute(select(Role).order_by(Role.name))
            users = users_result.scalars().all()
            roles = roles_result.scalars().all()

    return RLSDemoResponse(
        tenant_id=tenant_id,
        users=users,
        roles=roles,
        message=f"RLS filtered results: {len(users)} users and {len(roles)} roles visible for tenant {tenant_id}",
    )


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "TenantGuard FastAPI"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_app.main:app", host="0.0.0.0", port=8000, reload=True)

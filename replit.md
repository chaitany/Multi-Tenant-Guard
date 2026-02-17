# TenantGuard - Multi-Tenant SaaS Application

## Overview
A multi-tenant SaaS platform demonstrating PostgreSQL Row-Level Security (RLS), JSONB-based roles/permissions, and audit logging via triggers.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend (Node.js)**: Express.js with Drizzle ORM (port 5000)
- **Backend (Python)**: FastAPI with async SQLAlchemy, Pydantic v2 (port 8000)
- **Database**: PostgreSQL with RLS policies and triggers
- **Routing**: wouter for client-side routing

## Key Features
1. **Tenants Management** - Create and view organizations
2. **Users Management** - CRUD users scoped to tenants with role assignments
3. **Roles & Permissions** - JSONB-based granular permissions (projects, billing, users, settings, reports)
4. **Audit Logs** - Automatic PostgreSQL trigger captures OLD/NEW state on users table changes
5. **Row-Level Security** - RLS policies enforce tenant isolation on users and roles tables

## Database Schema
- `tenants` - Organizations with plan and status
- `users` - Users belonging to tenants with optional role assignment
- `roles` - Roles with JSONB permissions column scoped to tenants
- `audit_logs` - Automatic change tracking with old_data/new_data JSONB

## Project Structure

### Node.js Backend
- `shared/schema.ts` - Drizzle ORM schema definitions and Zod validation
- `server/db.ts` - Database connection pool
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - Express API routes
- `server/rls-and-triggers.ts` - RLS policies and audit trigger setup
- `server/seed.ts` - Seed data for initial demo

### FastAPI Backend
- `fastapi_app/main.py` - FastAPI app with all routes, JWT auth, bcrypt password hashing
- `fastapi_app/database.py` - Async SQLAlchemy engine and session factory
- `fastapi_app/models.py` - SQLAlchemy models matching existing PostgreSQL schema
- `fastapi_app/schemas.py` - Pydantic v2 schemas with strict JSONB permission validation (PermissionLevel enum)
- `fastapi_app/dependencies.py` - Session dependencies that enforce RLS via SET LOCAL, JWT/tenant context extraction
- `test_fastapi.py` - Comprehensive test suite (22 tests)

### Frontend
- `client/src/pages/` - Dashboard, Tenants, Users, Roles, Audit Logs pages
- `client/src/components/` - Sidebar, theme provider, theme toggle

## API Routes (both backends)
- `GET/POST /api/tenants` - List/create tenants
- `GET/POST/PATCH /api/users` - List/create/update users (RLS filtered by X-Tenant-ID or JWT)
- `GET/POST /api/roles` - List/create roles with JSONB permissions
- `GET /api/audit-logs` - List audit logs
- `POST /api/auth/token` - JWT login (FastAPI only)
- `GET /api/rls-demo/:tenantId` - RLS demo endpoint (FastAPI only)
- `GET /api/health` - Health check (FastAPI only)

## Technical Notes
- Audit trigger uses `current_setting('app.current_username', true)` for changed_by tracking
- FastAPI uses direct `bcrypt` library (not passlib) due to version compatibility
- FastAPI middleware uses `@app.middleware("http")` pattern (not BaseHTTPMiddleware) to avoid async generator crashes
- RLS enforced via `SET LOCAL ROLE app_user` and `SET LOCAL app.current_tenant_id`

## Running
- `npm run dev` starts Express + Vite dev server on port 5000
- `python -m uvicorn fastapi_app.main:app --host 0.0.0.0 --port 8000` starts FastAPI on port 8000

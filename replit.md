# TenantGuard - Multi-Tenant SaaS Application

## Overview
A multi-tenant SaaS platform demonstrating PostgreSQL Row-Level Security (RLS), JSONB-based roles/permissions, and audit logging via triggers.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js with Drizzle ORM
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
- `shared/schema.ts` - Drizzle ORM schema definitions and Zod validation
- `server/db.ts` - Database connection pool
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - Express API routes
- `server/rls-and-triggers.ts` - RLS policies and audit trigger setup
- `server/seed.ts` - Seed data for initial demo
- `client/src/pages/` - Dashboard, Tenants, Users, Roles, Audit Logs pages
- `client/src/components/` - Sidebar, theme provider, theme toggle

## API Routes
- `GET/POST /api/tenants` - List/create tenants
- `GET/POST/PATCH /api/users` - List/create/update users
- `GET/POST /api/roles` - List/create roles
- `GET /api/audit-logs` - List audit logs

## Running
- `npm run dev` starts Express + Vite dev server on port 5000

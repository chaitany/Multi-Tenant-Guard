"""
TenantGuard High-Load Simulation & Performance Analysis
========================================================
Demonstrates:
  1. Batch insertion of 1,000 users across 10 tenants using asyncio
  2. Recursive CTE to traverse a managerial hierarchy (who reports to whom)
  3. EXPLAIN ANALYZE on RLS-filtered tenant queries with results logged to file
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime

import bcrypt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

ASYNC_DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://")
if "?" in ASYNC_DB_URL:
    ASYNC_DB_URL = ASYNC_DB_URL.split("?")[0]

engine = create_async_engine(ASYNC_DB_URL, pool_size=20, max_overflow=10)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

LOG_FILE = "scripts/performance_report.log"
TOTAL_USERS = 1000
NUM_TENANTS = 10
USERS_PER_TENANT = TOTAL_USERS // NUM_TENANTS
BATCH_SIZE = 50
DEFAULT_PASSWORD_HASH = bcrypt.hashpw(b"loadtest123", bcrypt.gensalt()).decode("utf-8")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("load_test")


async def verify_reports_to_column(session: AsyncSession) -> None:
    result = await session.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'reports_to'
    """))
    if not result.scalar():
        raise RuntimeError(
            "Column 'reports_to' does not exist on the users table. "
            "Start the Node.js app first (npm run dev) to run schema setup, "
            "or add the column manually: ALTER TABLE users ADD COLUMN reports_to UUID REFERENCES users(id);"
        )
    logger.info("Verified 'reports_to' column exists")


async def create_load_test_tenants(session: AsyncSession) -> list[dict]:
    tenants = []
    for i in range(NUM_TENANTS):
        tenant_id = str(uuid.uuid4())
        slug = f"loadtest-tenant-{i:03d}-{uuid.uuid4().hex[:6]}"
        await session.execute(text("""
            INSERT INTO tenants (id, name, slug, plan, status)
            VALUES (:id, :name, :slug, :plan, 'active')
        """), {
            "id": tenant_id,
            "name": f"LoadTest Org {i:03d}",
            "slug": slug,
            "plan": ["free", "pro", "enterprise"][i % 3],
        })
        tenants.append({"id": tenant_id, "name": f"LoadTest Org {i:03d}", "slug": slug})
    await session.commit()
    logger.info("Created %d load-test tenants", NUM_TENANTS)
    return tenants


async def batch_insert_users(
    session: AsyncSession,
    tenant: dict,
    tenant_index: int,
) -> list[str]:
    user_ids: list[str] = []
    rows = []
    for j in range(USERS_PER_TENANT):
        uid = str(uuid.uuid4())
        user_ids.append(uid)
        global_index = tenant_index * USERS_PER_TENANT + j
        rows.append({
            "id": uid,
            "tenant_id": tenant["id"],
            "username": f"lt_user_{global_index:04d}",
            "email": f"lt_user_{global_index:04d}@loadtest.dev",
            "password": DEFAULT_PASSWORD_HASH,
            "status": "active",
        })

    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        values_clause = ", ".join(
            f"(:id_{k}, :tenant_id_{k}, :username_{k}, :email_{k}, :password_{k}, :status_{k})"
            for k in range(len(batch))
        )
        params = {}
        for k, row in enumerate(batch):
            for col, val in row.items():
                params[f"{col}_{k}"] = val
        await session.execute(text(f"""
            INSERT INTO users (id, tenant_id, username, email, password, status)
            VALUES {values_clause}
        """), params)
    await session.commit()
    return user_ids


async def assign_hierarchy(
    session: AsyncSession,
    tenant_id: str,
    user_ids: list[str],
) -> None:
    manager_id = user_ids[0]
    for uid in user_ids[1:6]:
        await session.execute(text("""
            UPDATE users SET reports_to = :mgr WHERE id = :uid
        """), {"mgr": manager_id, "uid": uid})

    for tier, start in enumerate([6, 16, 36], start=1):
        parent_pool = user_ids[1:6] if tier == 1 else user_ids[start - (start - 6) : start]
        end = min(start + [10, 20, USERS_PER_TENANT - 36][tier - 1], len(user_ids))
        for idx in range(start, end):
            parent = parent_pool[idx % len(parent_pool)]
            await session.execute(text("""
                UPDATE users SET reports_to = :mgr WHERE id = :uid
            """), {"mgr": parent, "uid": user_ids[idx]})

    await session.commit()


async def insert_users_for_tenant(tenant: dict, tenant_index: int) -> int:
    async with AsyncSessionLocal() as session:
        user_ids = await batch_insert_users(session, tenant, tenant_index)
        await assign_hierarchy(session, tenant["id"], user_ids)
        return len(user_ids)


async def run_batch_insert(tenants: list[dict]) -> float:
    logger.info(
        "Starting batch insert of %d users across %d tenants (batch size: %d)",
        TOTAL_USERS, NUM_TENANTS, BATCH_SIZE,
    )
    t0 = time.perf_counter()
    tasks = [insert_users_for_tenant(t, i) for i, t in enumerate(tenants)]
    results = await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - t0
    total = sum(results)
    logger.info(
        "Inserted %d users in %.2fs (%.0f users/sec)",
        total, elapsed, total / elapsed if elapsed > 0 else 0,
    )
    return elapsed


async def recursive_hierarchy_cte(session: AsyncSession, tenant_id: str) -> list[dict]:
    result = await session.execute(text("""
        WITH RECURSIVE management_chain AS (
            SELECT
                u.id,
                u.username,
                u.email,
                u.reports_to,
                u.tenant_id,
                1 AS depth,
                u.username::TEXT AS chain
            FROM users u
            WHERE u.tenant_id = :tid AND u.reports_to IS NULL

            UNION ALL

            SELECT
                u.id,
                u.username,
                u.email,
                u.reports_to,
                u.tenant_id,
                mc.depth + 1,
                mc.chain || ' -> ' || u.username
            FROM users u
            INNER JOIN management_chain mc ON u.reports_to = mc.id
            WHERE u.tenant_id = :tid
        )
        SELECT
            mc.username      AS employee,
            mc.email,
            mgr.username     AS manager,
            mc.depth,
            mc.chain         AS reporting_chain
        FROM management_chain mc
        LEFT JOIN users mgr ON mc.reports_to = mgr.id
        ORDER BY mc.depth, mc.username
    """), {"tid": tenant_id})

    rows = result.fetchall()
    hierarchy = [
        {
            "employee": r.employee,
            "email": r.email,
            "manager": r.manager,
            "depth": r.depth,
            "reporting_chain": r.reporting_chain,
        }
        for r in rows
    ]
    return hierarchy


async def explain_analyze_tenant_query(
    session: AsyncSession,
    tenant_id: str,
    log_lines: list[str],
) -> None:
    await session.execute(text("RESET ROLE"))

    result = await session.execute(text("""
        EXPLAIN ANALYZE
        SELECT u.id, u.username, u.email, u.status, r.name AS role_name, r.permissions
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.tenant_id = :tid
        ORDER BY u.created_at DESC
    """), {"tid": tenant_id})

    plan_rows = result.fetchall()
    log_lines.append(f"\n--- EXPLAIN ANALYZE for tenant {tenant_id} ---")
    for row in plan_rows:
        log_lines.append(row[0])


async def explain_analyze_hierarchy_cte(
    session: AsyncSession,
    tenant_id: str,
    log_lines: list[str],
) -> None:
    await session.execute(text("RESET ROLE"))

    result = await session.execute(text("""
        EXPLAIN ANALYZE
        WITH RECURSIVE management_chain AS (
            SELECT u.id, u.username, u.reports_to, u.tenant_id,
                   1 AS depth, u.username::TEXT AS chain
            FROM users u
            WHERE u.tenant_id = :tid AND u.reports_to IS NULL
            UNION ALL
            SELECT u.id, u.username, u.reports_to, u.tenant_id,
                   mc.depth + 1, mc.chain || ' -> ' || u.username
            FROM users u
            INNER JOIN management_chain mc ON u.reports_to = mc.id
            WHERE u.tenant_id = :tid
        )
        SELECT mc.username, mgr.username AS manager, mc.depth, mc.chain
        FROM management_chain mc
        LEFT JOIN users mgr ON mc.reports_to = mgr.id
        ORDER BY mc.depth, mc.username
    """), {"tid": tenant_id})

    plan_rows = result.fetchall()
    log_lines.append(f"\n--- EXPLAIN ANALYZE: Recursive CTE Hierarchy (tenant {tenant_id}) ---")
    for row in plan_rows:
        log_lines.append(row[0])


async def cleanup(tenants: list[dict]) -> None:
    async with AsyncSessionLocal() as session:
        tenant_ids = [t["id"] for t in tenants]
        for tid in tenant_ids:
            await session.execute(text("DELETE FROM users WHERE tenant_id = :tid"), {"tid": tid})
        for tid in tenant_ids:
            await session.execute(text("DELETE FROM tenants WHERE id = :tid"), {"tid": tid})
        await session.commit()
    logger.info("Cleaned up %d load-test tenants and their users", len(tenants))


async def main() -> None:
    report_lines: list[str] = []
    report_lines.append("=" * 72)
    report_lines.append("TenantGuard Performance Report")
    report_lines.append(f"Generated: {datetime.utcnow().isoformat()}Z")
    report_lines.append("=" * 72)

    async with AsyncSessionLocal() as session:
        await verify_reports_to_column(session)

    async with AsyncSessionLocal() as session:
        tenants = await create_load_test_tenants(session)

    try:
        insert_time = await run_batch_insert(tenants)
        report_lines.append(f"\n[Batch Insert] {TOTAL_USERS} users across {NUM_TENANTS} tenants")
        report_lines.append(f"  Batch size:    {BATCH_SIZE}")
        report_lines.append(f"  Total time:    {insert_time:.3f}s")
        report_lines.append(f"  Throughput:    {TOTAL_USERS / insert_time:.0f} users/sec")

        target_tenant = tenants[0]
        async with AsyncSessionLocal() as session:
            logger.info("Running recursive CTE hierarchy query...")
            t0 = time.perf_counter()
            hierarchy = await recursive_hierarchy_cte(session, target_tenant["id"])
            cte_time = time.perf_counter() - t0
            logger.info("Hierarchy returned %d rows in %.4fs", len(hierarchy), cte_time)

            report_lines.append(f"\n[Recursive CTE] Managerial Hierarchy for '{target_tenant['name']}'")
            report_lines.append(f"  Rows returned: {len(hierarchy)}")
            report_lines.append(f"  Query time:    {cte_time:.4f}s")
            report_lines.append(f"  Max depth:     {max((h['depth'] for h in hierarchy), default=0)}")
            report_lines.append("")
            report_lines.append("  Sample hierarchy (first 15 rows):")
            report_lines.append(f"  {'Employee':<22} {'Manager':<22} {'Depth':<6} Reporting Chain")
            report_lines.append(f"  {'-'*22} {'-'*22} {'-'*5}  {'-'*40}")
            for h in hierarchy[:15]:
                mgr = h["manager"] or "(CEO/Top)"
                report_lines.append(
                    f"  {h['employee']:<22} {mgr:<22} {h['depth']:<6} {h['reporting_chain']}"
                )
            if len(hierarchy) > 15:
                report_lines.append(f"  ... and {len(hierarchy) - 15} more rows")

        async with AsyncSessionLocal() as session:
            logger.info("Running EXPLAIN ANALYZE on tenant-filtered queries...")
            await explain_analyze_tenant_query(session, target_tenant["id"], report_lines)

        async with AsyncSessionLocal() as session:
            await explain_analyze_hierarchy_cte(session, target_tenant["id"], report_lines)

        report_lines.append("\n" + "=" * 72)
        report_lines.append("End of Report")
        report_lines.append("=" * 72)

        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "w") as f:
            f.write("\n".join(report_lines) + "\n")
        logger.info("Performance report written to %s", LOG_FILE)

    finally:
        await cleanup(tenants)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

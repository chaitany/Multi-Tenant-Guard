import json
import time
import subprocess
import sys
import urllib.request
import urllib.error
import signal
import os


def req(path, method="GET", data=None, headers=None):
    url = f"http://127.0.0.1:8000{path}"
    hdrs = headers or {}
    body = None
    if data:
        body = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=10)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"raw": body}
    except Exception as ex:
        return 0, {"error": str(ex)}


def main():
    passed = 0
    failed = 0

    def check(name, condition, detail=""):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"  PASS: {name}")
        else:
            failed += 1
            print(f"  FAIL: {name} - {detail}")

    print("=== 1. Health Check ===")
    s, d = req("/api/health")
    check("health endpoint", s == 200, f"status={s}")

    print("\n=== 2. List Tenants ===")
    s, d = req("/api/tenants")
    check("list tenants", s == 200 and len(d) >= 3, f"status={s}, count={len(d) if isinstance(d, list) else 'N/A'}")
    tenant_ids = {}
    if isinstance(d, list):
        tenant_ids = {t["name"]: t["id"] for t in d}
        for t in d:
            print(f"    {t['name']} ({t['plan']})")

    print("\n=== 3. List Users (no tenant header - all users) ===")
    s, d = req("/api/users")
    check("list all users", s == 200 and len(d) >= 5, f"status={s}, count={len(d) if isinstance(d, list) else 'N/A'}")

    print("\n=== 4. RLS: Users filtered by X-Tenant-ID ===")
    acme_id = tenant_ids.get("Acme Corporation")
    if acme_id:
        s, d = req("/api/users", headers={"X-Tenant-ID": acme_id})
        check("Acme users filtered", s == 200 and len(d) == 2, f"status={s}, count={len(d) if isinstance(d, list) else d}")
        if isinstance(d, list):
            usernames = [u["username"] for u in d]
            check("Acme has alice_admin", "alice_admin" in usernames, str(usernames))
            check("Acme has bob_editor", "bob_editor" in usernames, str(usernames))

    globex_id = tenant_ids.get("Globex Industries")
    if globex_id:
        s, d = req("/api/users", headers={"X-Tenant-ID": globex_id})
        check("Globex users filtered", s == 200 and len(d) == 2, f"status={s}, count={len(d) if isinstance(d, list) else d}")

    print("\n=== 5. RLS: Roles filtered by X-Tenant-ID ===")
    if acme_id:
        s, d = req("/api/roles", headers={"X-Tenant-ID": acme_id})
        check("Acme roles filtered", s == 200 and len(d) == 2, f"status={s}, resp={d}")
        if isinstance(d, list):
            for r in d:
                print(f"    {r['name']}: {r['permissions']}")
                check(f"Role {r['name']} has permissions dict", isinstance(r["permissions"], dict))

    print("\n=== 6. Audit Logs ===")
    s, d = req("/api/audit-logs")
    check("list audit logs", s == 200 and len(d) >= 5, f"status={s}, count={len(d) if isinstance(d, list) else d}")

    print("\n=== 7. RLS Demo ===")
    if acme_id:
        s, d = req(f"/api/rls-demo/{acme_id}")
        check("RLS demo returns filtered data", s == 200 and len(d.get("users", [])) == 2, f"status={s}, resp={d}")
        print(f"    Message: {d.get('message', 'N/A')}")

    print("\n=== 8. Create Tenant ===")
    s, d = req("/api/tenants", method="POST", data={
        "name": "Test Corp API",
        "slug": "test-corp-api",
        "plan": "free",
        "status": "active"
    })
    check("create tenant", s == 201, f"status={s}, resp={d}")
    new_tenant_id = d.get("id") if s == 201 else None

    print("\n=== 9. Create Role with JSONB Permissions ===")
    if new_tenant_id:
        s, d = req("/api/roles", method="POST", data={
            "tenant_id": new_tenant_id,
            "name": "DevOps",
            "permissions": {
                "projects": "admin",
                "billing": "read",
                "users": "write",
                "settings": "admin",
                "reports": "read"
            }
        })
        check("create role with permissions", s == 201, f"status={s}, resp={d}")
        if s == 201:
            print(f"    Created: {d['name']} -> {d['permissions']}")
            new_role_id = d.get("id")
        else:
            new_role_id = None
    else:
        new_role_id = None

    print("\n=== 10. Pydantic Validation: Invalid Permission Level ===")
    if new_tenant_id:
        s, d = req("/api/roles", method="POST", data={
            "tenant_id": new_tenant_id,
            "name": "BadRole",
            "permissions": {"projects": "superadmin"}
        })
        check("rejects invalid permission level", s == 422, f"status={s}, resp={d}")

    print("\n=== 11. Create User ===")
    if new_tenant_id:
        s, d = req("/api/users", method="POST", data={
            "tenant_id": new_tenant_id,
            "role_id": new_role_id,
            "username": "test_api_user",
            "email": "test@testcorp.com",
            "password": "securepass123",
            "status": "active"
        })
        check("create user", s == 201, f"status={s}, resp={d}")
        if s == 201:
            check("password not in response", "password" not in d, "password leaked in response")

    print("\n=== 12. Login / JWT Token ===")
    s, d = req("/api/auth/token", method="POST", data={
        "username": "test_api_user",
        "password": "securepass123"
    })
    check("login returns token", s == 200 and "access_token" in d, f"status={s}, resp={d}")
    token = d.get("access_token", "")
    jwt_tenant_id = d.get("tenant_id", "")

    print("\n=== 13. JWT-based RLS (tenant from token) ===")
    if token:
        s, d = req("/api/users", headers={"Authorization": f"Bearer {token}"})
        check("JWT filters users by tenant", s == 200 and len(d) == 1, f"status={s}, count={len(d) if isinstance(d, list) else d}")
        if isinstance(d, list) and len(d) > 0:
            check("JWT user is test_api_user", d[0]["username"] == "test_api_user", str(d))

    print("\n=== 14. Invalid X-Tenant-ID Format ===")
    s, d = req("/api/users", headers={"X-Tenant-ID": "not-a-uuid"})
    check("rejects invalid tenant UUID", s == 400, f"status={s}, resp={d}")

    print("\n=== 15. Invalid Login ===")
    s, d = req("/api/auth/token", method="POST", data={
        "username": "nonexistent",
        "password": "wrong"
    })
    check("rejects invalid credentials", s == 401, f"status={s}")

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

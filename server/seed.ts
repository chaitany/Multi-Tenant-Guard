import { db } from "./db";
import { tenants, roles, users } from "@shared/schema";
import { log } from "./index";

export async function seedDatabase() {
  const existingTenants = await db.select().from(tenants);
  if (existingTenants.length > 0) {
    log("Database already seeded, skipping", "seed");
    return;
  }

  log("Seeding database...", "seed");

  const [acme, globex, initech] = await db.insert(tenants).values([
    { name: "Acme Corporation", slug: "acme-corp", plan: "enterprise", status: "active" },
    { name: "Globex Industries", slug: "globex", plan: "pro", status: "active" },
    { name: "Initech Solutions", slug: "initech", plan: "free", status: "active" },
  ]).returning();

  const [adminRole, editorRole, viewerRole, managerRole] = await db.insert(roles).values([
    {
      tenantId: acme.id,
      name: "Admin",
      permissions: { projects: "admin", billing: "admin", users: "admin", settings: "admin", reports: "admin" },
    },
    {
      tenantId: acme.id,
      name: "Editor",
      permissions: { projects: "write", billing: "read", users: "read", settings: "read", reports: "write" },
    },
    {
      tenantId: globex.id,
      name: "Viewer",
      permissions: { projects: "read", billing: "read", reports: "read" },
    },
    {
      tenantId: globex.id,
      name: "Manager",
      permissions: { projects: "admin", billing: "write", users: "write", settings: "write", reports: "admin" },
    },
  ]).returning();

  await db.insert(users).values([
    { tenantId: acme.id, roleId: adminRole.id, username: "alice_admin", email: "alice@acme.com", password: "hashed_pw_1", status: "active" },
    { tenantId: acme.id, roleId: editorRole.id, username: "bob_editor", email: "bob@acme.com", password: "hashed_pw_2", status: "active" },
    { tenantId: globex.id, roleId: managerRole.id, username: "carol_mgr", email: "carol@globex.io", password: "hashed_pw_3", status: "active" },
    { tenantId: globex.id, roleId: viewerRole.id, username: "dave_viewer", email: "dave@globex.io", password: "hashed_pw_4", status: "active" },
    { tenantId: initech.id, username: "eve_user", email: "eve@initech.co", password: "hashed_pw_5", status: "active" },
  ]);

  log("Database seeded successfully", "seed");
}

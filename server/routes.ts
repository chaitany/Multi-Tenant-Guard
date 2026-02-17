import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTenantSchema, insertUserSchema, insertRoleSchema } from "@shared/schema";
import { ZodError } from "zod";
import { queryWithTenantContext } from "./rls-and-triggers";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/tenants", async (_req, res) => {
    const tenants = await storage.getTenants();
    res.json(tenants);
  });

  app.get("/api/tenants/:id", async (req, res) => {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  });

  app.post("/api/tenants", async (req, res) => {
    try {
      const data = insertTenantSchema.parse(req.body);
      const tenant = await storage.createTenant(data);
      res.status(201).json(tenant);
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/users", async (_req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.get("/api/users/:id", async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.post("/api/users", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const user = await storage.createUser(data);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/roles", async (_req, res) => {
    const roles = await storage.getRoles();
    res.json(roles);
  });

  app.get("/api/roles/:id", async (req, res) => {
    const role = await storage.getRole(req.params.id);
    if (!role) return res.status(404).json({ message: "Role not found" });
    res.json(role);
  });

  app.post("/api/roles", async (req, res) => {
    try {
      const data = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(data);
      res.status(201).json(role);
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/audit-logs", async (_req, res) => {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  app.get("/api/rls-demo/:tenantId", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const usersResult = await queryWithTenantContext(
        tenantId,
        "SELECT id, username, email, tenant_id, status FROM users"
      );
      const rolesResult = await queryWithTenantContext(
        tenantId,
        "SELECT id, name, tenant_id, permissions FROM roles"
      );
      res.json({
        tenantId,
        users: usersResult.rows,
        roles: rolesResult.rows,
        message: `RLS filtered results: only rows matching tenant_id=${tenantId} are returned`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}

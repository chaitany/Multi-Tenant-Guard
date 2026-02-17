import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, Shield, ScrollText, ArrowUpRight, Activity } from "lucide-react";
import type { Tenant, User, Role, AuditLog } from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  testId,
}: {
  title: string;
  value: string | number;
  icon: typeof Building2;
  description: string;
  testId: string;
}) {
  return (
    <Card className="hover-elevate" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: tenants, isLoading: tenantsLoading } = useQuery<Tenant[]>({ queryKey: ["/api/tenants"] });
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({ queryKey: ["/api/roles"] });
  const { data: auditLogs, isLoading: auditLoading } = useQuery<AuditLog[]>({ queryKey: ["/api/audit-logs"] });

  const isLoading = tenantsLoading || usersLoading || rolesLoading || auditLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeUsers = users?.filter((u) => u.status === "active").length ?? 0;
  const recentLogs = auditLogs?.slice(0, 5) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">Multi-tenant platform overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tenants"
          value={tenants?.length ?? 0}
          icon={Building2}
          description={`${activeTenants} active`}
          testId="card-stat-tenants"
        />
        <StatCard
          title="Users"
          value={users?.length ?? 0}
          icon={Users}
          description={`${activeUsers} active`}
          testId="card-stat-users"
        />
        <StatCard
          title="Roles"
          value={roles?.length ?? 0}
          icon={Shield}
          description="Across all tenants"
          testId="card-stat-roles"
        />
        <StatCard
          title="Audit Events"
          value={auditLogs?.length ?? 0}
          icon={ScrollText}
          description="Total logged changes"
          testId="card-stat-audit"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No audit events recorded yet</p>
            ) : (
              <div className="space-y-3">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-3 rounded-md p-2 hover-elevate">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={log.operation === "UPDATE" ? "secondary" : log.operation === "INSERT" ? "default" : "destructive"} data-testid={`badge-operation-${log.id}`}>
                        {log.operation}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-log-table-${log.id}`}>{log.tableName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.changedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base font-semibold">Tenants by Plan</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {!tenants || tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No tenants created yet</p>
            ) : (
              <div className="space-y-3">
                {["free", "pro", "enterprise"].map((plan) => {
                  const count = tenants.filter((t) => t.plan === plan).length;
                  const pct = tenants.length > 0 ? Math.round((count / tenants.length) * 100) : 0;
                  return (
                    <div key={plan} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium capitalize">{plan}</span>
                        <span className="text-sm text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

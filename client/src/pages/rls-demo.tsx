import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, Lock, ArrowRight } from "lucide-react";
import type { Tenant } from "@shared/schema";

interface RLSDemoResult {
  tenantId: string;
  users: Array<{ id: string; username: string; email: string; tenant_id: string; status: string }>;
  roles: Array<{ id: string; name: string; tenant_id: string; permissions: Record<string, string> }>;
  message: string;
}

export default function RLSDemoPage() {
  const [selectedTenant, setSelectedTenant] = useState("");

  const { data: tenants, isLoading: tenantsLoading } = useQuery<Tenant[]>({ queryKey: ["/api/tenants"] });
  const { data: rlsResult, isLoading: rlsLoading } = useQuery<RLSDemoResult>({
    queryKey: ["/api/rls-demo", selectedTenant],
    enabled: !!selectedTenant,
  });

  if (tenantsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-rls-title">Row-Level Security Demo</h1>
        <p className="text-muted-foreground">
          See RLS in action: select a tenant and the database will only return rows matching that tenant_id
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Select Tenant Context</CardTitle>
          <Lock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This sets <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">SET LOCAL app.current_tenant_id</code> on the PostgreSQL session before querying. RLS policies then filter rows automatically.
          </p>
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger className="max-w-sm" data-testid="select-rls-tenant">
              <SelectValue placeholder="Choose a tenant to query as..." />
            </SelectTrigger>
            <SelectContent>
              {tenants?.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.slug})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedTenant && rlsLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent className="pt-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
        </div>
      )}

      {rlsResult && (
        <>
          <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
            <CardContent className="flex items-start gap-3 pt-6">
              <ShieldCheck className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium" data-testid="text-rls-message">{rlsResult.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {rlsResult.users.length} user(s) and {rlsResult.roles.length} role(s) visible to this tenant
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Filtered Users</CardTitle>
                <Badge variant="secondary">{rlsResult.users.length}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                {rlsResult.users.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">No users visible for this tenant</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rlsResult.users.map((u) => (
                        <TableRow key={u.id} data-testid={`row-rls-user-${u.id}`}>
                          <TableCell className="font-medium text-sm">{u.username}</TableCell>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{u.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Filtered Roles</CardTitle>
                <Badge variant="secondary">{rlsResult.roles.length}</Badge>
              </CardHeader>
              <CardContent>
                {rlsResult.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center">No roles visible for this tenant</p>
                ) : (
                  <div className="space-y-3">
                    {rlsResult.roles.map((r) => (
                      <div key={r.id} className="rounded-md border p-3 space-y-2" data-testid={`card-rls-role-${r.id}`}>
                        <p className="text-sm font-medium">{r.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(r.permissions).map(([area, level]) => (
                            <Badge key={area} variant="outline" className="text-xs">
                              {area}: {level}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How it works</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-auto">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 flex-shrink-0">1</Badge>
                    <span>Request arrives with the selected tenant context</span>
                  </div>
                  <div className="flex items-center gap-2 pl-6">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 flex-shrink-0">2</Badge>
                    <div>
                      <span>Server executes </span>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">SET LOCAL app.current_tenant_id = '{rlsResult.tenantId}'</code>
                      <span> within a transaction</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-6">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 flex-shrink-0">3</Badge>
                    <div>
                      <span>RLS policy </span>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">USING (tenant_id = current_setting('app.current_tenant_id')::uuid)</code>
                      <span> filters rows automatically</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-6">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 flex-shrink-0">4</Badge>
                    <span>Only rows matching the tenant are returned - no application-level filtering needed</span>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

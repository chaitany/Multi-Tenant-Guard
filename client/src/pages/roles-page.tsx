import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, Search } from "lucide-react";
import type { Role, Tenant } from "@shared/schema";

const PERMISSION_AREAS = ["projects", "billing", "users", "settings", "reports"];
const PERMISSION_LEVELS = ["none", "read", "write", "admin"];

export default function RolesPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState<{ name: string; tenantId: string; permissions: Record<string, string> }>({
    name: "",
    tenantId: "",
    permissions: Object.fromEntries(PERMISSION_AREAS.map((a) => [a, "none"])),
  });

  const { data: roles, isLoading } = useQuery<Role[]>({ queryKey: ["/api/roles"] });
  const { data: tenants } = useQuery<Tenant[]>({ queryKey: ["/api/tenants"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const perms = Object.fromEntries(Object.entries(data.permissions).filter(([, v]) => v !== "none"));
      const res = await apiRequest("POST", "/api/roles", { ...data, permissions: perms });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setOpen(false);
      setFormData({ name: "", tenantId: "", permissions: Object.fromEntries(PERMISSION_AREAS.map((a) => [a, "none"])) });
      toast({ title: "Role created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = roles?.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const getTenantName = (id: string) => tenants?.find((t) => t.id === id)?.name ?? "Unknown";

  const permLevelColor = (level: string) => {
    switch (level) {
      case "admin": return "default";
      case "write": return "secondary";
      case "read": return "outline";
      default: return "outline";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-roles-title">Roles & Permissions</h1>
          <p className="text-muted-foreground">Manage roles with granular JSONB permissions</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-role"><Plus className="h-4 w-4 mr-2" />Add Role</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Role</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }}>
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={formData.tenantId} onValueChange={(v) => setFormData((p) => ({ ...p, tenantId: v }))}>
                  <SelectTrigger data-testid="select-role-tenant"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>
                    {tenants?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input data-testid="input-role-name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="space-y-3">
                <Label>Permissions (JSONB)</Label>
                <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                  {PERMISSION_AREAS.map((area) => (
                    <div key={area} className="flex items-center justify-between gap-3">
                      <span className="text-sm capitalize font-medium">{area}</span>
                      <Select
                        value={formData.permissions[area]}
                        onValueChange={(v) => setFormData((p) => ({ ...p, permissions: { ...p.permissions, [area]: v } }))}
                      >
                        <SelectTrigger className="w-28" data-testid={`select-perm-${area}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PERMISSION_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-role">
                {createMutation.isPending ? "Creating..." : "Create Role"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search roles..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-roles" />
      </div>

      {!filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No roles found</p>
            <p className="text-sm text-muted-foreground">Create your first role to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((role) => {
            const perms = (role.permissions ?? {}) as Record<string, string>;
            return (
              <Card key={role.id} className="hover-elevate" data-testid={`card-role-${role.id}`}>
                <CardHeader className="space-y-0 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base" data-testid={`text-role-name-${role.id}`}>{role.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">{getTenantName(role.tenantId)}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(perms).map(([area, level]) => (
                      <Badge
                        key={area}
                        variant={permLevelColor(level) as any}
                        className="text-xs"
                        data-testid={`badge-perm-${role.id}-${area}`}
                      >
                        {area}: {level}
                      </Badge>
                    ))}
                    {Object.keys(perms).length === 0 && (
                      <span className="text-xs text-muted-foreground">No permissions set</span>
                    )}
                  </div>
                  <div className="mt-3 p-2 rounded bg-muted/50 font-mono text-xs overflow-x-auto" data-testid={`text-role-json-${role.id}`}>
                    {JSON.stringify(perms, null, 2)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

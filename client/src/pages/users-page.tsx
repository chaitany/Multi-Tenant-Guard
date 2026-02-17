import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Search, Pencil } from "lucide-react";
import type { User, Tenant, Role } from "@shared/schema";

export default function UsersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({ username: "", email: "", password: "", tenantId: "", roleId: "", status: "active" });
  const [editData, setEditData] = useState<{ id: string; username: string; email: string; status: string; roleId: string }>({ id: "", username: "", email: "", status: "active", roleId: "" });

  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: tenants } = useQuery<Tenant[]>({ queryKey: ["/api/tenants"] });
  const { data: roles } = useQuery<Role[]>({ queryKey: ["/api/roles"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: any = { ...data };
      if (!payload.roleId) delete payload.roleId;
      const res = await apiRequest("POST", "/api/users", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setOpen(false);
      setFormData({ username: "", email: "", password: "", tenantId: "", roleId: "", status: "active" });
      toast({ title: "User created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof editData) => {
      const { id, ...rest } = data;
      const payload: any = { ...rest };
      if (!payload.roleId) delete payload.roleId;
      const res = await apiRequest("PATCH", `/api/users/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setEditOpen(false);
      toast({ title: "User updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = users?.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const getTenantName = (id: string) => tenants?.find((t) => t.id === id)?.name ?? "Unknown";
  const getRoleName = (id: string | null) => {
    if (!id) return "None";
    return roles?.find((r) => r.id === id)?.name ?? "Unknown";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="pt-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-users-title">Users</h1>
          <p className="text-muted-foreground">Manage users across tenants</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user"><Plus className="h-4 w-4 mr-2" />Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }}>
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={formData.tenantId} onValueChange={(v) => setFormData((p) => ({ ...p, tenantId: v }))}>
                  <SelectTrigger data-testid="select-user-tenant"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>
                    {tenants?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input data-testid="input-user-username" value={formData.username} onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" data-testid="input-user-email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" data-testid="input-user-password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Role (optional)</Label>
                <Select value={formData.roleId} onValueChange={(v) => setFormData((p) => ({ ...p, roleId: v }))}>
                  <SelectTrigger data-testid="select-user-role"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles?.filter((r) => r.tenantId === formData.tenantId).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-user">
                {createMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-users" />
      </div>

      {!filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No users found</p>
            <p className="text-sm text-muted-foreground">Create your first user to get started</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium" data-testid={`text-username-${user.id}`}>{user.username}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{getTenantName(user.tenantId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs" data-testid={`badge-user-role-${user.id}`}>
                        {getRoleName(user.roleId)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === "active" ? "default" : "secondary"} data-testid={`badge-user-status-${user.id}`}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-edit-user-${user.id}`}
                        onClick={() => {
                          setEditData({ id: user.id, username: user.username, email: user.email, status: user.status, roleId: user.roleId ?? "" });
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editData); }}>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input data-testid="input-edit-username" value={editData.username} onChange={(e) => setEditData((p) => ({ ...p, username: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" data-testid="input-edit-email" value={editData.email} onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editData.status} onValueChange={(v) => setEditData((p) => ({ ...p, status: v }))}>
                <SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-submit-edit-user">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

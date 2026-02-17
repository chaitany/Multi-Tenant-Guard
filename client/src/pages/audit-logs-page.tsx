import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AuditLog } from "@shared/schema";

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [opFilter, setOpFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs, isLoading } = useQuery<AuditLog[]>({ queryKey: ["/api/audit-logs"] });

  const filtered = logs?.filter((l) => {
    const matchOp = opFilter === "all" || l.operation === opFilter;
    const matchSearch =
      l.tableName.toLowerCase().includes(search.toLowerCase()) ||
      (l.changedBy ?? "").toLowerCase().includes(search.toLowerCase());
    return matchOp && matchSearch;
  });

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
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-audit-title">Audit Logs</h1>
        <p className="text-muted-foreground">Track all changes via PostgreSQL triggers</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search logs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-audit" />
        </div>
        <Select value={opFilter} onValueChange={setOpFilter}>
          <SelectTrigger className="w-36" data-testid="select-filter-operation"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Operations</SelectItem>
            <SelectItem value="INSERT">INSERT</SelectItem>
            <SelectItem value="UPDATE">UPDATE</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ScrollText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No audit logs found</p>
            <p className="text-sm text-muted-foreground">Audit entries are generated automatically by the trigger when users are modified</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>Changed At</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                    <TableCell>
                      <Badge
                        variant={
                          log.operation === "UPDATE" ? "secondary" :
                          log.operation === "INSERT" ? "default" : "destructive"
                        }
                        data-testid={`badge-audit-op-${log.id}`}
                      >
                        {log.operation}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium" data-testid={`text-audit-table-${log.id}`}>{log.tableName}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{log.recordId ? log.recordId.slice(0, 8) + "..." : "-"}</TableCell>
                    <TableCell className="text-sm">{new Date(log.changedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{log.changedBy ?? "system"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setSelectedLog(log)}
                        data-testid={`button-view-audit-${log.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Audit Detail
              {selectedLog && (
                <Badge variant={selectedLog.operation === "UPDATE" ? "secondary" : selectedLog.operation === "INSERT" ? "default" : "destructive"}>
                  {selectedLog.operation}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Table:</span>
                  <span className="ml-2 font-medium">{selectedLog.tableName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Record:</span>
                  <span className="ml-2 font-mono text-xs">{selectedLog.recordId ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Changed At:</span>
                  <span className="ml-2">{new Date(selectedLog.changedAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Changed By:</span>
                  <span className="ml-2">{selectedLog.changedBy ?? "system"}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2">Old Data (before)</p>
                  <ScrollArea className="h-48">
                    <pre className="p-3 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap" data-testid="text-audit-old-data">
                      {selectedLog.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : "null"}
                    </pre>
                  </ScrollArea>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">New Data (after)</p>
                  <ScrollArea className="h-48">
                    <pre className="p-3 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap" data-testid="text-audit-new-data">
                      {selectedLog.newData ? JSON.stringify(selectedLog.newData, null, 2) : "null"}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

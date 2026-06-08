"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function AdminUsersTable({ users: initialUsers }) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(null);

  async function toggleDisabled(userId, disabled) {
    setLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, disabled } : u))
        );
      }
    } finally {
      setLoading(null);
    }
  }

  async function toggleRole(userId, role) {
    setLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role } : u))
        );
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Student ID</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Solves</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Disabled</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name || "—"}</TableCell>
              <TableCell className="font-mono text-sm">{user.email}</TableCell>
              <TableCell>{user.studentId || "—"}</TableCell>
              <TableCell>
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>{user._count.solves}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {user.createdAt}
              </TableCell>
              <TableCell>
                <Switch
                  checked={user.disabled}
                  disabled={loading === user.id}
                  onCheckedChange={(checked) => toggleDisabled(user.id, checked)}
                />
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading === user.id}
                  onClick={() =>
                    toggleRole(user.id, user.role === "ADMIN" ? "USER" : "ADMIN")
                  }
                >
                  {user.role === "ADMIN" ? "Demote" : "Promote"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const emptyForm = {
  name: "",
  startAt: "",
  endAt: "",
  hidden: false,
  status: "DRAFT",
};

export function AdminCompetitionsManager({ competitions: initial }) {
  const [competitions, setCompetitions] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = editing
        ? `/api/admin/competitions/${editing}`
        : "/api/admin/competitions";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } catch {
      setError("Failed to save competition");
    } finally {
      setLoading(false);
    }
  }

  async function endCompetition(id) {
    await fetch(`/api/admin/competitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ENDED" }),
    });
    window.location.reload();
  }

  async function toggleHidden(id, hidden) {
    await fetch(`/api/admin/competitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    setCompetitions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, hidden } : c))
    );
  }

  function startEdit(comp) {
    setEditing(comp.id);
    setForm({
      name: comp.name,
      startAt: comp.startAtLocal,
      endAt: comp.endAtLocal,
      hidden: comp.hidden,
      status: comp.status,
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editing ? "Edit Competition" : "New Competition"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Start (AEST/AEDT)</Label>
              <Input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>End (AEST/AEDT)</Label>
              <Input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.hidden}
                onCheckedChange={(hidden) => setForm({ ...form, hidden })}
              />
              <Label>Hidden</Label>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Challenges</TableHead>
            <TableHead>Hidden</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {competitions.map((comp) => (
            <TableRow key={comp.id}>
              <TableCell className="font-medium">{comp.name}</TableCell>
              <TableCell>
                <Badge variant={comp.status === "ENDED" ? "secondary" : "default"}>
                  {comp.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {comp.startAtFormatted} — {comp.endAtFormatted}
              </TableCell>
              <TableCell>{comp._count.challenges}</TableCell>
              <TableCell>
                <Switch
                  checked={comp.hidden}
                  onCheckedChange={(hidden) => toggleHidden(comp.id, hidden)}
                />
              </TableCell>
              <TableCell className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(comp)}>
                  Edit
                </Button>
                {comp.status !== "ENDED" && (
                  <Button size="sm" variant="destructive" onClick={() => endCompetition(comp.id)}>
                    End
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

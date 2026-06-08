"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DualEditor } from "@/components/editor/dual-editor";

const emptyForm = {
  title: "",
  slug: "",
  competitionId: "",
  categoryId: "",
  points: 100,
  description: "",
  descriptionFormat: "MARKDOWN",
  startAt: "",
  hidden: false,
  flags: [{ value: "", label: "" }],
};

export function AdminChallengesManager({ challenges: initial, competitions, categories }) {
  const [challenges] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [cats, setCats] = useState(categories);

  function addFlag() {
    setForm({
      ...form,
      flags: [...form.flags, { value: "", label: "" }],
    });
  }

  function updateFlag(index, field, value) {
    const flags = [...form.flags];
    flags[index] = { ...flags[index], [field]: value };
    setForm({ ...form, flags });
  }

  function removeFlag(index) {
    setForm({
      ...form,
      flags: form.flags.filter((_, i) => i !== index),
    });
  }

  async function createCategory() {
    if (!newCategory.trim()) return;
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategory.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setCats((prev) => [...prev, data.category]);
      setForm({ ...form, categoryId: data.category.id });
      setNewCategory("");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = editing
        ? `/api/admin/challenges/${editing}`
        : "/api/admin/challenges";
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
      setError("Failed to save challenge");
    } finally {
      setLoading(false);
    }
  }

  async function toggleHidden(id, hidden) {
    await fetch(`/api/admin/challenges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    window.location.reload();
  }

  async function deleteChallenge(id) {
    if (!confirm("Delete this challenge?")) return;
    await fetch(`/api/admin/challenges/${id}`, { method: "DELETE" });
    window.location.reload();
  }

  function startEdit(ch) {
    setEditing(ch.id);
    setForm({
      title: ch.title,
      slug: ch.slug,
      competitionId: ch.competitionId,
      categoryId: ch.categoryId,
      points: ch.points,
      description: ch.description,
      descriptionFormat: ch.descriptionFormat,
      startAt: ch.startAtLocal,
      hidden: ch.hidden,
      flags: ch.flags.map((f) => ({ value: "", label: f.label, id: f.id })),
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editing ? "Edit Challenge" : "New Challenge"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Competition</Label>
                <Select
                  value={form.competitionId}
                  onValueChange={(v) => setForm({ ...form, competitionId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select competition" />
                  </SelectTrigger>
                  <SelectContent>
                    {competitions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => setForm({ ...form, categoryId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    placeholder="New category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={createCategory}>
                    Add
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Points</Label>
                <Input
                  type="number"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
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
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <DualEditor
                value={form.description}
                format={form.descriptionFormat}
                onChange={(v) => setForm({ ...form, description: v })}
                onFormatChange={(f) => setForm({ ...form, descriptionFormat: f })}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Flags</Label>
                <Button type="button" size="sm" variant="outline" onClick={addFlag}>
                  Add Flag
                </Button>
              </div>
              {form.flags.map((flag, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={editing ? "Leave blank to keep existing" : "DUCA{...}"}
                    value={flag.value}
                    onChange={(e) => updateFlag(i, "value", e.target.value)}
                    className="font-mono"
                    required={!editing && i === 0}
                  />
                  <Input
                    placeholder="Label (optional)"
                    value={flag.label}
                    onChange={(e) => updateFlag(i, "label", e.target.value)}
                  />
                  {form.flags.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => removeFlag(i)}>
                      ×
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.hidden}
                onCheckedChange={(hidden) => setForm({ ...form, hidden })}
              />
              <Label>Hidden</Label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
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
            <TableHead>Title</TableHead>
            <TableHead>Competition</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Points</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead>Solves</TableHead>
            <TableHead>Hidden</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {challenges.map((ch) => (
            <TableRow key={ch.id}>
              <TableCell className="font-medium">{ch.title}</TableCell>
              <TableCell>{ch.competition.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{ch.category.name}</Badge>
              </TableCell>
              <TableCell>{ch.points}</TableCell>
              <TableCell>{ch.flagCount}</TableCell>
              <TableCell>{ch._count.solves}</TableCell>
              <TableCell>
                <Switch
                  checked={ch.hidden}
                  onCheckedChange={(hidden) => toggleHidden(ch.id, hidden)}
                />
              </TableCell>
              <TableCell className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(ch)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteChallenge(ch.id)}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

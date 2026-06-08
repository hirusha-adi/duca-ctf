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
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { toEditorHtml } from "@/lib/content-format";

const emptyForm = {
  title: "",
  competitionId: "",
  categoryId: "",
  points: 100,
  description: "",
  startAt: "",
  useCustomStart: false,
  hidden: false,
  flags: [{ value: "", label: "", id: null }],
};

function getCompetition(competitions, id) {
  return competitions.find((c) => c.id === id);
}

export function AdminChallengesManager({ challenges: initial, competitions, categories }) {
  const [challenges] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [cats, setCats] = useState(categories);

  const selectedCompetition = getCompetition(competitions, form.competitionId);

  function handleCompetitionChange(competitionId) {
    const comp = getCompetition(competitions, competitionId);
    setForm((prev) => ({
      ...prev,
      competitionId,
      startAt: comp?.startAtLocal || "",
      useCustomStart: false,
    }));
  }

  function handleCustomStartToggle(useCustomStart) {
    const comp = selectedCompetition;
    setForm((prev) => ({
      ...prev,
      useCustomStart,
      startAt: useCustomStart ? prev.startAt || comp?.startAtLocal || "" : comp?.startAtLocal || "",
    }));
  }

  function addFlag() {
    setForm({
      ...form,
      flags: [...form.flags, { value: "", label: "", id: null }],
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

    if (!form.competitionId) {
      setError("Please select a competition");
      setLoading(false);
      return;
    }

    if (form.flags.length === 0) {
      setError("At least one flag is required");
      setLoading(false);
      return;
    }
    if (form.flags.some((f) => !f.value?.trim())) {
      setError("Every flag must have a value");
      setLoading(false);
      return;
    }
    const flagsPayload = form.flags;

    try {
      const url = editing
        ? `/api/admin/challenges/${editing}`
        : "/api/admin/challenges";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          flags: flagsPayload,
          descriptionFormat: "RICHTEXT",
        }),
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
    const comp = getCompetition(competitions, ch.competitionId);
    const useCustomStart = comp
      ? new Date(ch.startAt).getTime() !== new Date(comp.startAt).getTime()
      : false;

    setEditing(ch.id);
    setForm({
      title: ch.title,
      competitionId: ch.competitionId,
      categoryId: ch.categoryId,
      points: ch.points,
      description: toEditorHtml(ch.description, ch.descriptionFormat),
      startAt: ch.startAtLocal,
      useCustomStart,
      hidden: ch.hidden,
      flags: ch.flags.map((f) => ({
        id: f.id,
        label: f.label || "",
        value: f.value || "",
      })),
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
              <div className="space-y-2 sm:col-span-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Competition</Label>
                <Select value={form.competitionId} onValueChange={handleCompetitionChange}>
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
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.useCustomStart}
                    onCheckedChange={handleCustomStartToggle}
                    disabled={!form.competitionId}
                  />
                  <Label>Custom start time (optional)</Label>
                </div>
                {form.competitionId && !form.useCustomStart && selectedCompetition && (
                  <p className="text-sm text-muted-foreground">
                    Starts with the competition on {selectedCompetition.startAtFormatted}
                  </p>
                )}
                {form.useCustomStart && (
                  <div className="space-y-1">
                    <Label>Custom start (AEST/AEDT)</Label>
                    <Input
                      type="datetime-local"
                      value={form.startAt}
                      max={selectedCompetition?.endAtLocal || undefined}
                      min={selectedCompetition?.startAtLocal || undefined}
                      onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                      required
                    />
                    {selectedCompetition && (
                      <p className="text-xs text-muted-foreground">
                        Must be between {selectedCompetition.startAtFormatted} and{" "}
                        {selectedCompetition.endAtFormatted}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <RichTextEditor
                key={editing || "new"}
                content={form.description}
                onChange={(description) => setForm((prev) => ({ ...prev, description }))}
                placeholder="Describe this challenge… paste images with Ctrl+V"
                variant="compact"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Flags</Label>
                <Button type="button" size="sm" variant="outline" onClick={addFlag}>
                  Add Flag
                </Button>
              </div>
              {form.flags.length === 0 && (
                <p className="text-sm text-muted-foreground">No flags yet. Add at least one.</p>
              )}
              {form.flags.map((flag, i) => (
                <div
                  key={flag.id || `new-${i}`}
                  className="space-y-2 rounded-md border border-border bg-secondary/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Flag {i + 1}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => removeFlag(i)}
                      disabled={form.flags.length === 1}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Flag value</Label>
                      <Input
                        placeholder="DUCA{...}"
                        value={flag.value}
                        onChange={(e) => updateFlag(i, "value", e.target.value)}
                        className="font-mono text-white"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Label (optional)</Label>
                      <Input
                        placeholder="e.g. Stage 1"
                        value={flag.label}
                        onChange={(e) => updateFlag(i, "label", e.target.value)}
                      />
                    </div>
                  </div>
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
              <Button type="submit" disabled={loading || !form.competitionId}>
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
            <TableHead>Starts</TableHead>
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
              <TableCell className="text-sm text-muted-foreground">
                {ch.startAtFormatted}
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

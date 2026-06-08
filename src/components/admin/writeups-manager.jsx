"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DualEditor } from "@/components/editor/dual-editor";

export function AdminWriteupsManager({ challenges }) {
  const [selectedId, setSelectedId] = useState("");
  const [content, setContent] = useState("");
  const [contentFormat, setContentFormat] = useState("MARKDOWN");
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const selected = challenges.find((c) => c.id === selectedId);

  function selectChallenge(id) {
    setSelectedId(id);
    const ch = challenges.find((c) => c.id === id);
    if (ch?.writeup) {
      setContent(ch.writeup.content);
      setContentFormat(ch.writeup.contentFormat);
      setImages(Array.isArray(ch.writeup.images) ? ch.writeup.images : []);
    } else {
      setContent("");
      setContentFormat("MARKDOWN");
      setImages([]);
    }
    setMessage(null);
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImages((prev) => [...prev, { url: data.url, alt: file.name }]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function saveWriteup() {
    if (!selectedId) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/writeups/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, contentFormat, images }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Writeup saved.");
      } else {
        setMessage(data.error || "Save failed");
      }
    } catch {
      setMessage("Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Select Challenge</Label>
        <Select value={selectedId} onValueChange={selectChallenge}>
          <SelectTrigger className="max-w-lg">
            <SelectValue placeholder="Choose a challenge" />
          </SelectTrigger>
          <SelectContent>
            {challenges.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>
                {ch.competition.name} — {ch.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {selected.title}
              <Badge variant="secondary">{selected.category.name}</Badge>
              {selected.writeup && <Badge variant="success">Has writeup</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DualEditor
              value={content}
              format={contentFormat}
              onChange={setContent}
              onFormatChange={setContentFormat}
            />

            <div className="space-y-2">
              <Label>Images</Label>
              <input type="file" accept="image/*" onChange={uploadImage} disabled={uploading} />
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative">
                      <img
                        src={img.url}
                        alt={img.alt || ""}
                        className="h-20 w-20 rounded border border-border object-cover"
                      />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 text-xs text-white"
                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {message && (
              <p className={`text-sm ${message === "Writeup saved." ? "text-primary" : "text-destructive"}`}>
                {message}
              </p>
            )}

            <Button onClick={saveWriteup} disabled={loading}>
              {loading ? "Saving..." : "Save Writeup"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

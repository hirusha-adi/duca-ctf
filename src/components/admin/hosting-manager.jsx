"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HostingConfig } from "@/components/admin/hosting-config";
import { HostingInstances } from "@/components/admin/hosting-instances";
import { HostingSettings } from "@/components/admin/hosting-settings";
import { HostingRegistries } from "@/components/admin/hosting-registries";
import { HostingEvents } from "@/components/admin/hosting-events";

export function HostingManager({ challenges }) {
  const [tab, setTab] = useState("instances");
  return <div className="space-y-6"><p className="text-sm text-muted-foreground">Manage individual player instances, challenge templates and shared hosting capacity. Each player has one instance per hosted challenge.</p><Tabs value={tab} onValueChange={setTab}><TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1"><TabsTrigger value="instances">Instances</TabsTrigger><TabsTrigger value="challenges">Challenge configuration</TabsTrigger><TabsTrigger value="events">Lifecycle events</TabsTrigger><TabsTrigger value="settings">Capacity &amp; network</TabsTrigger><TabsTrigger value="registries">Private registries</TabsTrigger></TabsList><TabsContent value="instances">{tab === "instances" && <HostingInstances />}</TabsContent><TabsContent value="challenges">{tab === "challenges" && <HostingConfig challenges={challenges} />}</TabsContent><TabsContent value="events">{tab === "events" && <HostingEvents />}</TabsContent><TabsContent value="settings">{tab === "settings" && <HostingSettings />}</TabsContent><TabsContent value="registries">{tab === "registries" && <HostingRegistries />}</TabsContent></Tabs></div>;
}

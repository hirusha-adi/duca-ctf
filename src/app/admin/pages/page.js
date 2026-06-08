import { listAllSitePages } from "@/lib/site-pages";
import { AdminSitePagesManager } from "@/components/admin/site-pages-manager";

export default async function AdminPagesPage() {
  const { systemPages, customPages } = await listAllSitePages();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Site Pages</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Edit main legal pages and create custom content pages. Body text auto-saves as
        you type.
      </p>
      <AdminSitePagesManager systemPages={systemPages} customPages={customPages} />
    </div>
  );
}

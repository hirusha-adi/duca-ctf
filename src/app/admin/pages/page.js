import { listSitePages } from "@/lib/site-pages";
import { AdminSitePagesManager } from "@/components/admin/site-pages-manager";

export default async function AdminPagesPage() {
  const pages = await listSitePages();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Site Pages</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Edit General Rules, Terms of Service, and Privacy Policy. Changes auto-save as
        you type and appear on the public pages immediately.
      </p>
      <AdminSitePagesManager pages={pages} />
    </div>
  );
}

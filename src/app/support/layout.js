import { requirePageAuth } from "@/lib/auth";

export default async function SupportLayout({ children }) {
  await requirePageAuth("/support");
  return children;
}

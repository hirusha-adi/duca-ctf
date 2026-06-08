import { SitePageContent } from "@/components/site/site-page-content";

export const revalidate = 60;

export const metadata = {
  title: "General Rules · DUCA CTF",
};

export default function RulesPage() {
  return <SitePageContent slug="rules" />;
}

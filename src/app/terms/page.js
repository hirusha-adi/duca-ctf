import { SitePageContent } from "@/components/site/site-page-content";

export const revalidate = 60;

export const metadata = {
  title: "Terms of Service · DUCA CTF",
};

export default function TermsPage() {
  return <SitePageContent slug="terms" />;
}

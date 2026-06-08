import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function OnboardingLayout({ children }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.profileComplete) {
    redirect("/");
  }

  return children;
}

import {
  LayoutDashboard,
  Users,
  Trophy,
  Puzzle,
  FileText,
  Activity,
  History,
  ScrollText,
  MessagesSquare,
} from "lucide-react";

export const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/competitions", label: "Competitions", icon: Trophy },
  { href: "/admin/challenges", label: "Challenges", icon: Puzzle },
  { href: "/admin/submissions", label: "Submissions", icon: History },
  { href: "/admin/chats", label: "Support Chats", icon: MessagesSquare },
  { href: "/admin/writeups", label: "Writeups", icon: FileText },
  { href: "/admin/pages", label: "Pages", icon: ScrollText },
  { href: "/admin/telemetry", label: "Telemetry", icon: Activity },
];

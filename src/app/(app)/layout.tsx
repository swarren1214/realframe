import { cookies } from "next/headers";
import { AppShell, SIDEBAR_COOKIE } from "@/components/sidebar/AppShell";
import { AppSidebar } from "@/components/sidebar/AppSidebar";

/**
 * Account pages share this layout, so the sidebar stays mounted (and keeps
 * its state) while pages load and change.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell initialCollapsed={collapsed} sidebar={<AppSidebar />}>
      {children}
    </AppShell>
  );
}

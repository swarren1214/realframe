import { AppSidebar } from "@/components/sidebar/AppSidebar";

/**
 * Navigation for account-level pages: a sidebar on large screens and a top
 * bar with a menu on small ones. Pages pad themselves with APP_PAGE.
 */
export function AppHeader(_: { plan?: string | null }) {
  return <AppSidebar />;
}

/** Wrapper classes for a page that shows the app sidebar. */
export const APP_PAGE = "min-h-screen px-4 pb-16 lg:pl-[17rem]";

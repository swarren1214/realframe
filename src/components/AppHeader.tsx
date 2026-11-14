import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

/** Header for account-level pages (projects, billing). */
export function AppHeader({ plan }: { plan?: string | null }) {
  return (
    <header className="glass mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5">
      <Logo href="/projects" />
      <div className="flex-1" />
      {plan !== "pro" && (
        <Button asChild variant="soft" size="sm">
          <Link href="/billing">
            <Sparkles />
            Upgrade
          </Link>
        </Button>
      )}
      <AccountMenu />
    </header>
  );
}

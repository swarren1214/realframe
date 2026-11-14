import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { Logo } from "@/components/Logo";
import { TeamSwitcher } from "@/components/teams/TeamSwitcher";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";

/** Header for account-level pages: prototypes, design systems, team, billing. */
export function AppHeader({ plan }: { plan?: string | null }) {
  return (
    <header className="glass mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5">
      <Logo href="/projects" />
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-stone-200" />
      <TeamSwitcher />
      <AppNav />
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

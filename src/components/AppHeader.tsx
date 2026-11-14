import { CreditCard, LogOut, Sparkles, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Header for account-level pages (projects, billing). */
export function AppHeader({ plan, name, email }: { plan?: string | null; name?: string | null; email?: string | null }) {
  return (
    <header className="glass mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-full py-2 pl-5 pr-2">
      <Logo href="/projects" />
      <div className="flex-1" />
      {plan === "pro" ? (
        <Button asChild variant="soft" size="sm">
          <Link href="/billing">
            <Sparkles />
            Pro
          </Link>
        </Button>
      ) : (
        <Button asChild variant="soft" size="sm">
          <Link href="/billing">
            <Sparkles />
            Upgrade
          </Link>
        </Button>
      )}
      <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
        <Link href="/billing">
          <CreditCard />
          Billing
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="max-w-48">
        <Link href="/welcome?edit=1" title={email ?? undefined}>
          <UserRound />
          <span className="truncate">{name || email}</span>
        </Link>
      </Button>
      <form action="/auth/signout" method="post">
        <Button variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" type="submit">
          <LogOut />
        </Button>
      </form>
    </header>
  );
}

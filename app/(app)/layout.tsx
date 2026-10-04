import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <header className="sticky top-0 z-30 bg-header text-on-header shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <Link href="/" className="text-sm font-extrabold tracking-[0.2em] !text-on-header no-underline">LOGIAI</Link>
          <nav aria-label="Principal" className="flex flex-1 items-center gap-1 text-sm font-semibold">
            <Link href="/" className="rounded-lg px-3 py-2 !text-on-header no-underline hover:bg-white/10">Inicio</Link>
            <Link href="/manual" className="rounded-lg px-3 py-2 !text-on-header no-underline hover:bg-white/10">Manual</Link>
          </nav>
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-xs opacity-80">{user.roleLabel}</p>
          </div>
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Salir</button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </>
  );
}

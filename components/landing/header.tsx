"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Menu,
  X,
  Github,
  User,
  Settings,
  CreditCard,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LumiLogo } from "@/components/shared/icons";
import { createClient } from "@/lib/supabase/client";
import { User as SupabaseUser } from "@supabase/supabase-js";
import Link from "next/link";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Community", href: "#" },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [supabase] = useState(() => createClient());
  const showProfileMenu = Boolean(user && profileOpen);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.reload();
  }, [supabase]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Gradient background with glassmorphism */}
      <div className="absolute inset-0 bg-[#09090B]/90 backdrop-blur-xl border-b border-zinc-800/50" />

      {/* Subtle gradient accent on top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

      <nav className="relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <a href="#" className="flex items-center gap-2.5 group">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-all duration-300 group-hover:scale-105">
                <LumiLogo className="w-4 h-4 text-white" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                Lumi
              </span>
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white border border-transparent hover:border-zinc-700"
                asChild
              >
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4" />
                </a>
              </Button>

              {/* Profile Dropdown or Login */}
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen((current) => !current)}
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-all"
                  >
                    <div className="h-8 w-8 rounded-md bg-zinc-800 flex items-center justify-center border border-zinc-700">
                      <span className="text-xs font-medium text-white">
                        {user.email?.[0].toUpperCase()}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-zinc-400 transition-transform",
                        profileOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {showProfileMenu ? (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setProfileOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-60 bg-[#18181B] rounded-xl py-2 shadow-xl border border-zinc-800 z-50">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <p className="text-sm font-medium text-white truncate">
                            {user.email}
                          </p>
                        </div>
                        <div className="py-1">
                          <button className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                            <User className="w-4 h-4 text-zinc-500" />
                            Profile
                          </button>
                          <button className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                            <CreditCard className="w-4 h-4 text-zinc-500" />
                            Billing
                          </button>
                          <button className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                            <Settings className="w-4 h-4 text-zinc-500" />
                            Settings
                          </button>
                        </div>
                        <div className="border-t border-zinc-800 pt-1">
                          <button
                            onClick={handleSignOut}
                            className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-3 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Log out
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" asChild>
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/signup">Sign Up</Link>
                  </Button>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen((current) => !current)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors border border-zinc-700"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5 text-white" />
              ) : (
                <Menu className="h-5 w-5 text-white" />
              )}
            </button>
          </div>

          {/* Mobile Nav Panel */}
          {mobileMenuOpen ? (
            <div className="md:hidden border-t border-zinc-800 py-4 bg-[#09090B]">
              <div className="space-y-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-3 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-800">
                {user ? (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {user.email?.[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white truncate max-w-[200px]">
                        {user.email}
                      </p>
                      <button
                        onClick={handleSignOut}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 px-4">
                    <Button
                      variant="outline"
                      asChild
                      className="w-full justify-center"
                    >
                      <Link href="/login">Login</Link>
                    </Button>
                    <Button asChild className="w-full justify-center">
                      <Link href="/signup">Sign Up</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

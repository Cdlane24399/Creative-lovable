"use client"

import { useState } from "react"
import { Menu, X, Github, User, Settings, CreditCard, LogOut, Heart, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Community", href: "#" },
]

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Solid background instead of blur */}
      <div className="absolute inset-0 bg-[#09090B] border-b border-zinc-800" />

      <nav className="relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <a href="#" className="flex items-center gap-2.5 group">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 shadow-sm group-hover:bg-emerald-500 transition-colors">
                <Heart className="w-4 h-4 text-white" fill="white" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-white">Lovable</span>
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
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                </a>
              </Button>

              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-all"
                >
                  <div className="h-8 w-8 rounded-md bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <span className="text-xs font-medium text-white">C</span>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-zinc-400 transition-transform",
                    profileOpen && "rotate-180"
                  )} />
                </button>

                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-60 bg-[#18181B] rounded-xl py-2 shadow-xl border border-zinc-800 z-50">
                      <div className="px-4 py-3 border-b border-zinc-800">
                        <p className="text-sm font-medium text-white">Chris Anderson</p>
                        <p className="text-xs text-zinc-500">chris@example.com</p>
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
                        <button className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                          <LogOut className="w-4 h-4" />
                          Log out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
          {mobileMenuOpen && (
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
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">C</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Chris Anderson</p>
                    <p className="text-xs text-zinc-500">chris@example.com</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}

"use client"

import type React from "react"
import { useState, useRef } from "react"
import {
  Paperclip,
  AudioLines,
  ArrowUp,
  ChevronDown,
  MessageSquare,
  Palette,
  X,
  ArrowRight,
  Menu,
  Settings,
  LogOut,
  User,
  CreditCard,
} from "lucide-react"
import { IridescenceBackground } from "./iridescence-background"

const myProjects = [
  { id: 1, title: "saas-dashboard", image: "/modern-web-dashboard-dark.jpg", lastEdited: "2 hours ago" },
  { id: 2, title: "landing-page-v2", image: "/saas-pricing-page-dark.jpg", lastEdited: "Yesterday" },
  { id: 3, title: "portfolio-site", image: "/gateway-portal-dark-theme.jpg", lastEdited: "3 days ago" },
  { id: 4, title: "ecommerce-store", image: "/coffee-shop-website-dark.jpg", lastEdited: "1 week ago" },
]

const recentlyViewed = [
  { id: 5, title: "analytics-app", image: "/analytics-dashboard.png", lastEdited: "5 minutes ago" },
  { id: 6, title: "blog-platform", image: "/modern-web-dashboard-dark.jpg", lastEdited: "1 hour ago" },
  { id: 7, title: "task-manager", image: "/saas-pricing-page-dark.jpg", lastEdited: "3 hours ago" },
  { id: 8, title: "crm-system", image: "/gateway-portal-dark-theme.jpg", lastEdited: "6 hours ago" },
]

const templates = [
  { id: 9, title: "SaaS Landing", image: "/saas-pricing-page-dark.jpg", lastEdited: "Template" },
  { id: 10, title: "E-commerce", image: "/coffee-shop-website-dark.jpg", lastEdited: "Template" },
  { id: 11, title: "Portfolio", image: "/gateway-portal-dark-theme.jpg", lastEdited: "Template" },
  { id: 12, title: "Dashboard", image: "/modern-web-dashboard-dark.jpg", lastEdited: "Template" },
  { id: 13, title: "Blog", image: "/analytics-dashboard.png", lastEdited: "Template" },
  { id: 14, title: "Documentation", image: "/saas-pricing-page-dark.jpg", lastEdited: "Template" },
  { id: 15, title: "Admin Panel", image: "/modern-web-dashboard-dark.jpg", lastEdited: "Template" },
  { id: 16, title: "Social App", image: "/gateway-portal-dark-theme.jpg", lastEdited: "Template" },
]

interface LandingPageProps {
  onNavigateToEditor: () => void
}

export function LandingPage({ onNavigateToEditor }: LandingPageProps) {
  const [inputValue, setInputValue] = useState("")
  const [selectedTab, setSelectedTab] = useState("My projects")
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [chatEnabled, setChatEnabled] = useState(true)
  const [themeOpen, setThemeOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onNavigateToEditor()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const newImages = Array.from(files).map((file) => URL.createObjectURL(file))
      setUploadedImages((prev) => [...prev, ...newImages])
    }
  }

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const tabs = ["Recently viewed", "My projects", "Templates"]

  const getProjectsForTab = () => {
    switch (selectedTab) {
      case "Recently viewed":
        return recentlyViewed
      case "Templates":
        return templates
      default:
        return myProjects
    }
  }

  const currentProjects = getProjectsForTab()

  const navLinks = [
    { label: "Community", href: "#" },
    { label: "Pricing", href: "#" },
    { label: "Enterprise", href: "#" },
    { label: "Learn", href: "#" },
  ]

  return (
    <div className="min-h-screen text-white overflow-auto relative scroll-smooth">
      <IridescenceBackground color={[0.6, 0.3, 0.9]} speed={0.4} amplitude={0.1} />

      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col">
        <header className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/5">
          <nav className="w-full">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex h-16 items-center justify-between">
                {/* Brand */}
                <a href="#" className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-pink-500">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </span>
                  <span className="text-lg font-semibold tracking-tight">Lovable</span>
                </a>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-1">
                  {navLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="px-4 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>

                <div className="hidden md:flex items-center gap-3">
                  {/* Profile Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="flex items-center gap-2 hover:opacity-80 transition"
                    >
                      <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center text-sm font-semibold text-black">
                        C
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-white/70 transition-transform ${profileOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {profileOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 rounded-xl py-2 shadow-xl border border-zinc-800 z-50">
                          <div className="px-4 py-3 border-b border-zinc-800">
                            <p className="text-sm font-medium text-white">Chris Anderson</p>
                            <p className="text-xs text-zinc-400">chris@example.com</p>
                          </div>
                          <div className="py-1">
                            <button className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                              <User className="w-4 h-4" />
                              Profile
                            </button>
                            <button className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                              <CreditCard className="w-4 h-4" />
                              Billing
                            </button>
                            <button className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                              <Settings className="w-4 h-4" />
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
                  className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 hover:bg-white/15 transition"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5 text-white/90" />
                </button>
              </div>

              {/* Mobile Nav Panel */}
              {mobileMenuOpen && (
                <div className="md:hidden border-t border-white/10 mt-2 pt-2 pb-3">
                  <div className="grid gap-2">
                    {navLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-sm font-medium text-white/80"
                      >
                        {link.label}
                      </a>
                    ))}
                    <div className="flex items-center gap-3 pt-3 mt-2 border-t border-white/10">
                      <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center text-sm font-semibold text-black">
                        C
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Chris Anderson</p>
                        <p className="text-xs text-zinc-400">chris@example.com</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </header>

        {/* Hero Section - reduced height to show tabs peek at bottom */}
        <div className="h-[calc(100vh-140px)] flex flex-col pt-16">
          <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
            <div className="w-full max-w-2xl mx-auto text-center">
              <h1
                className="text-4xl md:text-5xl font-medium tracking-tight mb-8 text-balance"
                style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
              >
                Ready to build, Chris?
              </h1>

              <div className="bg-zinc-900/70 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl">
                {uploadedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {uploadedImages.map((image, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={image || "/placeholder.svg"}
                          alt={`Upload ${index + 1}`}
                          className="h-16 w-16 object-cover rounded-xl"
                        />
                        <button
                          onClick={() => removeImage(index)}
                          className="absolute -top-1.5 -right-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Lovable to explain how..."
                  className="w-full bg-transparent text-white placeholder:text-zinc-400 resize-none outline-none text-base min-h-[60px]"
                  rows={2}
                />

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    {/* Plus button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>

                    {/* Attach button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm px-3 py-2 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                      Attach
                    </button>

                    {/* Theme dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setThemeOpen(!themeOpen)}
                        className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm px-3 py-2 rounded-xl hover:bg-white/10 transition-colors"
                      >
                        <Palette className="w-4 h-4" />
                        Theme
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {themeOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-zinc-800/90 backdrop-blur-xl rounded-xl py-1 min-w-[120px] shadow-xl border border-white/10">
                          <button className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/10">
                            Light
                          </button>
                          <button className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/10">
                            Dark
                          </button>
                          <button className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/10">
                            System
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Chat toggle */}
                    <button
                      onClick={() => setChatEnabled(!chatEnabled)}
                      className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-colors ${
                        chatEnabled ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Chat
                    </button>

                    {/* Voice button */}
                    <button className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors">
                      <AudioLines className="w-5 h-5" />
                    </button>

                    <button
                      onClick={handleSubmit}
                      disabled={!inputValue.trim()}
                      className="bg-emerald-500 text-white disabled:bg-zinc-600 disabled:text-zinc-400 p-2.5 rounded-full transition-all hover:bg-emerald-400 hover:scale-105 shadow-lg shadow-emerald-500/20"
                    >
                      <ArrowUp className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {["Build a CRM", "Create a Landing Page", "Design a Dashboard", "Make a Blog"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInputValue(suggestion)}
                    className="px-4 py-2 text-sm text-zinc-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all hover:text-white hover:border-white/20"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </main>
        </div>

        <div className="h-24 bg-gradient-to-b from-transparent to-zinc-900 -mt-24 relative z-20 pointer-events-none" />

        <section className="bg-zinc-900 rounded-t-[2rem] px-6 py-6 relative z-30 -mt-8">
          <div className="max-w-7xl mx-auto">
            {/* Header with tabs */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedTab === tab ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors">
                Browse all
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {currentProjects.map((project) => (
                <button key={project.id} onClick={onNavigateToEditor} className="group cursor-pointer text-left">
                  <div className="relative rounded-xl overflow-hidden mb-2 bg-zinc-800 border border-zinc-700/80 shadow-lg">
                    <img
                      src={project.image || "/placeholder.svg"}
                      alt={project.title}
                      className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                    {project.title}
                  </span>
                  <p className="text-xs text-zinc-500">{project.lastEdited}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

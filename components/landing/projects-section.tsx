"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Clock, Star, Folder, Grid3X3, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

const myProjects = [
  { id: 1, title: "saas-dashboard", image: "/modern-web-dashboard-dark.jpg", lastEdited: "2 hours ago", starred: true },
  { id: 2, title: "landing-page-v2", image: "/saas-pricing-page-dark.jpg", lastEdited: "Yesterday", starred: false },
  { id: 3, title: "portfolio-site", image: "/gateway-portal-dark-theme.jpg", lastEdited: "3 days ago", starred: true },
  { id: 4, title: "ecommerce-store", image: "/coffee-shop-website-dark.jpg", lastEdited: "1 week ago", starred: false },
]

const recentlyViewed = [
  { id: 5, title: "analytics-app", image: "/analytics-dashboard.png", lastEdited: "5 minutes ago", starred: false },
  { id: 6, title: "blog-platform", image: "/modern-web-dashboard-dark.jpg", lastEdited: "1 hour ago", starred: false },
  { id: 7, title: "task-manager", image: "/saas-pricing-page-dark.jpg", lastEdited: "3 hours ago", starred: true },
  { id: 8, title: "crm-system", image: "/gateway-portal-dark-theme.jpg", lastEdited: "6 hours ago", starred: false },
]

const templates = [
  { id: 9, title: "SaaS Landing", image: "/saas-pricing-page-dark.jpg", lastEdited: "Template", category: "Marketing" },
  { id: 10, title: "E-commerce", image: "/coffee-shop-website-dark.jpg", lastEdited: "Template", category: "Store" },
  { id: 11, title: "Portfolio", image: "/gateway-portal-dark-theme.jpg", lastEdited: "Template", category: "Personal" },
  { id: 12, title: "Dashboard", image: "/modern-web-dashboard-dark.jpg", lastEdited: "Template", category: "App" },
  { id: 13, title: "Blog", image: "/analytics-dashboard.png", lastEdited: "Template", category: "Content" },
  { id: 14, title: "Documentation", image: "/saas-pricing-page-dark.jpg", lastEdited: "Template", category: "Docs" },
  { id: 15, title: "Admin Panel", image: "/modern-web-dashboard-dark.jpg", lastEdited: "Template", category: "App" },
  { id: 16, title: "Social App", image: "/gateway-portal-dark-theme.jpg", lastEdited: "Template", category: "App" },
]

interface ProjectsSectionProps {
  onNavigateToEditor: (prompt?: string) => void
}

export function ProjectsSection({ onNavigateToEditor }: ProjectsSectionProps) {
  const [selectedTab, setSelectedTab] = useState("My projects")

  const tabs = [
    { id: "My projects", icon: Folder, count: myProjects.length },
    { id: "Recently viewed", icon: Clock, count: recentlyViewed.length },
    { id: "Templates", icon: Grid3X3, count: templates.length },
  ]

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

  return (
    <section className="relative py-12 sm:py-16 bg-[#09090B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-[#18181B] border border-zinc-800 p-1 rounded-xl overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                  selectedTab === tab.id
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/50"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.id}</span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-md",
                  selectedTab === tab.id ? "bg-zinc-700 text-zinc-200" : "bg-zinc-800 text-zinc-500"
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateToEditor()}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-all hover:scale-[1.02] shadow-sm active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
            <button className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors group px-3 py-2 rounded-lg hover:bg-[#18181B]">
              Browse all
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {currentProjects.map((project, index) => (
              <motion.button
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                onClick={() => onNavigateToEditor()}
                className="group text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded-2xl"
              >
                <div className="relative rounded-2xl overflow-hidden bg-[#18181B] border border-zinc-800 hover:border-zinc-700 transition-all duration-300 hover:shadow-lg hover:shadow-black/20">
                  {/* Image */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
                    <img
                      src={project.image || "/placeholder.svg"}
                      alt={project.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                    />
                    
                    {/* Starred badge */}
                    {'starred' in project && project.starred && (
                      <div className="absolute top-3 right-3">
                        <div className="w-7 h-7 rounded-full bg-[#18181B] border border-zinc-700 flex items-center justify-center shadow-sm">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        </div>
                      </div>
                    )}

                    {/* Category badge for templates */}
                    {'category' in project && (
                      <div className="absolute top-3 left-3">
                        <span className="px-2 py-1 text-[10px] font-medium text-zinc-200 bg-[#18181B] rounded-md border border-zinc-700 shadow-sm">
                          {project.category}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 border-t border-zinc-800/50">
                    <h3 className="font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
                      {project.title}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {project.lastEdited}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

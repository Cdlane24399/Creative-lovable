"use client"

import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Clock, Star, Folder, Grid3X3, Plus, Loader2, Trash2, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjects } from "@/hooks/use-projects"
import type { ProjectCardData } from "@/lib/db/types"

// Template data (static)
const templates = [
  { id: "t1", title: "SaaS Landing", image: "/saas-pricing-page-dark.jpg", lastEdited: "Template", category: "Marketing" },
  { id: "t2", title: "E-commerce", image: "/coffee-shop-website-dark.jpg", lastEdited: "Template", category: "Store" },
  { id: "t3", title: "Portfolio", image: "/gateway-portal-dark-theme.jpg", lastEdited: "Template", category: "Personal" },
  { id: "t4", title: "Dashboard", image: "/modern-web-dashboard-dark.jpg", lastEdited: "Template", category: "App" },
  { id: "t5", title: "Blog", image: "/analytics-dashboard.png", lastEdited: "Template", category: "Content" },
  { id: "t6", title: "Documentation", image: "/saas-pricing-page-dark.jpg", lastEdited: "Template", category: "Docs" },
]

type DisplayProject = ProjectCardData & { category?: string }

const templateProjects: DisplayProject[] = templates.map((template) => ({
  id: template.id,
  title: template.title,
  image: template.image,
  lastEdited: template.lastEdited,
  starred: false,
  sandboxUrl: null,
  category: template.category,
}))

interface ProjectsSectionProps {
  onNavigateToEditor: (projectId?: string, prompt?: string) => void
}

export function ProjectsSection({ onNavigateToEditor }: ProjectsSectionProps) {
  const [selectedTab, setSelectedTab] = useState("My projects")
  const { projects, projectCards, isLoading, error, refetch, deleteProject, toggleStarred } = useProjects()

  // Separate starred and recent projects
  const starredProjects = useMemo(() => projectCards.filter((p) => p.starred), [projectCards])
  const recentProjects = useMemo(() => projectCards.slice(0, 8), [projectCards])

  const tabs = useMemo(() => [
    { id: "My projects", icon: Folder, count: projectCards.length },
    { id: "Starred", icon: Star, count: starredProjects.length },
    { id: "Templates", icon: Grid3X3, count: templates.length },
  ], [projectCards.length, starredProjects.length])

  const isTemplatesTab = selectedTab === "Templates"
  const isMyProjectsTab = selectedTab === "My projects"

  const currentProjects = useMemo<DisplayProject[]>(() => {
    if (selectedTab === "Starred") {
      return starredProjects
    }

    if (isTemplatesTab) {
      return templateProjects
    }

    return recentProjects
  }, [isTemplatesTab, recentProjects, selectedTab, starredProjects])

  const shouldShowLoading = isLoading && !isTemplatesTab
  const shouldShowError = Boolean(error) && !isTemplatesTab
  const shouldShowEmptyState = !isLoading && !error && currentProjects.length === 0 && !isTemplatesTab
  const shouldShowProjectsGrid = (!isLoading || isTemplatesTab) && currentProjects.length > 0

  const handleProjectClick = (project: DisplayProject) => {
    if (selectedTab === "Templates") {
      // For templates, start a new project with the template prompt
      const templatePrompt = `Create a ${project.title.toLowerCase()} website`
      onNavigateToEditor(undefined, templatePrompt)
    } else {
      // For existing projects, open them
      onNavigateToEditor(project.id)
    }
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (window.confirm("Are you sure you want to delete this project?")) {
      await deleteProject(projectId)
    }
  }

  const handleToggleStar = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    await toggleStarred(projectId)
  }

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
            {projectCards.length > 8 ? (
              <button className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors group px-3 py-2 rounded-lg hover:bg-[#18181B]">
                Browse all
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Loading state */}
        {shouldShowLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : null}

        {/* Error state */}
        {shouldShowError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-zinc-400">Failed to load projects</p>
            <button
              onClick={refetch}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        ) : null}

        {/* Empty state */}
        {shouldShowEmptyState ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
              <Folder className="w-8 h-8 text-zinc-500" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-zinc-200 mb-1">
                {selectedTab === "Starred" ? "No starred projects" : "No projects yet"}
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm">
                {selectedTab === "Starred"
                  ? "Star your favorite projects to find them quickly here."
                  : "Create your first project to get started building with AI."}
              </p>
            </div>
            {isMyProjectsTab ? (
              <button
                onClick={() => onNavigateToEditor()}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Create your first project
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Projects Grid */}
        {shouldShowProjectsGrid ? (
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
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="group relative"
                >
                  <div
                    onClick={() => handleProjectClick(project)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleProjectClick(project)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded-2xl"
                  >
                    <div className="relative rounded-2xl overflow-hidden bg-[#18181B] border border-zinc-800 hover:border-zinc-700 transition-all duration-300 hover:shadow-lg hover:shadow-black/20">
                      {/* Image */}
                      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
                        {project.image ? (
                          <img
                            src={project.image}
                            alt={project.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                            <div className="text-center">
                              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <span className="text-emerald-400 font-mono text-lg">{"</>"}</span>
                              </div>
                              <span className="text-xs text-zinc-500">No preview</span>
                            </div>
                          </div>
                        )}

                        {/* Starred badge */}
                        {project.starred ? (
                          <div className="absolute top-3 right-3">
                            <div className="w-7 h-7 rounded-full bg-[#18181B] border border-zinc-700 flex items-center justify-center shadow-sm">
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            </div>
                          </div>
                        ) : null}

                        {/* Category badge for templates */}
                        {"category" in project && (project as { category?: string }).category ? (
                          <div className="absolute top-3 left-3">
                            <span className="px-2 py-1 text-[10px] font-medium text-zinc-200 bg-[#18181B] rounded-md border border-zinc-700 shadow-sm">
                              {(project as { category?: string }).category}
                            </span>
                          </div>
                        ) : null}

                        {/* Hover overlay with actions (for non-templates) */}
                        {!isTemplatesTab ? (
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => handleToggleStar(e, project.id)}
                              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
                              title={project.starred ? "Unstar" : "Star"}
                            >
                              <Star
                                className={cn(
                                  "w-4 h-4",
                                  project.starred ? "text-amber-400 fill-amber-400" : "text-zinc-300"
                                )}
                              />
                            </button>
                            {project.sandboxUrl ? (
                              <a
                                href={project.sandboxUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
                                title="Open preview"
                              >
                                <ExternalLink className="w-4 h-4 text-zinc-300" />
                              </a>
                            ) : null}
                            <button
                              onClick={(e) => handleDeleteProject(e, project.id)}
                              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-red-600 transition-colors"
                              title="Delete project"
                            >
                              <Trash2 className="w-4 h-4 text-zinc-300" />
                            </button>
                          </div>
                        ) : null}
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
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </section>
  )
}

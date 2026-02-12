"use client";

import * as React from "react";
import {
  Globe,
  Lock,
  Plus,
  Trash2,
  Save,
  Terminal,
  Activity,
  Server,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/db/types";

interface ProjectSettingsProps {
  project?: Project | null;
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  // Mock state for settings
  const [envVars, setEnvVars] = React.useState<
    { key: string; value: string }[]
  >([
    { key: "NEXT_PUBLIC_API_URL", value: "https://api.example.com" },
    { key: "DATABASE_URL", value: "postgresql://..." },
  ]);

  const [visibility, setVisibility] = React.useState<"public" | "private">(
    "private",
  );
  const [aiModel, setAiModel] = React.useState("claude-3-5-sonnet");

  const addEnvVar = () => {
    setEnvVars((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full w-full bg-[#111111] overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Project Settings</h1>
          <p className="text-zinc-400 mt-1">
            Manage configuration, deployments, and AI options for{" "}
            {project?.name || "your project"}
          </p>
        </div>

        {/* Visibility Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Globe className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-200">
              Visibility & Access
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setVisibility("public")}
              className={cn(
                "flex flex-col items-start p-4 rounded-xl border transition-all text-left",
                visibility === "public"
                  ? "bg-zinc-800/50 border-blue-500/50 ring-1 ring-blue-500/50"
                  : "bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Globe
                  className={cn(
                    "h-4 w-4",
                    visibility === "public" ? "text-blue-400" : "text-zinc-400",
                  )}
                />
                <span
                  className={cn(
                    "font-medium",
                    visibility === "public" ? "text-blue-100" : "text-zinc-300",
                  )}
                >
                  Public
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Anyone with the link can view your deployed project.
              </p>
            </button>

            <button
              onClick={() => setVisibility("private")}
              className={cn(
                "flex flex-col items-start p-4 rounded-xl border transition-all text-left",
                visibility === "private"
                  ? "bg-zinc-800/50 border-amber-500/50 ring-1 ring-amber-500/50"
                  : "bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Lock
                  className={cn(
                    "h-4 w-4",
                    visibility === "private"
                      ? "text-amber-400"
                      : "text-zinc-400",
                  )}
                />
                <span
                  className={cn(
                    "font-medium",
                    visibility === "private"
                      ? "text-amber-100"
                      : "text-zinc-300",
                  )}
                >
                  Private
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Only you can view and edit this project.
              </p>
            </button>
          </div>
        </section>

        {/* Env Variables Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Terminal className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-200">
              Environment Variables
            </h2>
          </div>

          <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 space-y-3">
            <div className="space-y-2">
              {envVars.map((env, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setEnvVars((prev) =>
                        prev.map((env, idx) =>
                          idx === i ? { ...env, key: newValue } : env,
                        ),
                      );
                    }}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                  <input
                    type="text"
                    placeholder="VALUE"
                    value={env.value}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setEnvVars((prev) =>
                        prev.map((env, idx) =>
                          idx === i ? { ...env, value: newValue } : env,
                        ),
                      );
                    }}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    onClick={() => removeEnvVar(i)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addEnvVar}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium px-1 py-1"
            >
              <Plus className="h-3 w-3" />
              Add Variable
            </button>
          </div>
        </section>

        {/* AI Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Cpu className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-200">
              AI Configuration
            </h2>
          </div>

          <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">
                  Default Model
                </label>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700 appearance-none"
                >
                  <option value="claude-3-5-sonnet">
                    Claude 3.5 Sonnet (Recommended)
                  </option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">
                  Custom System Prompt
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter specific instructions for the AI to follow when generating code..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 resize-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Deployments Stub */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Server className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-200">Deployments</h2>
          </div>

          <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 p-3 border-b border-zinc-800/50 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-900/50">
              <div>Commit / Description</div>
              <div>Status</div>
              <div>Time</div>
            </div>

            <div className="divide-y divide-zinc-800/50">
              {[
                {
                  message: "Update landing page hero",
                  status: "ready",
                  time: "2m ago",
                },
                {
                  message: "Fix mobile navigation",
                  status: "ready",
                  time: "1h ago",
                },
                { message: "Initial commit", status: "ready", time: "3h ago" },
              ].map((deploy, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 p-4 text-sm hover:bg-zinc-800/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-zinc-300 font-mono">
                      {deploy.message}
                    </span>
                  </div>
                  <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    Ready
                  </div>
                  <div className="text-zinc-500 text-xs">{deploy.time}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end pt-4 pb-20">
          <button className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded-md font-medium transition-colors">
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

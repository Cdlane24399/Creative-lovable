"use client"

import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { MODEL_DISPLAY_NAMES, MODEL_DESCRIPTIONS, type ModelProvider } from "@/lib/ai/agent"
import { AnthropicIcon, GoogleIcon, OpenAIIcon } from "./icons"

interface ModelSelectorProps {
  selectedModel: ModelProvider
  onModelChange: (model: ModelProvider) => void
  showDescriptions?: boolean
  className?: string
  triggerClassName?: string
  disabled?: boolean
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  showDescriptions = false,
  className,
  triggerClassName,
  disabled,
}: ModelSelectorProps) {
  const getIcon = (model: ModelProvider, className?: string) => {
    switch (model) {
      case "anthropic":
      case "opus":
        return <AnthropicIcon className={className} />
      case "google":
      case "googlePro":
        return <GoogleIcon className={className} />
      case "openai":
        return <OpenAIIcon className={className} />
    }
  }

  const models: ModelProvider[] = ["anthropic", "opus", "google", "googlePro", "openai"]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-9 gap-2 rounded-xl px-3 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors border border-transparent hover:border-white/5",
            triggerClassName
          )}
        >
          {getIcon(selectedModel, "h-4 w-4")}
          <span className="text-sm hidden sm:inline">{MODEL_DISPLAY_NAMES[selectedModel]}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className={cn(
          "bg-[#18181B] border-zinc-800 shadow-xl",
          showDescriptions ? "w-72" : "w-56",
          className
        )}
      >
        <DropdownMenuLabel className="text-xs text-zinc-500 font-normal px-2 py-1.5">
          Select Model
        </DropdownMenuLabel>
        
        {models.map((model) => (
          <DropdownMenuItem
            key={model}
            onClick={() => onModelChange(model)}
            className={cn(
              "relative text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer py-2.5 focus:bg-zinc-800 focus:text-zinc-100 pr-8",
              selectedModel === model && "bg-zinc-800 text-zinc-100",
            )}
          >
            <div className="flex items-start gap-3 w-full">
              <div className="mt-0.5 shrink-0">
                {getIcon(model, "h-5 w-5")}
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-sm leading-none flex items-center justify-between">
                  {MODEL_DISPLAY_NAMES[model]}
                </div>
                {showDescriptions && (
                  <div className="text-xs text-zinc-500 leading-snug">
                    {MODEL_DESCRIPTIONS[model]}
                  </div>
                )}
              </div>
              {selectedModel === model && (
                <div className="absolute right-2 top-2.5 text-emerald-500">
                  <Check className="h-4 w-4" />
                </div>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

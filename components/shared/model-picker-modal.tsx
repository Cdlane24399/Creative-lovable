"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MODEL_DISPLAY_NAMES,
  MODEL_DESCRIPTIONS,
  type ModelProvider,
} from "@/lib/ai/agent"
import {
  AnthropicIcon,
  GoogleIcon,
  OpenAIIcon,
  MiniMaxIcon,
  MoonshotIcon,
  GLMIcon,
} from "./icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ModelPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedModel: ModelProvider
  onModelChange: (model: ModelProvider) => void
}

const MODELS: ModelProvider[] = [
  "anthropic",
  "opus",
  "google",
  "googlePro",
  "openai",
  "haiku",
  "minimax",
  "moonshot",
  "glm",
]

function getModelIcon(model: ModelProvider, className?: string) {
  switch (model) {
    case "anthropic":
    case "opus":
    case "haiku":
      return <AnthropicIcon className={className} />
    case "google":
    case "googlePro":
      return <GoogleIcon className={className} />
    case "openai":
      return <OpenAIIcon className={className} />
    case "minimax":
      return <MiniMaxIcon className={className} />
    case "moonshot":
      return <MoonshotIcon className={className} />
    case "glm":
      return <GLMIcon className={className} />
  }
}

export function ModelPickerModal({
  open,
  onOpenChange,
  selectedModel,
  onModelChange,
}: ModelPickerModalProps) {
  const handleSelect = (model: ModelProvider) => {
    onModelChange(model)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-white/[0.08] shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.05]">
          <DialogTitle className="text-lg font-semibold tracking-tight">Choose Model</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Select the AI model for your project. Each model has different strengths.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-3 grid gap-1">
            {MODELS.map((model) => {
              const isSelected = selectedModel === model
              
              return (
                <button
                  key={model}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full flex items-center gap-4 px-3 py-3 rounded-lg text-left transition-all duration-200 outline-none group",
                    isSelected 
                      ? "bg-accent/50 ring-1 ring-white/10" 
                      : "hover:bg-accent/30"
                  )}
                >
                  <div className={cn(
                    "flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-lg border transition-colors duration-200",
                    isSelected
                      ? "bg-background border-white/20"
                      : "bg-background/40 border-white/5 group-hover:border-white/10"
                  )}>
                    {getModelIcon(model, "h-5 w-5")}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        "text-sm font-medium transition-colors",
                        isSelected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
                      )}>
                        {MODEL_DISPLAY_NAMES[model]}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {MODEL_DESCRIPTIONS[model]}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
        
        <div className="px-6 py-4 bg-accent/20 border-t border-white/[0.05]">
          <p className="text-[11px] text-muted-foreground text-center">
            Settings are saved per project. High-capacity models may be slower.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MODEL_DISPLAY_NAMES,
  MODEL_DESCRIPTIONS,
  type ModelProvider,
} from "@/lib/ai/agent";
import {
  ModelSelector as AIModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorLogo,
  ModelSelectorName,
} from "@/components/ai-elements/model-selector";
import { Check } from "lucide-react";

interface ModelSelectorProps {
  selectedModel: ModelProvider;
  onModelChange: (model: ModelProvider) => void;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

const MODELS: {
  key: ModelProvider;
  provider: string;
}[] = [
  { key: "anthropic", provider: "anthropic" },
  { key: "opus", provider: "anthropic" },
  { key: "google", provider: "google" },
  { key: "googlePro", provider: "google" },
  { key: "openai", provider: "openai" },
  { key: "haiku", provider: "anthropic" },
  { key: "minimax", provider: "deepinfra" },
  { key: "moonshot", provider: "moonshotai" },
  { key: "glm", provider: "zai" },
];

export function ModelSelector({
  selectedModel,
  onModelChange,
  className,
  triggerClassName,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const selected = MODELS.find((m) => m.key === selectedModel);

  return (
    <div className={className}>
      <AIModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-8 gap-2 rounded-lg px-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors",
              triggerClassName,
            )}
          >
            {selected && (
              <ModelSelectorLogo
                provider={selected.provider as "anthropic"}
                className="size-4"
              />
            )}
            <span className="text-sm hidden sm:inline">
              {MODEL_DISPLAY_NAMES[selectedModel]}
            </span>
            <ChevronDown size={14} className="opacity-50" />
          </Button>
        </ModelSelectorTrigger>
        <ModelSelectorContent title="Choose Model">
          <ModelSelectorInput placeholder="Search models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            <ModelSelectorGroup>
              {MODELS.map((model) => {
                const isSelected = selectedModel === model.key;
                return (
                  <ModelSelectorItem
                    key={model.key}
                    value={model.key}
                    onSelect={() => {
                      onModelChange(model.key);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <ModelSelectorLogo
                      provider={model.provider as "anthropic"}
                      className="size-4"
                    />
                    <div className="flex-1 min-w-0">
                      <ModelSelectorName>
                        {MODEL_DISPLAY_NAMES[model.key]}
                      </ModelSelectorName>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {MODEL_DESCRIPTIONS[model.key]}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </ModelSelectorItem>
                );
              })}
            </ModelSelectorGroup>
          </ModelSelectorList>
        </ModelSelectorContent>
      </AIModelSelector>
    </div>
  );
}

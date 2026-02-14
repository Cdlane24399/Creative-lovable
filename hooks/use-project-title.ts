"use client";

import { useCallback, useRef } from "react";
import { isPlaceholderProjectName } from "@/lib/ai/project-naming";

const debugLog =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? (...args: Parameters<typeof console.log>) => console.log(...args)
    : () => {};

interface UseProjectTitleOptions {
  projectId: string | undefined;
  initialPrompt: string | null | undefined;
  projectNameRef: React.RefObject<string>;
  setProjectName: (name: string) => void;
  updateProject: (data: { name: string }) => Promise<{ name?: string } | null>;
}

export function useProjectTitle({
  projectId,
  initialPrompt,
  projectNameRef,
  setProjectName,
  updateProject,
}: UseProjectTitleOptions) {
  const titleGeneratedRef = useRef(false);

  const generateProjectTitle = useCallback(async () => {
    if (!initialPrompt || !projectId) return;
    if (titleGeneratedRef.current) return;
    const currentProjectName = projectNameRef.current;
    if (!isPlaceholderProjectName(currentProjectName, projectId)) return;

    debugLog("[EditorProvider] Generating project title...");

    try {
      const response = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: initialPrompt, projectId }),
      });

      if (response.ok) {
        const { title } = await response.json();
        if (title) {
          debugLog("[EditorProvider] Generated title:", title);
          setProjectName(title);

          const updated = await updateProject({ name: title });
          if (updated?.name === title) {
            titleGeneratedRef.current = true;
          } else {
            console.warn("[EditorProvider] Failed to persist generated title");
          }
        }
      } else {
        console.warn(
          "[EditorProvider] Title generation failed, will retry on next trigger",
        );
      }
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  }, [initialPrompt, projectId, projectNameRef, setProjectName, updateProject]);

  return {
    titleGeneratedRef,
    generateProjectTitle,
  };
}

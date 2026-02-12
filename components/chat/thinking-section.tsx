"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ThinkingSectionProps {
  content: string;
  isExpanded?: boolean;
}

/**
 * ThinkingSection displays AI thinking/reasoning content in a collapsible format.
 * Shows the first line as a preview with "Thinking:" prefix.
 * Supports **bold** markdown formatting within text.
 */
export function ThinkingSection({
  content,
  isExpanded: initialExpanded = false,
}: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Get first line as title/preview
  const lines = content.split("\n").filter((line) => line.trim());
  const firstLine = lines[0] || content.substring(0, 100);
  const restContent = lines.slice(1).join("\n");
  const hasMoreContent = lines.length > 1;

  // Parse content for **bold** formatting
  const formatThinkingContent = (text: string) => {
    // Split by double asterisks for emphasis
    const parts = text.split(/\*\*(.*?)\*\*/g);

    return parts.map((part, index) => {
      // Odd indices are the emphasized text (between **)
      if (index % 2 === 1) {
        return (
          <span key={index} className="font-medium text-gray-300">
            {part}
          </span>
        );
      }

      // Format regular text with proper line breaks
      return part.split("\n").map((line, lineIndex) => (
        <React.Fragment key={`${index}-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {line}
        </React.Fragment>
      ));
    });
  };

  return (
    <div className="my-2 text-sm text-gray-400">
      {/* Always visible first line with preview */}
      <div
        onClick={() => hasMoreContent && setIsExpanded((prev) => !prev)}
        className={`${
          hasMoreContent ? "cursor-pointer hover:text-gray-300" : ""
        } transition-colors`}
      >
        <span className="italic">Thinking: </span>
        <span className="italic">
          {formatThinkingContent(
            firstLine.replace(/^\*\*/, "").replace(/\*\*$/, ""),
          )}
        </span>
        {hasMoreContent && (
          <span className="ml-1 text-xs text-gray-500">
            {isExpanded ? "▼" : "▶"}
          </span>
        )}
      </div>

      {/* Expanded content - rest of the thinking */}
      {hasMoreContent && (
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-2 overflow-hidden"
            >
              <div className="italic text-gray-400 leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-gray-600/50">
                {formatThinkingContent(restContent)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

export default ThinkingSection;

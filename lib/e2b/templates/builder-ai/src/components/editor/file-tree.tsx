'use client';

import { File, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  selectedFile?: string;
  onSelectFile?: (path: string) => void;
}

export function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src']));

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;

    if (node.type === 'folder') {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors',
              'text-left'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        onClick={() => onSelectFile?.(node.path)}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors',
          'text-left',
          isSelected && 'bg-accent'
        )}
        style={{ paddingLeft: `${depth * 12 + 28}px` }}
      >
        <File className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
          FILES
        </div>
        {files.map(node => renderNode(node))}
      </div>
    </ScrollArea>
  );
}

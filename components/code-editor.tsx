"use client"

import * as React from "react"
import Editor from "@monaco-editor/react"
import { File, Folder, ChevronRight, ChevronDown, FileJson, FileCode, FileType, FileText, Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Initialize Monaco loader with app theme colors if needed, 
// but we'll stick to 'vs-dark' for now which is standard and looks good.
// We can customize it later if the "apps theme" implies strict token matching.

interface CodeEditorProps {
  files?: Record<string, string>
  readOnly?: boolean
  isLoading?: boolean
}

type FileNode = {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
}

const getLanguageFromPath = (path: string) => {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript"
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".html")) return "html"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".md")) return "markdown"
  if (path.endsWith(".sql")) return "sql"
  return "plaintext"
}

const getFileIcon = (name: string) => {
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return <FileCode className="h-4 w-4 text-blue-400" />
  if (name.endsWith(".jsx") || name.endsWith(".js")) return <FileCode className="h-4 w-4 text-yellow-400" />
  if (name.endsWith(".css")) return <FileType className="h-4 w-4 text-blue-300" />
  if (name.endsWith(".html")) return <FileCode className="h-4 w-4 text-orange-400" />
  if (name.endsWith(".json")) return <FileJson className="h-4 w-4 text-yellow-200" />
  if (name.endsWith(".md")) return <FileText className="h-4 w-4 text-gray-400" />
  if (name.match(/\.(png|jpg|jpeg|svg|gif)$/)) return <ImageIcon className="h-4 w-4 text-purple-400" />
  return <File className="h-4 w-4 text-gray-400" />
}

const buildFileTree = (files: Record<string, string>): FileNode[] => {
  const root: FileNode[] = []
  
  Object.keys(files).sort().forEach(path => {
    const parts = path.split('/')
    let currentLevel = root
    
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const existingNode = currentLevel.find(node => node.name === part)
      
      if (existingNode) {
        if (!isFile) {
          currentLevel = existingNode.children!
        }
      } else {
        const newNode: FileNode = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
          content: isFile ? files[path] : undefined
        }
        currentLevel.push(newNode)
        if (!isFile) {
          currentLevel = newNode.children!
        }
      }
    })
  })

  // Sort: Folders first, then files
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === 'folder' ? -1 : 1
    })
    nodes.forEach(node => {
      if (node.children) sortNodes(node.children)
    })
  }

  sortNodes(root)
  return root
}

const FileTreeNode = ({ 
  node, 
  level = 0, 
  activePath, 
  onSelect,
  defaultOpen = false
}: { 
  node: FileNode
  level?: number
  activePath: string | null
  onSelect: (node: FileNode) => void
  defaultOpen?: boolean
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen || node.name === 'app' || node.name === 'components')
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (node.type === 'folder') {
      setIsOpen(!isOpen)
    } else {
      onSelect(node)
    }
  }

  return (
    <div>
      <div 
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 cursor-pointer text-sm select-none hover:bg-zinc-800/50 transition-colors",
          activePath === node.path && node.type === 'file' ? "bg-zinc-800 text-blue-400" : "text-zinc-400"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {node.type === 'folder' && (
          <span className="text-zinc-500">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
        {node.type === 'folder' ? (
          <Folder className="h-4 w-4 text-blue-500/80" />
        ) : (
          getFileIcon(node.name)
        )}
        <span className="truncate">{node.name}</span>
      </div>
      
      {node.type === 'folder' && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode 
              key={child.path} 
              node={child} 
              level={level + 1} 
              activePath={activePath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const CodeEditor = React.memo(function CodeEditor({ files = {}, readOnly = true, isLoading = false }: CodeEditorProps) {
  const [activeFile, setActiveFile] = React.useState<FileNode | null>(null)
  const fileTree = React.useMemo(() => buildFileTree(files), [files])
  const hasFiles = Object.keys(files).length > 0

  // Select first file by default if no active file
  React.useEffect(() => {
    if (!activeFile && hasFiles) {
      // Try to find a good default file (e.g., page.tsx, App.tsx, index.js)
      const defaultFiles = ['app/page.tsx', 'src/App.tsx', 'index.js', 'package.json']
      for (const path of defaultFiles) {
        if (files[path]) {
          setActiveFile({
            name: path.split('/').pop()!,
            path,
            type: 'file',
            content: files[path]
          })
          return
        }
      }

      // Fallback to first file found
      const firstPath = Object.keys(files)[0]
      setActiveFile({
        name: firstPath.split('/').pop()!,
        path: firstPath,
        type: 'file',
        content: files[firstPath]
      })
    }
  }, [files, activeFile, hasFiles])

  // Reset active file when files become empty (e.g., loading new project)
  React.useEffect(() => {
    if (!hasFiles) {
      setActiveFile(null)
    }
  }, [hasFiles])

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#1e1e1e] rounded-xl border border-zinc-800">
      {/* File Tree (Left) */}
      <div className="w-64 flex-shrink-0 bg-[#1e1e1e] flex flex-col border-r border-zinc-800">
        <div className="h-9 flex items-center px-3 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Explorer</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {fileTree.map(node => (
            <FileTreeNode
              key={node.path}
              node={node}
              activePath={activeFile?.path ?? null}
              onSelect={setActiveFile}
            />
          ))}
          {fileTree.length === 0 && (
            <div className="px-4 py-8 text-center">
              {isLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
                  <span className="text-xs text-zinc-500">Syncing files...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-zinc-500">No files available</span>
                  <span className="text-xs text-zinc-600">Files will appear here after the project is created</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editor Area (Right) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* File Tab Header */}
        <div className="flex items-center h-9 bg-[#1e1e1e] border-b border-zinc-800 px-4">
          {activeFile ? (
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              {getFileIcon(activeFile.name)}
              <span>{activeFile.name}</span>
            </div>
          ) : (
            <span className="text-sm text-zinc-500">No file selected</span>
          )}
        </div>
        
        {/* Monaco Editor */}
        <div className="flex-1 relative">
          {activeFile ? (
            <Editor
              height="100%"
              defaultLanguage="typescript"
              language={getLanguageFromPath(activeFile.path)}
              value={activeFile.content}
              theme="vs-dark"
              options={{
                readOnly: readOnly,
                minimap: { enabled: false },
                fontSize: 13,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Monaco', monospace",
                lineHeight: 20,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500 text-sm">
              Select a file to view code
            </div>
          )}
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these actually changed
  return (
    prevProps.files === nextProps.files &&
    prevProps.readOnly === nextProps.readOnly &&
    prevProps.isLoading === nextProps.isLoading
  )
})

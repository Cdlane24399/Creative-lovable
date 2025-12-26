'use client';

import { useState } from 'react';
import { 
  PanelLeftClose, 
  PanelLeft, 
  Code, 
  Eye, 
  Sparkles,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { ChatInterface } from '@/components/chat/chat-interface';
import { CodeEditor } from '@/components/editor/code-editor';
import { PreviewPane } from '@/components/editor/preview-pane';
import { FileTree } from '@/components/editor/file-tree';

const sampleCode = `function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to BuilderAI
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          An AI-powered platform to build web applications through natural language.
        </p>
        <div className="flex gap-4">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Get Started
          </button>
          <button className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors">
            Learn More
          </button>
        </div>
      </div>
    </div>
  );
}`;

const sampleFiles = [
  {
    name: 'src',
    path: 'src',
    type: 'folder' as const,
    children: [
      {
        name: 'app',
        path: 'src/app',
        type: 'folder' as const,
        children: [
          { name: 'page.tsx', path: 'src/app/page.tsx', type: 'file' as const },
          { name: 'layout.tsx', path: 'src/app/layout.tsx', type: 'file' as const },
          { name: 'globals.css', path: 'src/app/globals.css', type: 'file' as const },
        ],
      },
      {
        name: 'components',
        path: 'src/components',
        type: 'folder' as const,
        children: [
          { name: 'button.tsx', path: 'src/components/button.tsx', type: 'file' as const },
          { name: 'card.tsx', path: 'src/components/card.tsx', type: 'file' as const },
        ],
      },
    ],
  },
];

export default function Home() {
  const [code, setCode] = useState(sampleCode);
  const [activeTab, setActiveTab] = useState<'chat' | 'code'>('chat');
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedFile, setSelectedFile] = useState('src/app/page.tsx');

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? <PanelLeftClose className="size-5" /> : <PanelLeft className="size-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="size-6 text-primary" />
            <h1 className="font-bold text-xl">BuilderAI</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Save className="size-4 mr-2" />
            Save
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar - File Tree */}
        {showSidebar && (
          <>
            <ResizablePanel defaultSize={15} minSize={10} maxSize={25}>
              <FileTree
                files={sampleFiles}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
              />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {/* Left Panel - Chat/Code */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'code')} className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <TabsList>
                <TabsTrigger value="chat">
                  <Sparkles className="size-4 mr-2" />
                  AI Chat
                </TabsTrigger>
                <TabsTrigger value="code">
                  <Code className="size-4 mr-2" />
                  Code
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chat" className="flex-1 m-0">
              <ChatInterface onCodeGenerated={setCode} />
            </TabsContent>

            <TabsContent value="code" className="flex-1 m-0">
              <CodeEditor
                value={code}
                language="typescript"
                onChange={setCode}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right Panel - Preview */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="h-full flex flex-col">
            <div className="flex items-center px-4 py-2 border-b">
              <Eye className="size-4 mr-2" />
              <span className="font-medium">Preview</span>
            </div>
            <div className="flex-1">
              <PreviewPane code={code} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

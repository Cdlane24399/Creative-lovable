'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Smartphone, Monitor, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface PreviewPaneProps {
  code: string;
}

type ViewportSize = 'mobile' | 'tablet' | 'desktop';

const viewportSizes: Record<ViewportSize, { width: string; icon: React.ReactNode }> = {
  mobile: { width: '375px', icon: <Smartphone className="size-4" /> },
  tablet: { width: '768px', icon: <Tablet className="size-4" /> },
  desktop: { width: '100%', icon: <Monitor className="size-4" /> },
};

export function PreviewPane({ code }: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    updatePreview();
  }, [code]);

  const updatePreview = async () => {
    if (!iframeRef.current) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const html = generatePreviewHtml(code);
      
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      iframeRef.current.src = url;
      iframeRef.current.onload = () => {
        setIsLoading(false);
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setIsLoading(false);
    }
  };

  const generatePreviewHtml = (appCode: string): string => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@19/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@19/umd/react-dom.development.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react">
    ${appCode}
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App || Page));
  </script>
</body>
</html>`;
  };

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-2">
          {Object.entries(viewportSizes).map(([key, { icon }]) => (
            <Button
              key={key}
              variant={viewport === key ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewport(key as ViewportSize)}
            >
              {icon}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={updatePreview} disabled={isLoading}>
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon">
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex-1 flex items-start justify-center p-4 overflow-auto">
        {error ? (
          <div className="text-destructive text-center p-8">
            <p className="font-medium">Preview Error</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div
            className="bg-white dark:bg-zinc-950 rounded-lg shadow-lg overflow-hidden transition-all duration-300"
            style={{
              width: viewportSizes[viewport].width,
              maxWidth: '100%',
              height: viewport === 'desktop' ? '100%' : '667px',
            }}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <Spinner className="size-8" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  );
}

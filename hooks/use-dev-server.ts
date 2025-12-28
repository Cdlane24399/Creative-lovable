"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export interface DevServerStatus {
  isRunning: boolean
  port: number | null
  url: string | null
  logs: string[]
  errors: string[]
  lastChecked: string
}

export interface UseDevServerOptions {
  projectId: string | null
  projectName: string | null
  /** Sandbox ID from createWebsite tool (optional, for reliable reconnection) */
  sandboxId?: string | null
  /** Whether to actively poll for status (default: false until triggered) */
  enabled?: boolean
  /** Polling interval in ms when server is starting (default: 2000) */
  startingPollInterval?: number
  /** Polling interval in ms when server is running (default: 10000) */
  runningPollInterval?: number
  /** Callback when errors are detected */
  onError?: (errors: string[]) => void
  /** Callback when server becomes ready */
  onReady?: (url: string) => void
  /** Callback when server status changes */
  onStatusChange?: (status: DevServerStatus) => void
}

export interface UseDevServerReturn {
  status: DevServerStatus
  isStarting: boolean
  isStopping: boolean
  error: string | null
  /** Start the dev server */
  start: (forceRestart?: boolean) => Promise<void>
  /** Stop the dev server */
  stop: () => Promise<void>
  /** Restart the dev server */
  restart: () => Promise<void>
  /** Refresh status manually */
  refresh: () => Promise<void>
  /** Get full logs */
  getLogs: () => Promise<string[]>
}

const DEFAULT_STATUS: DevServerStatus = {
  isRunning: false,
  port: null,
  url: null,
  logs: [],
  errors: [],
  lastChecked: new Date().toISOString(),
}

export function useDevServer({
  projectId,
  projectName,
  sandboxId,
  enabled = false,
  startingPollInterval = 2000,
  runningPollInterval = 10000,
  onError,
  onReady,
  onStatusChange,
}: UseDevServerOptions): UseDevServerReturn {
  // Log props on each render for debugging
  console.log("[useDevServer] Hook render:", { projectId, projectName, sandboxId, enabled })

  const [status, setStatus] = useState<DevServerStatus>(DEFAULT_STATUS)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Track polling state
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const lastErrorsRef = useRef<string[]>([])
  const wasRunningRef = useRef(false)
  const pollActiveRef = useRef(false)
  const consecutiveFailuresRef = useRef(0)
  const onReadyCalledRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastSuccessfulPollRef = useRef<number>(Date.now())
  const retryCountRef = useRef(0)

  // Clear polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    pollActiveRef.current = false
    
    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Fetch current status with abort control and retry logic
  const fetchStatus = useCallback(async (): Promise<DevServerStatus | null> => {
    if (!projectId) return null

    // Create new abort controller for this request
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await fetch(`/api/sandbox/${projectId}/dev-server`, {
        cache: "no-store",
        signal: abortController.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      })
      
      if (!response.ok) {
        consecutiveFailuresRef.current++
        
        // Exponential backoff for retries
        if (consecutiveFailuresRef.current > 5) {
          const backoffMs = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000)
          console.warn(`[useDevServer] Too many failures (${consecutiveFailuresRef.current}), backing off for ${backoffMs}ms`)
          
          if (consecutiveFailuresRef.current > 10) {
            // Stop polling after too many failures
            console.error("[useDevServer] Stopping poll after 10 consecutive failures")
            stopPolling()
            setError("Unable to connect to dev server status endpoint")
          }
        }
        return null
      }
      
      consecutiveFailuresRef.current = 0
      retryCountRef.current = 0
      lastSuccessfulPollRef.current = Date.now()
      
      const data = await response.json()
      return data as DevServerStatus
    } catch (err) {
      // Don't count aborted requests as failures
      if (err instanceof Error && err.name === 'AbortError') {
        return null
      }
      
      consecutiveFailuresRef.current++
      retryCountRef.current++
      
      console.warn(`[useDevServer] Fetch error (${consecutiveFailuresRef.current} consecutive):`, err)
      return null
    }
  }, [projectId, stopPolling])

  // Update status and trigger callbacks
  const updateStatus = useCallback((newStatus: DevServerStatus) => {
    setStatus(newStatus)
    onStatusChange?.(newStatus)

    // Check for new errors
    if (newStatus.errors.length > 0) {
      const newErrors = newStatus.errors.filter(
        e => !lastErrorsRef.current.includes(e)
      )
      if (newErrors.length > 0) {
        lastErrorsRef.current = newStatus.errors
        onError?.(newErrors)
      }
    }

    // Check if server just became ready - only call onReady once
    if (newStatus.isRunning && !wasRunningRef.current && newStatus.url) {
      if (!onReadyCalledRef.current) {
        console.log("[useDevServer] Server became ready, calling onReady with URL:", newStatus.url)
        onReadyCalledRef.current = true
        onReady?.(newStatus.url)
      }
      // Slow down polling now that server is running
      setIsStarting(false)
    }
    
    // Reset onReady flag if server stops
    if (!newStatus.isRunning && wasRunningRef.current) {
      onReadyCalledRef.current = false
    }
    
    wasRunningRef.current = newStatus.isRunning
  }, [onError, onReady, onStatusChange])

  // Refresh status (public method)
  const refresh = useCallback(async () => {
    const newStatus = await fetchStatus()
    if (newStatus) {
      updateStatus(newStatus)
    }
  }, [fetchStatus, updateStatus])

  // Start polling with adaptive interval
  const startPolling = useCallback((interval: number) => {
    stopPolling()
    pollActiveRef.current = true
    
    console.log("[useDevServer] Starting poll with interval:", interval)
    
    // Immediate fetch
    refresh()
    
    // Set up interval
    pollRef.current = setInterval(() => {
      if (!pollActiveRef.current) return
      
      // Check if we've exceeded reasonable poll timeout without success
      const timeSinceSuccess = Date.now() - lastSuccessfulPollRef.current
      if (timeSinceSuccess > 60000) { // 1 minute
        console.warn("[useDevServer] No successful poll in 60 seconds, may have connection issues")
      }
      
      refresh()
    }, interval)
  }, [stopPolling, refresh])

  // Start the dev server
  const start = useCallback(async (forceRestart = false) => {
    if (!projectId || !projectName) {
      console.error("[useDevServer] Missing projectId or projectName:", { projectId, projectName })
      setError("No project to start")
      return
    }

    console.log("[useDevServer] Starting dev server:", { projectId, projectName, sandboxId, forceRestart })
    setIsStarting(true)
    setError(null)
    consecutiveFailuresRef.current = 0
    retryCountRef.current = 0
    onReadyCalledRef.current = false

    try {
      console.log("[useDevServer] Making POST request to:", `/api/sandbox/${projectId}/dev-server`)
      console.log("[useDevServer] Request body:", { projectName, sandboxId, forceRestart })
      
      const response = await fetch(`/api/sandbox/${projectId}/dev-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, sandboxId, forceRestart }),
      })

      const data = await response.json()
      console.log("[useDevServer] Response received:", { status: response.status, data, url: data?.url })

      if (!response.ok) {
        throw new Error(data.error || "Failed to start dev server")
      }

      // Update status with new URL
      const newStatus: DevServerStatus = {
        ...status,
        isRunning: true,
        url: data.url,
        port: data.port,
        lastChecked: new Date().toISOString(),
      }
      updateStatus(newStatus)

      // Server is ready - stop polling immediately
      stopPolling()

      if (data.url) {
        console.log("[useDevServer] Server ready, calling onReady with URL:", data.url)
        console.log("[useDevServer] onReady callback exists:", typeof onReady === 'function')
        
        if (!onReadyCalledRef.current) {
          onReadyCalledRef.current = true
          onReady?.(data.url)
        }
        console.log("[useDevServer] onReady callback invoked successfully")
      } else {
        console.warn("[useDevServer] Server started but no URL in response:", data)
      }
    } catch (err) {
      console.error("[useDevServer] Error starting server:", err)
      const errorMsg = err instanceof Error ? err.message : "Failed to start dev server"
      setError(errorMsg)
      stopPolling()
    } finally {
      setIsStarting(false)
    }
  }, [projectId, projectName, sandboxId, status, stopPolling, updateStatus, onReady])

  // Stop the dev server
  const stop = useCallback(async () => {
    if (!projectId) return

    setIsStopping(true)
    setError(null)
    stopPolling()
    onReadyCalledRef.current = false

    try {
      const response = await fetch(`/api/sandbox/${projectId}/dev-server`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to stop dev server")
      }

      setStatus(prev => ({
        ...prev,
        isRunning: false,
        url: null,
        port: null,
        lastChecked: new Date().toISOString(),
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to stop dev server"
      setError(errorMsg)
    } finally {
      setIsStopping(false)
    }
  }, [projectId, stopPolling])

  // Restart the dev server
  const restart = useCallback(async () => {
    onReadyCalledRef.current = false
    await start(true)
  }, [start])

  // Get full logs
  const getLogs = useCallback(async (): Promise<string[]> => {
    const newStatus = await fetchStatus()
    return newStatus?.logs || []
  }, [fetchStatus])

  // Effect: Only poll when enabled and projectId exists
  useEffect(() => {
    if (!projectId || !enabled) {
      stopPolling()
      if (!projectId) {
        setStatus(DEFAULT_STATUS)
      }
      return
    }

    // Start polling with running interval (assume server might be running)
    startPolling(runningPollInterval)

    return () => {
      stopPolling()
    }
  }, [projectId, enabled, runningPollInterval, startPolling, stopPolling])

  // Reset refs when project changes
  useEffect(() => {
    lastErrorsRef.current = []
    wasRunningRef.current = false
    consecutiveFailuresRef.current = 0
    retryCountRef.current = 0
    onReadyCalledRef.current = false
    lastSuccessfulPollRef.current = Date.now()
  }, [projectId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  return {
    status,
    isStarting,
    isStopping,
    error,
    start,
    stop,
    restart,
    refresh,
    getLogs,
  }
}

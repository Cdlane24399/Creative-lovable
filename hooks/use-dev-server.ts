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
  /** @deprecated Use runningPollInterval - starting interval now uses exponential backoff */
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
  // Minimal logging - only log on first render
  const hasLoggedRef = useRef(false)
  if (!hasLoggedRef.current && projectId) {
    console.log("[useDevServer] Initialized for project:", projectId)
    hasLoggedRef.current = true
  }

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
  const backoffIntervalRef = useRef<number>(2000)
  const lastStatusHashRef = useRef<string>("")

  // Clear polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
    pollActiveRef.current = false
    backoffIntervalRef.current = 2000

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
        
        // Only log after multiple failures
        if (consecutiveFailuresRef.current === 5) {
          console.warn(`[useDevServer] Multiple connection failures (${consecutiveFailuresRef.current})`)
        }
        
        // Stop polling after too many failures
        if (consecutiveFailuresRef.current > 10) {
          console.error("[useDevServer] Stopping poll after 10 consecutive failures")
          stopPolling()
          setError("Unable to connect to dev server status endpoint")
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
      
      // Only log errors after multiple failures
      if (consecutiveFailuresRef.current > 3) {
        console.warn(`[useDevServer] Connection error (${consecutiveFailuresRef.current} consecutive)`)
      }
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
        console.log("[useDevServer] Server ready:", newStatus.url)
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

  // Hash status for change detection
  const hashStatus = useCallback((status: DevServerStatus): string => {
    return `${status.isRunning}-${status.url}-${status.errors.length}`
  }, [])

  // Refresh status (public method)
  const refresh = useCallback(async () => {
    const newStatus = await fetchStatus()
    if (newStatus) {
      updateStatus(newStatus)
    }
  }, [fetchStatus, updateStatus])

  // Start polling with exponential backoff
  const startPolling = useCallback((baseInterval: number) => {
    stopPolling()
    pollActiveRef.current = true
    backoffIntervalRef.current = baseInterval

    const poll = async () => {
      if (!pollActiveRef.current) return

      const newStatus = await fetchStatus()
      if (newStatus) {
        const newHash = hashStatus(newStatus)

        // Reset backoff if status changed
        if (newHash !== lastStatusHashRef.current) {
          backoffIntervalRef.current = baseInterval
          lastStatusHashRef.current = newHash
        } else {
          // Increase backoff when no changes (max 10 seconds)
          backoffIntervalRef.current = Math.min(
            backoffIntervalRef.current * 1.5,
            10000
          )
        }

        updateStatus(newStatus)
      }

      // Schedule next poll with current backoff
      if (pollActiveRef.current) {
        pollRef.current = setTimeout(poll, backoffIntervalRef.current)
      }
    }

    // Start polling
    poll()
  }, [stopPolling, fetchStatus, updateStatus, hashStatus])

  // Start the dev server
  const start = useCallback(async (forceRestart = false) => {
    if (!projectId || !projectName) {
      console.error("[useDevServer] Missing projectId or projectName")
      setError("No project to start")
      return
    }

    console.log("[useDevServer] Starting dev server:", projectName)
    setIsStarting(true)
    setError(null)
    consecutiveFailuresRef.current = 0
    retryCountRef.current = 0
    onReadyCalledRef.current = false

    try {
      const response = await fetch(`/api/sandbox/${projectId}/dev-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, sandboxId, forceRestart }),
      })

      const data = await response.json()

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

      if (data.url) {
        // Server is ready with URL - stop polling
        stopPolling()
        if (!onReadyCalledRef.current) {
          onReadyCalledRef.current = true
          onReady?.(data.url)
        }
      } else {
        // No URL yet - start polling to wait for server
        console.log("[useDevServer] No URL in response, starting polling...")
        startPolling(2000)
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

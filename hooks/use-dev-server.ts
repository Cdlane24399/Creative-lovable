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
  enabled = false,
  startingPollInterval = 2000,
  runningPollInterval = 10000,
  onError,
  onReady,
  onStatusChange,
}: UseDevServerOptions): UseDevServerReturn {
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

  // Clear polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    pollActiveRef.current = false
  }, [])

  // Fetch current status (silent - doesn't log)
  const fetchStatus = useCallback(async (): Promise<DevServerStatus | null> => {
    if (!projectId) return null

    try {
      const response = await fetch(`/api/sandbox/${projectId}/dev-server`, {
        // Prevent caching
        cache: "no-store",
      })
      if (!response.ok) {
        consecutiveFailuresRef.current++
        if (consecutiveFailuresRef.current > 5) {
          // Too many failures, stop polling
          stopPolling()
        }
        return null
      }
      consecutiveFailuresRef.current = 0
      const data = await response.json()
      return data as DevServerStatus
    } catch {
      consecutiveFailuresRef.current++
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

    // Check if server just became ready
    if (newStatus.isRunning && !wasRunningRef.current && newStatus.url) {
      onReady?.(newStatus.url)
      // Slow down polling now that server is running
      setIsStarting(false)
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
    
    // Immediate fetch
    refresh()
    
    // Set up interval
    pollRef.current = setInterval(() => {
      if (!pollActiveRef.current) return
      refresh()
    }, interval)
  }, [stopPolling, refresh])

  // Start the dev server
  const start = useCallback(async (forceRestart = false) => {
    if (!projectId || !projectName) {
      setError("No project to start")
      return
    }

    setIsStarting(true)
    setError(null)
    consecutiveFailuresRef.current = 0

    // Start fast polling while server is starting
    startPolling(startingPollInterval)

    try {
      const response = await fetch(`/api/sandbox/${projectId}/dev-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, forceRestart }),
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

      // Switch to slower polling now that server is running
      startPolling(runningPollInterval)

      if (data.url) {
        onReady?.(data.url)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to start dev server"
      setError(errorMsg)
      stopPolling()
    } finally {
      setIsStarting(false)
    }
  }, [projectId, projectName, status, startingPollInterval, runningPollInterval, startPolling, stopPolling, updateStatus, onReady])

  // Stop the dev server
  const stop = useCallback(async () => {
    if (!projectId) return

    setIsStopping(true)
    setError(null)
    stopPolling()

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

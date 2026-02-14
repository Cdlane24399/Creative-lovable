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
  /** Sandbox ID for reliable reconnection (optional) */
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

type JsonResponseParseResult<T> = {
  data: T | null
  rawText: string
}

const createDefaultStatus = (): DevServerStatus => ({
  isRunning: false,
  port: null,
  url: null,
  logs: [],
  errors: [],
  lastChecked: new Date().toISOString(),
})

async function parseJsonResponseSafe<T>(response: Response): Promise<JsonResponseParseResult<T>> {
  const rawText = await response.text()
  if (!rawText) {
    return { data: null, rawText: "" }
  }

  try {
    return { data: JSON.parse(rawText) as T, rawText }
  } catch {
    return { data: null, rawText }
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const error = (payload as { error?: unknown }).error
  return typeof error === "string" ? error : null
}

function buildResponseErrorMessage(
  fallback: string,
  status: number,
  payload: unknown,
  rawText: string,
): string {
  const payloadError = extractErrorMessage(payload)
  if (payloadError) return payloadError

  const compactText = rawText.trim().replace(/\s+/g, " ")
  if (compactText) {
    return compactText.slice(0, 240)
  }

  return `${fallback} (HTTP ${status})`
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
  const [status, setStatus] = useState<DevServerStatus>(() => createDefaultStatus())
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const encodedProjectId = projectId ? encodeURIComponent(projectId) : null

  // Track polling state
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const lastErrorsRef = useRef<string[]>([])
  const wasRunningRef = useRef(false)
  const pollActiveRef = useRef(false)
  const consecutiveFailuresRef = useRef(0)
  const onReadyCalledRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const backoffIntervalRef = useRef<number>(2000)
  const lastStatusHashRef = useRef<string>("")
  const startingPollIntervalRef = useRef(startingPollInterval)
  const loggedProjectIdRef = useRef<string | null>(null)
  const callbacksRef = useRef({
    onError,
    onReady,
    onStatusChange,
  })

  useEffect(() => {
    callbacksRef.current = {
      onError,
      onReady,
      onStatusChange,
    }
  }, [onError, onReady, onStatusChange])

  useEffect(() => {
    startingPollIntervalRef.current = startingPollInterval
  }, [startingPollInterval])

  useEffect(() => {
    if (!projectId) {
      loggedProjectIdRef.current = null
      return
    }

    if (loggedProjectIdRef.current !== projectId) {
      console.log("[useDevServer] Initialized for project:", projectId)
      loggedProjectIdRef.current = projectId
    }
  }, [projectId])

  // Clear polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
    pollActiveRef.current = false
    backoffIntervalRef.current = startingPollIntervalRef.current

    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Fetch current status with abort control and retry logic
  const fetchStatus = useCallback(async (): Promise<DevServerStatus | null> => {
    if (!encodedProjectId) return null

    // Create new abort controller for this request
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await fetch(`/api/sandbox/${encodedProjectId}/dev-server`, {
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
      const { data } = await parseJsonResponseSafe<DevServerStatus>(response)
      if (!data) {
        consecutiveFailuresRef.current++
        if (consecutiveFailuresRef.current > 3) {
          console.warn(`[useDevServer] Invalid JSON status response (${consecutiveFailuresRef.current} consecutive)`)
        }
        return null
      }

      consecutiveFailuresRef.current = 0
      return data
    } catch (err) {
      // Don't count aborted requests as failures
      if (err instanceof Error && err.name === 'AbortError') {
        return null
      }

      consecutiveFailuresRef.current++

      // Only log errors after multiple failures
      if (consecutiveFailuresRef.current > 3) {
        console.warn(`[useDevServer] Connection error (${consecutiveFailuresRef.current} consecutive)`)
      }
      return null
    }
  }, [encodedProjectId, stopPolling])

  // Update status and trigger callbacks
  const updateStatus = useCallback((nextStatus: DevServerStatus | ((prev: DevServerStatus) => DevServerStatus)) => {
    setStatus((prevStatus) => {
      const newStatus = typeof nextStatus === "function" ? nextStatus(prevStatus) : nextStatus
      callbacksRef.current.onStatusChange?.(newStatus)

      // Check for new errors
      if (newStatus.errors.length > 0) {
        const newErrors = newStatus.errors.filter(
          (e) => !lastErrorsRef.current.includes(e)
        )
        if (newErrors.length > 0) {
          lastErrorsRef.current = newStatus.errors
          callbacksRef.current.onError?.(newErrors)
        }
      }

      // Check if server just became ready - only call onReady once
      if (newStatus.isRunning && !wasRunningRef.current && newStatus.url) {
        if (!onReadyCalledRef.current) {
          console.log("[useDevServer] Server ready:", newStatus.url)
          onReadyCalledRef.current = true
          callbacksRef.current.onReady?.(newStatus.url)
        }
        // Slow down polling now that server is running
        setIsStarting(false)
      }

      // Reset onReady flag if server stops
      if (!newStatus.isRunning && wasRunningRef.current) {
        onReadyCalledRef.current = false
      }

      wasRunningRef.current = newStatus.isRunning
      return newStatus
    })
  }, [])

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

  // Start polling with bounded exponential backoff
  const startPolling = useCallback((baseInterval: number, maxInterval: number) => {
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
          // Increase backoff when no changes (bounded)
          backoffIntervalRef.current = Math.min(
            Math.max(baseInterval, Math.round(backoffIntervalRef.current * 1.35)),
            maxInterval,
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
    if (!encodedProjectId || !projectName) {
      console.error("[useDevServer] Missing projectId or projectName")
      setError("No project to start")
      return
    }

    console.log("[useDevServer] Starting dev server:", projectName)
    setIsStarting(true)
    setError(null)
    consecutiveFailuresRef.current = 0
    onReadyCalledRef.current = false

    try {
      const response = await fetch(`/api/sandbox/${encodedProjectId}/dev-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, sandboxId, forceRestart }),
      })

      const { data, rawText } = await parseJsonResponseSafe<{
        error?: string
        url?: string | null
        port?: number | null
      }>(response)

      if (!response.ok) {
        throw new Error(
          buildResponseErrorMessage(
            "Failed to start dev server",
            response.status,
            data,
            rawText,
          ),
        )
      }

      if (!data || typeof data !== "object") {
        throw new Error("Invalid response from dev server start endpoint")
      }

      // Update status with new URL
      updateStatus((prevStatus) => ({
        ...prevStatus,
        isRunning: true,
        url: typeof data.url === "string" ? data.url : null,
        port: typeof data.port === "number" ? data.port : null,
        lastChecked: new Date().toISOString(),
      }))

      if (typeof data.url === "string" && data.url) {
        // Server is ready with URL - stop polling
        stopPolling()
      } else {
        // No URL yet - start polling to wait for server
        console.log("[useDevServer] No URL in response, starting polling...")
        startPolling(Math.min(startingPollInterval, 750), 4000)
      }
    } catch (err) {
      console.error("[useDevServer] Error starting server:", err)
      const errorMsg = err instanceof Error ? err.message : "Failed to start dev server"
      setError(errorMsg)
      stopPolling()
    } finally {
      setIsStarting(false)
    }
  }, [encodedProjectId, projectName, sandboxId, stopPolling, updateStatus, startPolling, startingPollInterval])

  // Stop the dev server
  const stop = useCallback(async () => {
    if (!encodedProjectId) return

    setIsStopping(true)
    setError(null)
    stopPolling()
    onReadyCalledRef.current = false

    try {
      const response = await fetch(`/api/sandbox/${encodedProjectId}/dev-server`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const { data, rawText } = await parseJsonResponseSafe<{ error?: string }>(response)
        throw new Error(
          buildResponseErrorMessage(
            "Failed to stop dev server",
            response.status,
            data,
            rawText,
          ),
        )
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
  }, [encodedProjectId, stopPolling])

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
        setStatus(createDefaultStatus())
      }
      return
    }

    // Start polling with running interval (assume server might be running)
    startPolling(Math.min(runningPollInterval, 2000), runningPollInterval)

    return () => {
      stopPolling()
    }
  }, [projectId, enabled, runningPollInterval, startPolling, stopPolling])

  // Reset refs when project changes
  useEffect(() => {
    lastErrorsRef.current = []
    wasRunningRef.current = false
    consecutiveFailuresRef.current = 0
    onReadyCalledRef.current = false
    lastStatusHashRef.current = ""
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

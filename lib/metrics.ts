/**
 * Performance monitoring and metrics for the application
 */

interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  tags?: Record<string, string>
}

interface RequestMetric {
  method: string
  path: string
  statusCode: number
  duration: number
  timestamp: number
  userAgent?: string
}

class MetricsCollector {
  private metrics: PerformanceMetric[] = []
  private requestMetrics: RequestMetric[] = []
  private readonly maxMetrics = 1000

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>) {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags,
    })

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }
  }

  /**
   * Record an API request metric
   */
  recordRequest(method: string, path: string, statusCode: number, duration: number, userAgent?: string) {
    this.requestMetrics.push({
      method,
      path,
      statusCode,
      duration,
      timestamp: Date.now(),
      userAgent,
    })

    // Keep only recent request metrics
    if (this.requestMetrics.length > this.maxMetrics) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetrics)
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    const now = Date.now()
    const lastHour = now - (60 * 60 * 1000)

    const recentMetrics = this.metrics.filter(m => m.timestamp > lastHour)
    const recentRequests = this.requestMetrics.filter(r => r.timestamp > lastHour)

    // Calculate averages
    const avgResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length
      : 0

    // Calculate error rate
    const errorRequests = recentRequests.filter(r => r.statusCode >= 400)
    const errorRate = recentRequests.length > 0 ? errorRequests.length / recentRequests.length : 0

    // Calculate request rate per minute
    const requestsPerMinute = recentRequests.length / 60

    return {
      totalMetrics: this.metrics.length,
      totalRequests: this.requestMetrics.length,
      recentMetrics: recentMetrics.length,
      recentRequests: recentRequests.length,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      errorRate: Math.round(errorRate * 10000) / 100, // percentage with 2 decimal places
      requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
      statusCodeDistribution: this.getStatusCodeDistribution(recentRequests),
    }
  }

  /**
   * Get status code distribution
   */
  private getStatusCodeDistribution(requests: RequestMetric[]) {
    const distribution: Record<number, number> = {}

    requests.forEach(req => {
      distribution[req.statusCode] = (distribution[req.statusCode] || 0) + 1
    })

    return distribution
  }

  /**
   * Get slow requests (response time > threshold)
   */
  getSlowRequests(thresholdMs: number = 1000) {
    return this.requestMetrics
      .filter(r => r.duration > thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10) // Top 10 slowest
  }

  /**
   * Clear old metrics (cleanup)
   */
  clearOldMetrics(olderThanMs: number = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = Date.now() - olderThanMs
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff)
    this.requestMetrics = this.requestMetrics.filter(r => r.timestamp > cutoff)
  }
}

// Global metrics collector
export const metrics = new MetricsCollector()

/**
 * Middleware to record API request metrics
 */
export function withMetrics<T extends any[]>(
  handler: (...args: T) => Promise<any> | any
) {
  return async (...args: T) => {
    const startTime = Date.now()
    const request = args[0] as Request

    try {
      const result = await handler(...args)
      const duration = Date.now() - startTime

      // Record the request
      metrics.recordRequest(
        request.method,
        new URL(request.url).pathname,
        result.status || 200,
        duration,
        request.headers.get('user-agent') || undefined
      )

      // Record response time metric
      metrics.recordMetric('api.response_time', duration, {
        method: request.method,
        path: new URL(request.url).pathname,
        status: result.status?.toString() || '200',
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Record failed request
      metrics.recordRequest(
        request.method,
        new URL(request.url).pathname,
        500,
        duration,
        request.headers.get('user-agent') || undefined
      )

      // Record error metric
      metrics.recordMetric('api.error', 1, {
        method: request.method,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.name : 'UnknownError',
      })

      throw error
    }
  }
}

/**
 * Performance monitoring utilities
 */
export const performanceMonitor = {
  /**
   * Time a function execution
   */
  async timeFunction<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const start = Date.now()
    try {
      const result = await fn()
      const duration = Date.now() - start
      metrics.recordMetric(`function.${name}`, duration, tags)
      return result
    } catch (error) {
      const duration = Date.now() - start
      metrics.recordMetric(`function.${name}.error`, duration, {
        ...tags,
        error: error instanceof Error ? error.name : 'UnknownError',
      })
      throw error
    }
  },

  /**
   * Time database operations
   */
  async timeDatabase<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.timeFunction(`db.${operation}`, fn, { type: 'database' })
  },

  /**
   * Time external API calls
   */
  async timeExternalAPI<T>(
    service: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.timeFunction(`external.${service}`, fn, { type: 'external_api' })
  },
}

// Periodic cleanup
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    metrics.clearOldMetrics()
  }, 60 * 60 * 1000) // Clean up every hour
}
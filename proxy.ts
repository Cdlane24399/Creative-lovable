import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`
}

export async function proxy(request: NextRequest) {
  // Generate or use existing request ID for distributed tracing
  const requestId = request.headers.get('x-request-id') ?? generateRequestId()
  
  // Note: NextRequest headers are immutable, so we pass the requestId to updateSession
  // and set it on the response
  const response = await updateSession(request)
  
  // Add request ID to response headers for client-side correlation and tracing
  response.headers.set('x-request-id', requestId)
  
  // Add timing header for performance monitoring
  response.headers.set('x-response-time', Date.now().toString())
  
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Placeholder proxy for future authentication middleware
// When auth is implemented, this can be used to protect routes
export async function proxy(request: NextRequest) {
  // For now, just pass through all requests
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static assets (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

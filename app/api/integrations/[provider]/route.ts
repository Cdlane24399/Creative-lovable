import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const { provider } = await params
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")

    // 1. If no code, initiate OAuth flow
    if (!code) {
        let redirectUrl = ""
        const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/${provider}`

        if (provider === "github") {
            redirectUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user`
        } else if (provider === "vercel") {
            redirectUrl = `https://vercel.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`
        } else {
            return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
        }

        return NextResponse.redirect(redirectUrl)
    }

    // 2. If code exists, exchange for token and save to DB
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // TODO: Implement OAuth token exchange
        // - Exchange code for access token via provider's token endpoint
        // - Encrypt token before storing (see PRODUCTION_READINESS_PLAN.md Phase 1.2)
        // - Save encrypted token to integrations table
        // For now, redirect with placeholder success

        // Redirect back to settings
        return NextResponse.redirect(new URL("/settings", request.url))

    } catch (error) {
        console.error("Integration error:", error)
        return NextResponse.redirect(new URL("/settings?error=integration_failed", request.url))
    }
}

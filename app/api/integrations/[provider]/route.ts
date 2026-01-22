import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encrypt } from "@/lib/crypto/encryption"
import { getIntegrationRepository } from "@/lib/db/repositories"

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

        if (!clientId) {
            console.error(`Missing Client ID for ${provider}`)
            return NextResponse.json({ error: "Configuration error" }, { status: 500 })
        }

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

        const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
        const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/${provider}`

        if (!clientId || !clientSecret) {
            console.error(`Missing config for ${provider}`)
            return NextResponse.redirect(new URL("/settings?error=config_missing", request.url))
        }

        let tokenData
        if (provider === "github") {
            tokenData = await exchangeGitHubToken(code, clientId, clientSecret, redirectUri)
        } else if (provider === "vercel") {
            tokenData = await exchangeVercelToken(code, clientId, clientSecret, redirectUri)
        } else {
            return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
        }

        // Save encrypted token to integrations table
        const integrationRepo = getIntegrationRepository()

        await integrationRepo.upsertIntegration({
            user_id: user.id,
            provider,
            access_token: encrypt(tokenData.access_token),
            refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
            scope: tokenData.scope,
            expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined
        })

        // Redirect back to settings with success parameter
        return NextResponse.redirect(new URL("/settings?integration_success=true", request.url))

    } catch (error) {
        console.error("Integration error:", error)
        return NextResponse.redirect(new URL("/settings?error=integration_failed", request.url))
    }
}

// Helper to exchange code for GitHub token
async function exchangeGitHubToken(code: string, clientId: string, clientSecret: string, redirectUri: string) {
    const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
        }),
    })

    if (!response.ok) {
        throw new Error(`GitHub token exchange failed: ${response.statusText}`)
    }

    const data = await response.json()
    if (data.error) {
        throw new Error(`GitHub token exchange error: ${data.error_description || data.error}`)
    }

    return {
        access_token: data.access_token,
        scope: data.scope,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
    }
}

// Helper to exchange code for Vercel token
async function exchangeVercelToken(code: string, clientId: string, clientSecret: string, redirectUri: string) {
    const params = new URLSearchParams()
    params.append("client_id", clientId)
    params.append("client_secret", clientSecret)
    params.append("code", code)
    params.append("redirect_uri", redirectUri)

    const response = await fetch("https://api.vercel.com/v2/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
    })

    if (!response.ok) {
        throw new Error(`Vercel token exchange failed: ${response.statusText}`)
    }

    const data = await response.json()

    return {
        access_token: data.access_token,
        // Vercel token typically doesn't have a scope in the response like GitHub
        scope: "active",
        refresh_token: undefined, // Vercel tokens are long-lived or handled differently
        expires_in: undefined,
    }
}

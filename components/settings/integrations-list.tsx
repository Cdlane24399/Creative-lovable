"use client"

import { IntegrationCard } from "./integration-card"
import { Github } from "lucide-react"

export function IntegrationsList() {
    const handleConnect = async (provider: string) => {
        // Simulate connection
        window.location.href = `/api/integrations/${provider}/connect`
    }

    const handleDisconnect = async (provider: string) => {
        // Simulate disconnection
        console.log(`Disconnecting ${provider}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return (
        <div className="space-y-4">
            <IntegrationCard
                provider="github"
                name="GitHub"
                description="Connect your GitHub account to sync repositories and deploy projects."
                icon={<Github className="w-6 h-6" />}
                isConnected={false}
                onConnect={() => handleConnect("github")}
                onDisconnect={() => handleDisconnect("github")}
            />
            <IntegrationCard
                provider="vercel"
                name="Vercel"
                description="Connect your Vercel account to deploy your projects to the edge."
                icon={
                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M24 22.525H0l12-21.05 12 21.05z" />
                    </svg>
                }
                isConnected={false}
                onConnect={() => handleConnect("vercel")}
                onDisconnect={() => handleDisconnect("vercel")}
            />
        </div>
    )
}

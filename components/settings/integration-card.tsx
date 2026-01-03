"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface IntegrationCardProps {
    provider: "github" | "vercel"
    name: string
    description: string
    icon: React.ReactNode
    isConnected: boolean
    lastSyncedAt?: string
    onConnect: () => Promise<void>
    onDisconnect: () => Promise<void>
}

export function IntegrationCard({
    provider,
    name,
    description,
    icon,
    isConnected,
    lastSyncedAt,
    onConnect,
    onDisconnect
}: IntegrationCardProps) {
    const [loading, setLoading] = useState(false)

    const handleAction = async () => {
        setLoading(true)
        try {
            if (isConnected) {
                await onDisconnect()
            } else {
                await onConnect()
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className={cn(
            "bg-zinc-900 border-zinc-800 transition-all duration-300",
            isConnected && "border-emerald-900/50 bg-emerald-950/10"
        )}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800 text-zinc-100">
                        {icon}
                    </div>
                    <div>
                        <CardTitle className="text-lg font-medium text-zinc-100">{name}</CardTitle>
                        <CardDescription className="text-zinc-400">{description}</CardDescription>
                    </div>
                </div>
                <Badge
                    variant="outline"
                    className={cn(
                        "ml-auto",
                        isConnected
                            ? "bg-emerald-950/30 text-emerald-400 border-emerald-800"
                            : "bg-zinc-900 text-zinc-500 border-zinc-800"
                    )}
                >
                    {isConnected ? (
                        <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                        </span>
                    ) : (
                        <span className="flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Disconnected
                        </span>
                    )}
                </Badge>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between pt-4">
                    <div className="text-xs text-zinc-500">
                        {isConnected && lastSyncedAt && `Last synced: ${lastSyncedAt}`}
                    </div>
                    <Button
                        variant={isConnected ? "outline" : "default"}
                        size="sm"
                        onClick={handleAction}
                        disabled={loading}
                        className={cn(
                            isConnected
                                ? "border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 text-zinc-300"
                                : "bg-white text-black hover:bg-zinc-200"
                        )}
                    >
                        {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {isConnected ? "Disconnect" : "Connect"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

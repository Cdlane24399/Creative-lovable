"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ExternalLink, Github, MapPin, Calendar, Edit } from "lucide-react"
import Link from "next/link"

interface ProfileViewProps {
    username: string
    fullName: string
    avatarUrl?: string
    bio?: string
    website?: string
    joinDate?: string
    location?: string
}

export function ProfileView({
    username,
    fullName,
    avatarUrl,
    bio,
    website,
    joinDate = "January 2024",
    location = "San Francisco, CA"
}: ProfileViewProps) {
    return (
        <div className="max-w-4xl mx-auto p-8 text-zinc-100">
            <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-emerald-900/40 to-black"></div>
                <CardContent className="relative pt-0">
                    <div className="flex flex-col md:flex-row items-start gap-6 -mt-12">
                        <Avatar className="w-24 h-24 border-4 border-zinc-900 shadow-xl">
                            <AvatarImage src={avatarUrl} />
                            <AvatarFallback className="bg-zinc-800 text-2xl font-bold text-zinc-400">
                                {fullName[0]}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 mt-12 md:mt-14 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-2xl font-bold text-white">{fullName}</h1>
                                    <p className="text-zinc-400">@{username}</p>
                                </div>
                                <Link href="/settings">
                                    <Button variant="outline" size="sm" className="gap-2 border-zinc-700 hover:bg-zinc-800 hover:text-white">
                                        <Edit className="w-4 h-4" />
                                        Edit Profile
                                    </Button>
                                </Link>
                            </div>

                            {bio && <p className="text-zinc-300 max-w-2xl">{bio}</p>}

                            <div className="flex flex-wrap gap-4 pt-2 text-sm text-zinc-500">
                                {location && (
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-4 h-4" />
                                        {location}
                                    </div>
                                )}
                                {website && (
                                    <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-emerald-400">
                                        <ExternalLink className="w-4 h-4" />
                                        {new URL(website).hostname}
                                    </a>
                                )}
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    Joined {joinDate}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Activity / Projects placeholder */}
            <div className="mt-8 grid gap-6 md:grid-cols-2">
                <Card className="bg-zinc-900 border-zinc-800 p-6 min-h-[200px] flex items-center justify-center text-zinc-500">
                    Recent Activity Placeholder
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-6 min-h-[200px] flex items-center justify-center text-zinc-500">
                    Stats Placeholder
                </Card>
            </div>
        </div>
    )
}

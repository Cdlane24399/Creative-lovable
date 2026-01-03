"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface ProfileFormProps {
    initialData?: {
        username?: string
        full_name?: string
        bio?: string
        website?: string
    }
}

export function ProfileForm({ initialData }: ProfileFormProps) {
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000))
        setLoading(false)
    }

    return (
        <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your public profile details.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                            id="username"
                            defaultValue={initialData?.username}
                            className="bg-zinc-950 border-zinc-800 focus:border-emerald-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="full_name">Full Name</Label>
                        <Input
                            id="full_name"
                            defaultValue={initialData?.full_name}
                            className="bg-zinc-950 border-zinc-800 focus:border-emerald-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Textarea
                            id="bio"
                            defaultValue={initialData?.bio}
                            className="bg-zinc-950 border-zinc-800 min-h-[100px] focus:border-emerald-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                            id="website"
                            type="url"
                            defaultValue={initialData?.website}
                            className="bg-zinc-950 border-zinc-800 focus:border-emerald-500/50"
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}

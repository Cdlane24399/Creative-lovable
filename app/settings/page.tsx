"use client"

import dynamic from "next/dynamic"
import { ProfileForm } from "@/components/settings/profile-form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User, Link2, Monitor, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

const IntegrationsList = dynamic(
    () => import("@/components/settings/integrations-list").then((mod) => mod.IntegrationsList),
    { loading: () => <div className="h-36 rounded-xl border border-zinc-800 bg-zinc-900/50" /> }
)

export default function SettingsPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen bg-black text-zinc-100 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full hover:bg-zinc-800 text-zinc-400"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                        <p className="text-zinc-400">Manage your profile and integrations</p>
                    </div>
                </div>

                <Tabs defaultValue="profile" className="space-y-6">
                    <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
                        <TabsTrigger
                            value="profile"
                            className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400"
                        >
                            <User className="w-4 h-4 mr-2" />
                            Profile
                        </TabsTrigger>
                        <TabsTrigger
                            value="integrations"
                            className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400"
                        >
                            <Link2 className="w-4 h-4 mr-2" />
                            Integrations
                        </TabsTrigger>
                        <TabsTrigger
                            value="account"
                            className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400"
                        >
                            <Monitor className="w-4 h-4 mr-2" />
                            Account
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-4 outline-none">
                        <ProfileForm />
                    </TabsContent>

                    <TabsContent value="integrations" className="space-y-4 outline-none">
                        <IntegrationsList />
                    </TabsContent>

                    <TabsContent value="account" className="space-y-4 outline-none">
                        <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-900/50">
                            <h3 className="text-lg font-medium text-red-400 mb-2">Danger Zone</h3>
                            <p className="text-zinc-500 text-sm mb-4">
                                Permanently delete your account and all associated data. This action cannot be undone.
                            </p>
                            <Button variant="destructive" size="sm">Delete Account</Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

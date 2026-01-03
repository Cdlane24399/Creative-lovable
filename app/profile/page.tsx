import { ProfileView } from "@/components/profile/profile-view"

export default function ProfilePage() {
    // In a real app, fetch data server-side
    const mockUser = {
        username: "chris_dev",
        fullName: "Chris Developer",
        bio: "Full stack developer passionate about AI and clean UI. Building the future one component at a time.",
        website: "https://github.com/chris_dev",
        location: "New York, NY",
        joinDate: "December 2025"
    }

    return (
        <div className="min-h-screen bg-black">
            <ProfileView {...mockUser} />
        </div>
    )
}

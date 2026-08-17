import { LogOut, User } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function More() {
  const { profile, signOut } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">More</h1>

      <div className="bg-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-extrabold flex-shrink-0">
            {initials(profile?.full_name ?? "")}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-600 tracking-wide uppercase">My Profile</span>
            </div>
            <p className="font-extrabold text-gray-900 mt-0.5">{profile?.full_name}</p>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-3 text-sm">
          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-gray-500">Phone</span>
            <span className="font-bold text-gray-900">{profile?.phone ?? "Not set"}</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-gray-500">Zone</span>
            <span className="font-bold text-gray-900">{profile?.zone ?? "Not set"}</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-gray-500">Role</span>
            <span className="font-bold text-gray-900 capitalize">{profile?.role}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => signOut()}
        className="w-full flex items-center gap-3 bg-gray-100 rounded-2xl px-4 py-4 text-left text-red-600"
      >
        <LogOut className="h-5 w-5" />
        <span className="font-bold">Log Out</span>
      </button>
    </div>
  );
}

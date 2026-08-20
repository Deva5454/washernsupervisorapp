import { useState } from "react";
import { ChevronDown, ChevronUp, LogOut, User } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const FAQS = [
  {
    q: "Where do I approve requests?",
    a: "Alert Center handles Advance Requests, Cover Requests, and Leave Requests, plus SOS alerts and incident reports from your team.",
  },
  {
    q: "How does cover redistribution work?",
    a: "Mark a washer Absent in Team Status, then tap \"Cover N jobs\" to reassign their undone jobs today — it auto-suggests an on-duty teammate for each, which you can override before confirming.",
  },
  {
    q: "What's the difference between Override and Force Checkout?",
    a: "Override reassigns one job to a different washer. Force Checkout ends a currently-checked-in washer's shift immediately, from Team Status.",
  },
  {
    q: "How do I run a quality audit?",
    a: "Audit → + New Audit walks through washer selection, uniform check, job/vehicle, materials, process compliance with photo evidence, then a scored review (Pass/Minor/Major/Failed).",
  },
];

function HelpSupport() {
  return (
    <div className="px-4 pb-4 bg-white space-y-3">
      {FAQS.map((f) => (
        <div key={f.q}>
          <p className="text-sm font-bold text-gray-900">{f.q}</p>
          <p className="text-sm text-gray-600 mt-0.5">{f.a}</p>
        </div>
      ))}
    </div>
  );
}

export default function More() {
  const { profile, signOut } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

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

      <div className="bg-gray-100 rounded-2xl overflow-hidden">
        <button
          onClick={() => setHelpOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-4 text-left"
        >
          <span className="font-bold text-gray-900">Help &amp; Support</span>
          {helpOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {helpOpen && <HelpSupport />}
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

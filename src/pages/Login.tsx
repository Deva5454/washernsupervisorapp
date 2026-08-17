import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">
            CleanCar<span className="text-blue-600">.</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Field App sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-bold text-gray-700 mb-1 block">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="you@cleancar.com"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700 mb-1 block">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-base font-bold"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Accounts are created by your supervisor or admin in Supabase — there's no
          self-service sign-up here.
        </p>
      </div>
    </div>
  );
}

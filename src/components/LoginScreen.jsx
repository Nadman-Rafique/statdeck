import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { user, role, authError, signInWithGoogle, linkStudentWithInviteCode, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLink = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await linkStudentWithInviteCode(code);
    setBusy(false);
    if (!res.ok) setMsg(res.message);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="pill">StatDeck</span>
        <h1>{role === "unlinked" ? "Link Student Profile" : "Welcome Back"}</h1>
        <p className="muted">
          {role === "unlinked"
            ? `Signed in as ${user?.email}. Enter your invite code to link your account.`
            : "Sign in with Google to view the leaderboard, schedule, resources, and progress."}
        </p>

        {(authError || msg) && <div className="alert-err">{authError || msg}</div>}

        {role === "unlinked" ? (
          <form onSubmit={handleLink} className="stack">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="INVITE CODE"
              maxLength={10}
              className="input-box"
            />
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Linking..." : "Link Profile"}
            </button>
            <button type="button" onClick={signOut} className="btn-ghost">
              Sign Out
            </button>
          </form>
        ) : (
          <button type="button" onClick={signInWithGoogle} className="btn-google">
            Continue with Google
          </button>
        )}
      </div>
    </div>
  );
}
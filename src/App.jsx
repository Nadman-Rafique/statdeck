import React from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginScreen from "./components/LoginScreen";
import HomeDashboard from "./pages/HomeDashboard";
import TutorHub from "./pages/TutorHub";
import StudentPage from "./pages/StudentPage";

function Navbar() {
  const { user, role, signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span>StatDeck</span>
          <span className="role-tag">{role}</span>
        </div>
        <nav className="nav-links">
          <Link className={pathname === "/" ? "active" : ""} to="/">Home</Link>
          {role === "student" && (
            <Link className={pathname === "/my-page" ? "active" : ""} to="/my-page">My Page</Link>
          )}
          {role === "tutor" && (
            <>
              <Link className={pathname === "/tutor" ? "active" : ""} to="/tutor">Tutor Tables</Link>
              <Link className={pathname === "/preview" ? "active" : ""} to="/preview">Preview</Link>
            </>
          )}
        </nav>
        <div className="user-controls">
          <span className="muted-sm">{user?.displayName || user?.email}</span>
          <button onClick={signOut} className="btn-sm">Sign Out</button>
        </div>
      </div>
    </header>
  );
}

function AppShell() {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="center-screen muted">Loading...</div>;
  if (!user || role === "unlinked") return <LoginScreen />;

  return (
    <div className="app-bg">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomeDashboard />} />
        <Route path="/tutor" element={<TutorHub />} />
        <Route path="/my-page" element={<StudentPage isPreview={false} />} />
        <Route path="/preview" element={<StudentPage isPreview={true} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
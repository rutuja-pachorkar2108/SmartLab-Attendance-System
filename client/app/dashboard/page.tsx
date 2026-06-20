"use client";

import { useAuth } from "@/lib/auth";
import Shell from "./Shell";
import StudentDashboard from "./StudentDashboard";
import InchargeDashboard from "./InchargeDashboard";
import TADashboard from "./TADashboard";
import AdminDashboard from "./AdminDashboard";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <Shell>
      {user?.role === "student" && <StudentDashboard />}
      {user?.role === "incharge" && <InchargeDashboard />}
      {user?.role === "ta" && <TADashboard />}
      {user?.role === "admin" && <AdminDashboard />}
    </Shell>
  );
}

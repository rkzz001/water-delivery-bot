import AuthGuard from "@/components/AuthGuard";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}

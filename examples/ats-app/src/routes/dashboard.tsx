import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';

export function DashboardPage() {
  const { profile } = useAuth();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-medium">
        Welcome, {profile?.full_name || profile?.email}
      </h1>
      <p className="mt-1 text-muted-foreground">
        Signed in as <span className="font-mono">{profile?.role}</span>
        {profile?.department_id ? ' — department assigned' : ' — no department assigned'}.
      </p>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Phase 1 checkpoint</CardTitle>
          <CardDescription>Auth, roles, and RBAC scaffolding are wired up.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Department management, the BDE pipeline, and the recruitment workflow screens land in the
          phases that follow.
        </CardContent>
      </Card>
    </div>
  );
}

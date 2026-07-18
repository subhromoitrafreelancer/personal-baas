import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';

export function PendingApprovalPage() {
  const { profile, signOut, refreshProfile } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Clock className="size-6" />
          </div>
          <CardTitle>Waiting on approval</CardTitle>
          <CardDescription>
            {profile?.full_name || profile?.email}, your account is created but not yet assigned a
            role. An admin needs to set your role and department before you can sign in to the
            pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => void refreshProfile()}>
            <RefreshCw /> Check again
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

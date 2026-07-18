import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import type { AtsRole } from '@/types/ats';

// Gates every route behind "signed in" and, unless explicitly allowed, "role assigned" -- a
// freshly-signed-up user has profile.role === null (the pending-approval state, see
// examples/ats-app/schema.sql's api_ats.bootstrap_profile) and gets bounced to the
// pending-approval screen until an ADMIN assigns them a role. An optional `roles` allow-list
// additionally gates a route to specific app roles (e.g. the Admin screens) -- this is a UI
// convenience only, never the actual security boundary; RLS on the underlying tables is what
// actually enforces it if someone bypasses the UI.
export function RequireAuth({
  children,
  allowPending = false,
  roles,
}: {
  children: React.ReactNode;
  allowPending?: boolean;
  roles?: AtsRole[];
}) {
  const { status, profile } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowPending && profile?.role == null) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (roles && (!profile?.role || !roles.includes(profile.role))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

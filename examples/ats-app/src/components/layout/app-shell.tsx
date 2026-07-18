import * as React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  Handshake,
  LayoutDashboard,
  LogOut,
  ScrollText,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import type { AtsRole } from '@/types/ats';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  BDE: 'BDE',
  TL: 'Team Lead',
  STL: 'Senior Team Lead',
  RECRUITER: 'Recruiter',
};

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AtsRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Handshake, roles: ['BDE', 'ADMIN'] },
  { to: '/requirements', label: 'Requirements', icon: ScrollText, roles: ['BDE', 'ADMIN'] },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/candidates', label: 'Candidates', icon: UserRound },
  { to: '/admin/departments', label: 'Departments', icon: Building2, roles: ['ADMIN'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Briefcase className="size-5 text-primary" />
          <span className="font-display text-lg font-medium">ATS</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          {NAV_ITEMS.filter(
            (item) => !item.roles || (profile?.role && item.roles.includes(profile.role)),
          ).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-secondary'
                }`
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="truncate text-sm font-medium">
              {profile?.full_name || profile?.email}
            </span>
          </div>
          {profile?.role && (
            <Badge variant="outline" className="ml-2 mb-2">
              {ROLE_LABEL[profile.role] ?? profile.role}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 bg-background p-8">{children}</main>
    </div>
  );
}

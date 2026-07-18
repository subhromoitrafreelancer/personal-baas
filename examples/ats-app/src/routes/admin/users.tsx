import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { baas } from '@/lib/baas-client';
import type { AtsRole, Department, Profile } from '@/types/ats';

const ROLES: AtsRole[] = ['ADMIN', 'BDE', 'TL', 'STL', 'RECRUITER'];
const NO_DEPARTMENT = '__none__';

async function fetchProfiles(): Promise<Profile[]> {
  const rows = await baas.from<Profile>('profiles').select().order('created_at');
  return (rows as Profile[]) ?? [];
}

async function fetchDepartments(): Promise<Department[]> {
  const rows = await baas.from<Department>('departments').select().order('name');
  return (rows as Department[]) ?? [];
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: Partial<Profile> }) =>
      baas.from('profiles').update(patch).eq('user_id', userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profiles'] }),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not update user'),
  });

  const departmentName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? '—';

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-medium">Users</h1>
        <p className="mt-1 text-muted-foreground">
          Assign a role and department to approve a newly-signed-up account.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {profiles?.map((p) => (
            <TableRow key={p.user_id}>
              <TableCell className="font-medium">{p.full_name || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{p.email}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {p.role == null && <Badge variant="muted">Pending</Badge>}
                  <Select
                    value={p.role ?? undefined}
                    onValueChange={(role) =>
                      updateMutation.mutate({ userId: p.user_id, patch: { role: role as AtsRole } })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Assign role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell>
                <Select
                  value={p.department_id ?? NO_DEPARTMENT}
                  onValueChange={(value) =>
                    updateMutation.mutate({
                      userId: p.user_id,
                      patch: { department_id: value === NO_DEPARTMENT ? null : value },
                    })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>{departmentName(p.department_id)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>— None —</SelectItem>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant={p.active ? 'success' : 'danger'}>
                  {p.active ? 'Active' : 'Disabled'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({ userId: p.user_id, patch: { active: !p.active } })
                  }
                  disabled={updateMutation.isPending}
                >
                  {p.active ? 'Disable' : 'Enable'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

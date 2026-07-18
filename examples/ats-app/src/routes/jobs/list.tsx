import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { baas } from '@/lib/baas-client';
import { useAuth } from '@/providers/auth-provider';
import type { Department, JobPosition, JobStatus, Requirement } from '@/types/ats';

const STATUS_TABS: Array<{ value: JobStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_VARIANT: Record<JobStatus, 'default' | 'success' | 'muted' | 'danger'> = {
  OPEN: 'default',
  IN_PROGRESS: 'default',
  FILLED: 'success',
  CANCELLED: 'danger',
};

async function fetchJobs(): Promise<JobPosition[]> {
  const rows = await baas
    .from<JobPosition>('job_positions')
    .select()
    .order('created_at', { ascending: false });
  return (rows as JobPosition[]) ?? [];
}

async function fetchDepartments(): Promise<Department[]> {
  const rows = await baas.from<Department>('departments').select().order('name');
  return (rows as Department[]) ?? [];
}

async function fetchRequirements(): Promise<Requirement[]> {
  const rows = await baas
    .from<Requirement>('requirements')
    .select()
    .order('created_at', { ascending: false });
  return (rows as Requirement[]) ?? [];
}

interface JobFormState {
  requirement_id: string;
  department_id: string;
  title: string;
  description: string;
  openings: string;
}

const EMPTY_FORM: JobFormState = {
  requirement_id: '',
  department_id: '',
  title: '',
  description: '',
  openings: '1',
};
const NO_REQUIREMENT = '__none__';

export function JobsListPage() {
  const { profile } = useAuth();
  const canCreate = profile?.role === 'BDE' || profile?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const { data: jobs, isLoading } = useQuery({ queryKey: ['job_positions'], queryFn: fetchJobs });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });
  const { data: requirements } = useQuery({
    queryKey: ['requirements'],
    queryFn: fetchRequirements,
    enabled: canCreate,
  });
  const [statusFilter, setStatusFilter] = React.useState<JobStatus | 'ALL'>('ALL');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<JobFormState>(EMPTY_FORM);

  const departmentName = (id: string) => departments?.find((d) => d.id === id)?.name ?? '—';

  const createMutation = useMutation({
    mutationFn: async (values: JobFormState) =>
      baas.from('job_positions').insert({
        requirement_id:
          values.requirement_id === NO_REQUIREMENT ? null : values.requirement_id || null,
        department_id: values.department_id,
        title: values.title,
        description: values.description || null,
        openings: Number.parseInt(values.openings, 10) || 1,
      }),
    onSuccess: () => {
      toast.success('Job created');
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['job_positions'] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not create job'),
  });

  function applyRequirement(requirementId: string) {
    const req = requirements?.find((r) => r.id === requirementId);
    setForm((f) => ({
      ...f,
      requirement_id: requirementId,
      title: req ? req.job_title : f.title,
      openings: req ? String(req.number_of_openings) : f.openings,
    }));
  }

  const visibleJobs = jobs?.filter((j) => statusFilter === 'ALL' || j.status === statusFilter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">Jobs</h1>
          <p className="mt-1 text-muted-foreground">Open positions across departments.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)} disabled={!departments?.length}>
            <Plus /> New job
          </Button>
        )}
      </div>

      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as JobStatus | 'ALL')}
        className="mb-4"
      >
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Openings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && visibleJobs?.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No jobs here yet.
              </TableCell>
            </TableRow>
          )}
          {visibleJobs?.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">
                <Link to={`/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {departmentName(job.department_id)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[job.status]}>{job.status.replace('_', ' ')}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{job.openings}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New job</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="job-requirement">From requirement (optional)</Label>
              <Select value={form.requirement_id} onValueChange={applyRequirement}>
                <SelectTrigger id="job-requirement">
                  <SelectValue placeholder="No linked requirement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REQUIREMENT}>No linked requirement</SelectItem>
                  {requirements?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.job_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-department">Department</Label>
              <Select
                value={form.department_id}
                onValueChange={(value) => setForm((f) => ({ ...f, department_id: value }))}
              >
                <SelectTrigger id="job-department">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-title">Title</Label>
              <Input
                id="job-title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-description">Description</Label>
              <Textarea
                id="job-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-openings">Openings</Label>
              <Input
                id="job-openings"
                type="number"
                min={1}
                required
                value={form.openings}
                onChange={(e) => setForm((f) => ({ ...f, openings: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !form.department_id}>
                {createMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

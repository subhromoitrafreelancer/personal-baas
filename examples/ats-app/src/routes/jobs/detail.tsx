import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { baas } from '@/lib/baas-client';
import { useAuth } from '@/providers/auth-provider';
import type {
  Application,
  Candidate,
  Department,
  JobPosition,
  JobStatus,
  Profile,
  RecruiterAssignment,
  WorkflowInstance,
} from '@/types/ats';

const STATUSES: JobStatus[] = ['OPEN', 'IN_PROGRESS', 'FILLED', 'CANCELLED'];
const UNASSIGNED = '__unassigned__';

async function fetchJob(id: string): Promise<JobPosition> {
  return (await baas
    .from<JobPosition>('job_positions')
    .select()
    .eq('id', id)
    .single()) as JobPosition;
}

async function fetchDepartments(): Promise<Department[]> {
  const rows = await baas.from<Department>('departments').select();
  return (rows as Department[]) ?? [];
}

async function fetchProfiles(): Promise<Profile[]> {
  const rows = await baas.from<Profile>('profiles').select();
  return (rows as Profile[]) ?? [];
}

async function fetchAssignments(jobId: string): Promise<RecruiterAssignment[]> {
  const rows = await baas
    .from<RecruiterAssignment>('recruiter_assignments')
    .select()
    .eq('job_position_id', jobId);
  return (rows as RecruiterAssignment[]) ?? [];
}

async function fetchJobApplications(jobId: string): Promise<Application[]> {
  const rows = await baas
    .from<Application>('applications')
    .select()
    .eq('job_position_id', jobId)
    .order('created_at', { ascending: false });
  return (rows as Application[]) ?? [];
}

async function fetchCandidates(): Promise<Candidate[]> {
  const rows = await baas.from<Candidate>('candidates').select();
  return (rows as Candidate[]) ?? [];
}

async function fetchInstances(ids: string[]): Promise<WorkflowInstance[]> {
  if (ids.length === 0) return [];
  const rows = await baas.from<WorkflowInstance>('workflow_instances').select().in('id', ids);
  return (rows as WorkflowInstance[]) ?? [];
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const jobId = id!;

  const { data: job } = useQuery({
    queryKey: ['job_positions', jobId],
    queryFn: () => fetchJob(jobId),
  });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });
  const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });
  const { data: assignments } = useQuery({
    queryKey: ['recruiter_assignments', jobId],
    queryFn: () => fetchAssignments(jobId),
  });
  const { data: applications } = useQuery({
    queryKey: ['applications', 'job', jobId],
    queryFn: () => fetchJobApplications(jobId),
  });
  const { data: candidates } = useQuery({ queryKey: ['candidates'], queryFn: fetchCandidates });
  const instanceIds =
    applications?.map((a) => a.workflow_instance_id).filter((x): x is string => !!x) ?? [];
  const { data: instances } = useQuery({
    queryKey: ['workflow_instances', 'job', jobId, instanceIds],
    queryFn: () => fetchInstances(instanceIds),
    enabled: !!applications,
  });

  const [recruiterToAdd, setRecruiterToAdd] = React.useState('');

  const canManageBde = profile?.role === 'BDE' || profile?.role === 'ADMIN';
  const isAssignedTl = profile?.role === 'TL' && job?.assigned_tl_id === profile.user_id;
  const canManageRecruiters = canManageBde || isAssignedTl;

  const invalidateJob = () => {
    void queryClient.invalidateQueries({ queryKey: ['job_positions'] });
  };

  const assignTlMutation = useMutation({
    mutationFn: async (tlId: string) =>
      baas
        .from('job_positions')
        .update({ assigned_tl_id: tlId === UNASSIGNED ? null : tlId })
        .eq('id', jobId),
    onSuccess: () => {
      toast.success('Team lead updated');
      invalidateJob();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not assign TL'),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: JobStatus) =>
      baas.from('job_positions').update({ status }).eq('id', jobId),
    onSuccess: () => {
      toast.success('Status updated');
      invalidateJob();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not update status'),
  });

  const addRecruiterMutation = useMutation({
    mutationFn: async (recruiterId: string) =>
      baas
        .from('recruiter_assignments')
        .insert({ job_position_id: jobId, recruiter_id: recruiterId }),
    onSuccess: () => {
      toast.success('Recruiter assigned');
      setRecruiterToAdd('');
      void queryClient.invalidateQueries({ queryKey: ['recruiter_assignments', jobId] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not assign recruiter'),
  });

  const removeRecruiterMutation = useMutation({
    mutationFn: async (assignmentId: string) =>
      baas.from('recruiter_assignments').delete().eq('id', assignmentId),
    onSuccess: () => {
      toast.success('Recruiter removed');
      void queryClient.invalidateQueries({ queryKey: ['recruiter_assignments', jobId] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not remove recruiter'),
  });

  const profileName = (userId: string) => {
    const p = profiles?.find((x) => x.user_id === userId);
    return p?.full_name || p?.email || 'Unknown';
  };

  if (!job) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const department = departments?.find((d) => d.id === job.department_id);
  const tlCandidates = profiles?.filter(
    (p) => p.role === 'TL' && p.department_id === job.department_id,
  );
  const recruiterCandidates = profiles?.filter(
    (p) =>
      p.role === 'RECRUITER' &&
      p.department_id === job.department_id &&
      !assignments?.some((a) => a.recruiter_id === p.user_id),
  );

  return (
    <div className="max-w-3xl">
      <Link
        to="/jobs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Back to jobs
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">{job.title}</h1>
          <p className="mt-1 text-muted-foreground">{department?.name ?? '—'}</p>
        </div>
        {canManageBde || isAssignedTl ? (
          <Select value={job.status} onValueChange={(v) => statusMutation.mutate(v as JobStatus)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge>{job.status.replace('_', ' ')}</Badge>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{job.description || 'No description.'}</p>
          <p>
            <span className="text-muted-foreground">Openings: </span>
            {job.openings}
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Team lead</CardTitle>
        </CardHeader>
        <CardContent>
          {canManageBde ? (
            <Select
              value={job.assigned_tl_id ?? UNASSIGNED}
              onValueChange={(v) => assignTlMutation.mutate(v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {tlCandidates?.map((tl) => (
                  <SelectItem key={tl.user_id} value={tl.user_id}>
                    {tl.full_name || tl.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">
              {job.assigned_tl_id ? profileName(job.assigned_tl_id) : 'Unassigned'}
            </p>
          )}
          {canManageBde && !tlCandidates?.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              No team leads in this department yet — assign one from the Users screen first.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recruiters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignments?.length === 0 && (
            <p className="text-sm text-muted-foreground">No recruiters assigned yet.</p>
          )}
          {assignments?.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <span className="text-sm">{profileName(a.recruiter_id)}</span>
              {canManageRecruiters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRecruiterMutation.mutate(a.id)}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {canManageRecruiters && (
            <div className="flex items-center gap-2 pt-2">
              <Select value={recruiterToAdd} onValueChange={setRecruiterToAdd}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Add a recruiter" />
                </SelectTrigger>
                <SelectContent>
                  {recruiterCandidates?.map((r) => (
                    <SelectItem key={r.user_id} value={r.user_id}>
                      {r.full_name || r.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!recruiterToAdd || addRecruiterMutation.isPending}
                onClick={() => addRecruiterMutation.mutate(recruiterToAdd)}
              >
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {applications?.length === 0 && (
            <p className="text-sm text-muted-foreground">No applications for this job yet.</p>
          )}
          {applications?.map((a) => {
            const candidateName =
              candidates?.find((c) => c.id === a.candidate_id)?.full_name ?? 'Unknown candidate';
            const state = instances?.find((i) => i.id === a.workflow_instance_id)?.current_state;
            return (
              <Link
                key={a.id}
                to={`/applications/${a.id}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <span className="font-medium">{candidateName}</span>
                {state && (
                  <Badge variant={state.endsWith('_REJECTED') ? 'danger' : 'outline'}>
                    {state.replace(/_/g, ' ')}
                  </Badge>
                )}
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

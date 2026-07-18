import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { HandoffRail } from '@/components/ats/handoff-rail';
import { baas } from '@/lib/baas-client';
import { useAuth } from '@/providers/auth-provider';
import type {
  Application,
  Candidate,
  Department,
  Interview,
  InterviewMode,
  JobPosition,
  Profile,
  WorkflowInstance,
  WorkflowTransition,
  WorkflowTransitionLog,
} from '@/types/ats';

const INTERVIEW_MODES: InterviewMode[] = ['VIDEO', 'PHONE', 'IN_PERSON'];
const INTERVIEW_STATUS_VARIANT: Record<string, 'default' | 'success' | 'danger'> = {
  SCHEDULED: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

async function fetchApplication(id: string): Promise<Application> {
  return (await baas
    .from<Application>('applications')
    .select()
    .eq('id', id)
    .single()) as Application;
}

async function fetchCandidate(id: string): Promise<Candidate> {
  return (await baas.from<Candidate>('candidates').select().eq('id', id).single()) as Candidate;
}

async function fetchJobPosition(id: string): Promise<JobPosition> {
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

async function fetchInstance(id: string): Promise<WorkflowInstance> {
  return (await baas
    .from<WorkflowInstance>('workflow_instances')
    .select()
    .eq('id', id)
    .single()) as WorkflowInstance;
}

async function fetchTransitions(definitionId: string): Promise<WorkflowTransition[]> {
  const rows = await baas
    .from<WorkflowTransition>('workflow_transitions')
    .select()
    .eq('definition_id', definitionId);
  return (rows as WorkflowTransition[]) ?? [];
}

async function fetchLogs(instanceId: string): Promise<WorkflowTransitionLog[]> {
  const rows = await baas
    .from<WorkflowTransitionLog>('workflow_transition_logs')
    .select()
    .eq('instance_id', instanceId)
    .order('performed_at', { ascending: true });
  return (rows as WorkflowTransitionLog[]) ?? [];
}

async function fetchProfiles(): Promise<Profile[]> {
  const rows = await baas.from<Profile>('profiles').select();
  return (rows as Profile[]) ?? [];
}

async function fetchInterviews(applicationId: string): Promise<Interview[]> {
  const rows = await baas
    .from<Interview>('interviews')
    .select()
    .eq('application_id', applicationId)
    .order('scheduled_at', { ascending: true });
  return (rows as Interview[]) ?? [];
}

interface ScheduleFormState {
  scheduled_at: string;
  interviewer_name: string;
  mode: InterviewMode;
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  scheduled_at: '',
  interviewer_name: '',
  mode: 'VIDEO',
};

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const applicationId = id!;

  const { data: application } = useQuery({
    queryKey: ['applications', applicationId],
    queryFn: () => fetchApplication(applicationId),
  });
  const { data: candidate } = useQuery({
    queryKey: ['candidates', application?.candidate_id],
    queryFn: () => fetchCandidate(application!.candidate_id),
    enabled: !!application,
  });
  const { data: jobPosition } = useQuery({
    queryKey: ['job_positions', application?.job_position_id],
    queryFn: () => fetchJobPosition(application!.job_position_id),
    enabled: !!application,
  });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });
  const { data: instance } = useQuery({
    queryKey: ['workflow_instances', application?.workflow_instance_id],
    queryFn: () => fetchInstance(application!.workflow_instance_id!),
    enabled: !!application?.workflow_instance_id,
  });
  const { data: transitions } = useQuery({
    queryKey: ['workflow_transitions', instance?.definition_id],
    queryFn: () => fetchTransitions(instance!.definition_id),
    enabled: !!instance,
  });
  const { data: logs } = useQuery({
    queryKey: ['workflow_transition_logs', instance?.id],
    queryFn: () => fetchLogs(instance!.id),
    enabled: !!instance,
  });
  const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });
  const { data: interviews } = useQuery({
    queryKey: ['interviews', applicationId],
    queryFn: () => fetchInterviews(applicationId),
  });

  const [noteTransition, setNoteTransition] = React.useState<WorkflowTransition | null>(null);
  const [note, setNote] = React.useState('');
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleForm, setScheduleForm] = React.useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM);
  const [feedbackInterview, setFeedbackInterview] = React.useState<Interview | null>(null);
  const [feedback, setFeedback] = React.useState('');

  const invalidateWorkflow = () => {
    void queryClient.invalidateQueries({ queryKey: ['workflow_instances', instance?.id] });
    void queryClient.invalidateQueries({ queryKey: ['workflow_transition_logs', instance?.id] });
  };

  const transitionMutation = useMutation({
    mutationFn: async ({ name, noteText }: { name: string; noteText?: string }) =>
      baas.rpc('transition_application', {
        p_application_id: applicationId,
        p_transition_name: name,
        p_note: noteText ?? null,
      }),
    onSuccess: () => {
      toast.success('Application moved forward');
      setNoteTransition(null);
      setNote('');
      invalidateWorkflow();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not perform transition'),
  });

  const invalidateInterviews = () => {
    void queryClient.invalidateQueries({ queryKey: ['interviews', applicationId] });
  };

  const scheduleMutation = useMutation({
    mutationFn: async (values: ScheduleFormState) =>
      baas.from('interviews').insert({
        application_id: applicationId,
        scheduled_at: new Date(values.scheduled_at).toISOString(),
        interviewer_name: values.interviewer_name,
        mode: values.mode,
      }),
    onSuccess: () => {
      toast.success('Interview scheduled');
      setScheduleOpen(false);
      setScheduleForm(EMPTY_SCHEDULE_FORM);
      invalidateInterviews();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not schedule interview'),
  });

  const cancelInterviewMutation = useMutation({
    mutationFn: async (interviewId: string) =>
      baas.from('interviews').update({ status: 'CANCELLED' }).eq('id', interviewId),
    onSuccess: () => {
      toast.success('Interview cancelled');
      invalidateInterviews();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not cancel interview'),
  });

  const completeInterviewMutation = useMutation({
    mutationFn: async ({
      interviewId,
      feedbackText,
    }: {
      interviewId: string;
      feedbackText: string;
    }) =>
      baas
        .from('interviews')
        .update({ status: 'COMPLETED', feedback: feedbackText })
        .eq('id', interviewId),
    onSuccess: () => {
      toast.success('Interview marked complete');
      setFeedbackInterview(null);
      setFeedback('');
      invalidateInterviews();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not update interview'),
  });

  const profileName = (userId: string) => {
    const p = profiles?.find((x) => x.user_id === userId);
    return p?.full_name || p?.email || 'Someone';
  };

  if (!application || !candidate || !jobPosition) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const department = departments?.find((d) => d.id === jobPosition.department_id);
  const availableTransitions =
    instance && transitions
      ? transitions.filter(
          (t) =>
            t.from_state === instance.current_state &&
            profile?.role &&
            t.allowed_roles.includes(profile.role),
        )
      : [];

  function handleTransitionClick(t: WorkflowTransition) {
    if (t.requires_note) {
      setNoteTransition(t);
      return;
    }
    transitionMutation.mutate({ name: t.transition_name });
  }

  return (
    <div className="max-w-3xl">
      <Link
        to={`/candidates/${candidate.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Back to {candidate.full_name}
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">
            {candidate.full_name} → {jobPosition.title}
          </h1>
          <p className="mt-1 text-muted-foreground">{department?.name ?? '—'}</p>
        </div>
        {instance && (
          <Badge variant={instance.current_state.endsWith('_REJECTED') ? 'danger' : 'default'}>
            {instance.current_state.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>

      {instance && (
        <Card className="mb-6">
          <CardContent className="flex justify-center py-6">
            <HandoffRail currentState={instance.current_state} />
          </CardContent>
        </Card>
      )}

      {availableTransitions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Next step</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {availableTransitions.map((t) => (
              <Button
                key={t.id}
                variant={t.to_state.endsWith('_REJECTED') ? 'outline' : 'default'}
                disabled={transitionMutation.isPending}
                onClick={() => handleTransitionClick(t)}
              >
                {t.display_label || t.transition_name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Interviews</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
            <Plus /> Schedule
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {interviews?.length === 0 && (
            <p className="text-sm text-muted-foreground">No interviews scheduled yet.</p>
          )}
          {interviews?.map((iv) => (
            <div key={iv.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {iv.interviewer_name} · {iv.mode.replace('_', ' ')}
                </p>
                <Badge variant={INTERVIEW_STATUS_VARIANT[iv.status]}>{iv.status}</Badge>
              </div>
              <p className="text-muted-foreground">{new Date(iv.scheduled_at).toLocaleString()}</p>
              {iv.feedback && <p className="mt-1 italic text-muted-foreground">"{iv.feedback}"</p>}
              {iv.status === 'SCHEDULED' && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFeedbackInterview(iv);
                      setFeedback('');
                    }}
                  >
                    Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cancelInterviewMutation.isPending}
                    onClick={() => cancelInterviewMutation.mutate(iv.id)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs?.length === 0 && (
            <p className="text-sm text-muted-foreground">No transitions recorded yet.</p>
          )}
          {logs?.map((log) => (
            <div key={log.id} className="border-l-2 border-border pl-3 text-sm">
              <p className="font-medium">
                {log.from_state.replace(/_/g, ' ')} → {log.to_state.replace(/_/g, ' ')}
              </p>
              <p className="text-muted-foreground">
                {profileName(log.performed_by)} · {new Date(log.performed_at).toLocaleString()}
              </p>
              {log.note && <p className="mt-1 italic text-muted-foreground">"{log.note}"</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!noteTransition} onOpenChange={(open) => !open && setNoteTransition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{noteTransition?.display_label || 'Add a note'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="transition-note">Note</Label>
            <Textarea
              id="transition-note"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this being rejected?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteTransition(null)}>
              Cancel
            </Button>
            <Button
              disabled={!note.trim() || transitionMutation.isPending}
              onClick={() =>
                noteTransition &&
                transitionMutation.mutate({ name: noteTransition.transition_name, noteText: note })
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              scheduleMutation.mutate(scheduleForm);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="iv-when">Date & time</Label>
              <Input
                id="iv-when"
                type="datetime-local"
                required
                value={scheduleForm.scheduled_at}
                onChange={(e) => setScheduleForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iv-interviewer">Interviewer</Label>
              <Input
                id="iv-interviewer"
                required
                value={scheduleForm.interviewer_name}
                onChange={(e) =>
                  setScheduleForm((f) => ({ ...f, interviewer_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iv-mode">Mode</Label>
              <Select
                value={scheduleForm.mode}
                onValueChange={(v) => setScheduleForm((f) => ({ ...f, mode: v as InterviewMode }))}
              >
                <SelectTrigger id="iv-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEW_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={scheduleMutation.isPending}>
                {scheduleMutation.isPending ? 'Saving…' : 'Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!feedbackInterview}
        onOpenChange={(open) => !open && setFeedbackInterview(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Interview feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="iv-feedback">Feedback</Label>
            <Textarea
              id="iv-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="How did it go?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackInterview(null)}>
              Cancel
            </Button>
            <Button
              disabled={completeInterviewMutation.isPending}
              onClick={() =>
                feedbackInterview &&
                completeInterviewMutation.mutate({
                  interviewId: feedbackInterview.id,
                  feedbackText: feedback,
                })
              }
            >
              Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

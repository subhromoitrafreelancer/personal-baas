import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
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
  Document as AtsDocument,
  JobPosition,
  RecruiterAssignment,
} from '@/types/ats';

// Storage buckets in this platform aren't project-scoped and have no RLS/ACL layer -- access is
// hardcoded owner-only-or-public. This bucket is public (see schema.sql's Phase 5 note and
// README.md): any authenticated user on the deployment can fetch a resume's bytes if they know
// its storage_path, not just ATS staff. api_ats.documents' own RLS still scopes who can *see
// that a document exists* to the same audience who can see the candidate.
const RESUME_BUCKET = 'ats-resumes';

async function fetchCandidate(id: string): Promise<Candidate> {
  return (await baas.from<Candidate>('candidates').select().eq('id', id).single()) as Candidate;
}

async function fetchApplications(candidateId: string): Promise<Application[]> {
  const rows = await baas
    .from<Application>('applications')
    .select()
    .eq('candidate_id', candidateId);
  return (rows as Application[]) ?? [];
}

async function fetchJobPositions(): Promise<JobPosition[]> {
  const rows = await baas.from<JobPosition>('job_positions').select();
  return (rows as JobPosition[]) ?? [];
}

async function fetchMyAssignments(): Promise<RecruiterAssignment[]> {
  const rows = await baas.from<RecruiterAssignment>('recruiter_assignments').select();
  return (rows as RecruiterAssignment[]) ?? [];
}

async function fetchDocuments(candidateId: string): Promise<AtsDocument[]> {
  const rows = await baas
    .from<AtsDocument>('documents')
    .select()
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  return (rows as AtsDocument[]) ?? [];
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const candidateId = id!;
  const isRecruiter = profile?.role === 'RECRUITER';

  const { data: candidate } = useQuery({
    queryKey: ['candidates', candidateId],
    queryFn: () => fetchCandidate(candidateId),
  });
  const { data: applications } = useQuery({
    queryKey: ['applications', 'candidate', candidateId],
    queryFn: () => fetchApplications(candidateId),
  });
  const { data: jobPositions } = useQuery({
    queryKey: ['job_positions'],
    queryFn: fetchJobPositions,
  });
  const { data: myAssignments } = useQuery({
    queryKey: ['recruiter_assignments', 'mine'],
    queryFn: fetchMyAssignments,
    enabled: isRecruiter,
  });
  const { data: documents } = useQuery({
    queryKey: ['documents', candidateId],
    queryFn: () => fetchDocuments(candidateId),
  });

  const [jobToApply, setJobToApply] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const applyMutation = useMutation({
    mutationFn: async (jobPositionId: string) =>
      baas.rpc<Application>('create_application', {
        p_candidate_id: candidateId,
        p_job_position_id: jobPositionId,
      }),
    onSuccess: (application) => {
      toast.success('Application created');
      void queryClient.invalidateQueries({ queryKey: ['applications', 'candidate', candidateId] });
      navigate(`/applications/${application.id}`);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not create application'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const path = `${candidateId}/${crypto.randomUUID()}-${encodeURIComponent(file.name)}`;
      await baas.storage.upload(RESUME_BUCKET, path, file);
      return baas.from('documents').insert({
        candidate_id: candidateId,
        file_name: file.name,
        storage_path: path,
        content_type: file.type || null,
        size_bytes: file.size,
      });
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      void queryClient.invalidateQueries({ queryKey: ['documents', candidateId] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not upload document'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: AtsDocument) => {
      await baas.storage.remove(RESUME_BUCKET, doc.storage_path);
      return baas.from('documents').delete().eq('id', doc.id);
    },
    onSuccess: () => {
      toast.success('Document removed');
      void queryClient.invalidateQueries({ queryKey: ['documents', candidateId] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not remove document'),
  });

  async function handleDownload(doc: AtsDocument) {
    setDownloadingId(doc.id);
    try {
      const blob = await baas.storage.download(RESUME_BUCKET, doc.storage_path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download document');
    } finally {
      setDownloadingId(null);
    }
  }

  const jobTitle = (jobId: string) => jobPositions?.find((j) => j.id === jobId)?.title ?? '—';

  const appliedJobIds = new Set(applications?.map((a) => a.job_position_id));
  const applyCandidates = jobPositions?.filter(
    (j) => myAssignments?.some((a) => a.job_position_id === j.id) && !appliedJobIds.has(j.id),
  );

  if (!candidate) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="max-w-2xl">
      <Link
        to="/candidates"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Back to candidates
      </Link>

      <h1 className="font-display text-3xl font-medium">{candidate.full_name}</h1>
      <p className="mt-1 text-muted-foreground">
        {candidate.current_location || 'Location unknown'}
        {candidate.experience_years != null
          ? ` · ${candidate.experience_years} yrs experience`
          : ''}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Skills: </span>
            {candidate.skills || '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Email: </span>
            {candidate.email || '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Phone: </span>
            {candidate.phone || '—'}
          </p>
        </CardContent>
      </Card>

      {isRecruiter && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Apply to a job</CardTitle>
          </CardHeader>
          <CardContent>
            {applyCandidates?.length ? (
              <div className="flex items-center gap-2">
                <Select value={jobToApply} onValueChange={setJobToApply}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select one of your assigned jobs" />
                  </SelectTrigger>
                  <SelectContent>
                    {applyCandidates.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!jobToApply || applyMutation.isPending}
                  onClick={() => applyMutation.mutate(jobToApply)}
                >
                  Apply
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No open jobs to apply this candidate to — you need an assigned job this candidate
                hasn't already applied to.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {applications?.length === 0 && (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          )}
          {applications?.map((a) => (
            <Link
              key={a.id}
              to={`/applications/${a.id}`}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <span className="font-medium">{jobTitle(a.job_position_id)}</span>
              <span className="text-muted-foreground">
                {new Date(a.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {documents?.length === 0 && (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          )}
          {documents?.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{doc.file_name}</p>
                <p className="text-muted-foreground">{formatSize(doc.size_bytes)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={downloadingId === doc.id}
                  onClick={() => void handleDownload(doc)}
                >
                  <Download className="size-4" />
                </Button>
                {isRecruiter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(doc)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {isRecruiter && (
            <div className="pt-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload /> {uploadMutation.isPending ? 'Uploading…' : 'Upload resume'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

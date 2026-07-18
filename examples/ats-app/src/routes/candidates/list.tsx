import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { baas } from '@/lib/baas-client';
import { useAuth } from '@/providers/auth-provider';
import type { Candidate } from '@/types/ats';

async function fetchCandidates(): Promise<Candidate[]> {
  const rows = await baas
    .from<Candidate>('candidates')
    .select()
    .order('created_at', { ascending: false });
  return (rows as Candidate[]) ?? [];
}

interface CandidateFormState {
  full_name: string;
  email: string;
  phone: string;
  current_location: string;
  skills: string;
  experience_years: string;
}

const EMPTY_FORM: CandidateFormState = {
  full_name: '',
  email: '',
  phone: '',
  current_location: '',
  skills: '',
  experience_years: '',
};

export function CandidatesListPage() {
  const { profile } = useAuth();
  const canCreate = profile?.role === 'RECRUITER';
  const queryClient = useQueryClient();
  const { data: candidates, isLoading } = useQuery({
    queryKey: ['candidates'],
    queryFn: fetchCandidates,
  });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<CandidateFormState>(EMPTY_FORM);

  const createMutation = useMutation({
    mutationFn: async (values: CandidateFormState) =>
      baas.from('candidates').insert({
        full_name: values.full_name,
        email: values.email || null,
        phone: values.phone || null,
        current_location: values.current_location || null,
        skills: values.skills || null,
        experience_years:
          values.experience_years.trim() === ''
            ? null
            : Number.parseInt(values.experience_years, 10),
      }),
    onSuccess: () => {
      toast.success('Candidate added');
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not save candidate'),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">Candidates</h1>
          <p className="mt-1 text-muted-foreground">People you're sourcing and moving forward.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus /> New candidate
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Skills</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Contact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && candidates?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {canCreate ? 'No candidates yet.' : 'No candidates visible yet.'}
              </TableCell>
            </TableRow>
          )}
          {candidates?.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">
                <Link to={`/candidates/${c.id}`} className="hover:underline">
                  {c.full_name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{c.skills || '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {c.experience_years != null ? `${c.experience_years} yrs` : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.current_location || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{c.email || c.phone || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New candidate</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cand-name">Full name</Label>
              <Input
                id="cand-name"
                required
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-email">Email</Label>
              <Input
                id="cand-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-phone">Phone</Label>
              <Input
                id="cand-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-location">Current location</Label>
              <Input
                id="cand-location"
                value={form.current_location}
                onChange={(e) => setForm((f) => ({ ...f, current_location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-skills">Skills</Label>
              <Input
                id="cand-skills"
                placeholder="ICU nursing, patient care"
                value={form.skills}
                onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cand-exp">Experience (yrs)</Label>
              <Input
                id="cand-exp"
                type="number"
                min={0}
                value={form.experience_years}
                onChange={(e) => setForm((f) => ({ ...f, experience_years: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

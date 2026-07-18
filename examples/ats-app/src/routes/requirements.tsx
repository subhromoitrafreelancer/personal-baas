import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { baas } from '@/lib/baas-client';
import type { Client, Requirement } from '@/types/ats';

const ALL_CLIENTS = '__all__';

async function fetchClients(): Promise<Client[]> {
  const rows = await baas.from<Client>('clients').select().order('name');
  return (rows as Client[]) ?? [];
}

async function fetchRequirements(): Promise<Requirement[]> {
  const rows = await baas
    .from<Requirement>('requirements')
    .select()
    .order('created_at', { ascending: false });
  return (rows as Requirement[]) ?? [];
}

interface RequirementFormState {
  client_id: string;
  job_title: string;
  skills: string;
  exp_min_years: string;
  exp_max_years: string;
  location: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  number_of_openings: string;
  notes: string;
}

const EMPTY_FORM: RequirementFormState = {
  client_id: '',
  job_title: '',
  skills: '',
  exp_min_years: '',
  exp_max_years: '',
  location: '',
  salary_min: '',
  salary_max: '',
  salary_currency: 'INR',
  number_of_openings: '1',
  notes: '',
};

function toIntOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number.parseInt(value, 10);
}

function toNumOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number.parseFloat(value);
}

export function RequirementsPage() {
  const queryClient = useQueryClient();
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: fetchClients });
  const { data: requirements, isLoading } = useQuery({
    queryKey: ['requirements'],
    queryFn: fetchRequirements,
  });
  const [clientFilter, setClientFilter] = React.useState(ALL_CLIENTS);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<RequirementFormState>(EMPTY_FORM);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? '—';

  const createMutation = useMutation({
    mutationFn: async (values: RequirementFormState) =>
      baas.from('requirements').insert({
        client_id: values.client_id,
        job_title: values.job_title,
        skills: values.skills || null,
        exp_min_years: toIntOrNull(values.exp_min_years),
        exp_max_years: toIntOrNull(values.exp_max_years),
        location: values.location || null,
        salary_min: toNumOrNull(values.salary_min),
        salary_max: toNumOrNull(values.salary_max),
        salary_currency: values.salary_currency || 'INR',
        number_of_openings: Number.parseInt(values.number_of_openings, 10) || 1,
        notes: values.notes || null,
      }),
    onSuccess: () => {
      toast.success('Requirement created');
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['requirements'] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not save requirement'),
  });

  const visibleRequirements = requirements?.filter(
    (r) => clientFilter === ALL_CLIENTS || r.client_id === clientFilter,
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">Requirements</h1>
          <p className="mt-1 text-muted-foreground">Open requirements clients have raised.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)} disabled={!clients?.length}>
            <Plus /> New requirement
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job title</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Openings</TableHead>
            <TableHead>Location</TableHead>
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
          {!isLoading && visibleRequirements?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {clients?.length ? 'No requirements yet.' : 'Create a client first.'}
              </TableCell>
            </TableRow>
          )}
          {visibleRequirements?.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.job_title}</TableCell>
              <TableCell className="text-muted-foreground">{clientName(r.client_id)}</TableCell>
              <TableCell className="text-muted-foreground">
                {r.exp_min_years ?? '—'}–{r.exp_max_years ?? '—'} yrs
              </TableCell>
              <TableCell className="text-muted-foreground">{r.number_of_openings}</TableCell>
              <TableCell className="text-muted-foreground">{r.location || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New requirement</DialogTitle>
          </DialogHeader>
          <form
            className="grid max-h-[70vh] grid-cols-2 gap-4 overflow-y-auto pr-1"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
          >
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="req-client">Client</Label>
              <Select
                value={form.client_id}
                onValueChange={(value) => setForm((f) => ({ ...f, client_id: value }))}
              >
                <SelectTrigger id="req-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="req-title">Job title</Label>
              <Input
                id="req-title"
                required
                value={form.job_title}
                onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="req-skills">Skills</Label>
              <Input
                id="req-skills"
                placeholder="React, TypeScript, SQL"
                value={form.skills}
                onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-exp-min">Min experience (yrs)</Label>
              <Input
                id="req-exp-min"
                type="number"
                min={0}
                value={form.exp_min_years}
                onChange={(e) => setForm((f) => ({ ...f, exp_min_years: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-exp-max">Max experience (yrs)</Label>
              <Input
                id="req-exp-max"
                type="number"
                min={0}
                value={form.exp_max_years}
                onChange={(e) => setForm((f) => ({ ...f, exp_max_years: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="req-location">Location</Label>
              <Input
                id="req-location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-salary-min">Salary min</Label>
              <Input
                id="req-salary-min"
                type="number"
                min={0}
                value={form.salary_min}
                onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-salary-max">Salary max</Label>
              <Input
                id="req-salary-max"
                type="number"
                min={0}
                value={form.salary_max}
                onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-openings">Openings</Label>
              <Input
                id="req-openings"
                type="number"
                min={1}
                required
                value={form.number_of_openings}
                onChange={(e) => setForm((f) => ({ ...f, number_of_openings: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="req-notes">Notes</Label>
              <Textarea
                id="req-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !form.client_id}>
                {createMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

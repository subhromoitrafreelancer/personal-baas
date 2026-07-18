import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Department } from '@/types/ats';

async function fetchDepartments(): Promise<Department[]> {
  const rows = await baas.from<Department>('departments').select().order('name');
  return (rows as Department[]) ?? [];
}

interface DepartmentFormState {
  id: string | null;
  name: string;
  code: string;
}

const EMPTY_FORM: DepartmentFormState = { id: null, name: '', code: '' };

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<DepartmentFormState>(EMPTY_FORM);

  const saveMutation = useMutation({
    mutationFn: async (values: DepartmentFormState) => {
      if (values.id) {
        return baas
          .from('departments')
          .update({ name: values.name, code: values.code })
          .eq('id', values.id);
      }
      return baas.from('departments').insert({ name: values.name, code: values.code });
    },
    onSuccess: () => {
      toast.success(form.id ? 'Department updated' : 'Department created');
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not save department'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (dept: Department) =>
      baas.from('departments').update({ active: !dept.active }).eq('id', dept.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['departments'] }),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not update department'),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(dept: Department) {
    setForm({ id: dept.id, name: dept.name, code: dept.code });
    setDialogOpen(true);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">Departments</h1>
          <p className="mt-1 text-muted-foreground">
            Recruitment departments jobs get assigned into.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New department
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
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
          {!isLoading && departments?.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No departments yet. Create one to start assigning jobs.
              </TableCell>
            </TableRow>
          )}
          {departments?.map((dept) => (
            <TableRow key={dept.id}>
              <TableCell className="font-medium">{dept.name}</TableCell>
              <TableCell className="font-mono text-muted-foreground">{dept.code}</TableCell>
              <TableCell>
                <Badge variant={dept.active ? 'success' : 'muted'}>
                  {dept.active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                <Button variant="outline" size="sm" onClick={() => openEdit(dept)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActiveMutation.mutate(dept)}
                  disabled={toggleActiveMutation.isPending}
                >
                  {dept.active ? 'Deactivate' : 'Activate'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit department' : 'New department'}</DialogTitle>
            <DialogDescription>
              The code is a short, unique slug (e.g. <span className="font-mono">MED</span>) used
              elsewhere in the system.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input
                id="dept-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-code">Code</Label>
              <Input
                id="dept-code"
                required
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

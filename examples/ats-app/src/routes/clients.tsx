import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { baas } from '@/lib/baas-client';
import type { Client } from '@/types/ats';

async function fetchClients(): Promise<Client[]> {
  const rows = await baas.from<Client>('clients').select().order('name');
  return (rows as Client[]) ?? [];
}

interface ClientFormState {
  id: string | null;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
}

const EMPTY_FORM: ClientFormState = {
  id: null,
  name: '',
  contact_person: '',
  email: '',
  phone: '',
};

export function ClientsPage() {
  const queryClient = useQueryClient();
  const { data: clients, isLoading } = useQuery({ queryKey: ['clients'], queryFn: fetchClients });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<ClientFormState>(EMPTY_FORM);

  const saveMutation = useMutation({
    mutationFn: async (values: ClientFormState) => {
      const payload = {
        name: values.name,
        contact_person: values.contact_person || null,
        email: values.email,
        phone: values.phone || null,
      };
      if (values.id) return baas.from('clients').update(payload).eq('id', values.id);
      return baas.from('clients').insert(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? 'Client updated' : 'Client created');
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not save client'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (client: Client) =>
      baas.from('clients').update({ active: !client.active }).eq('id', client.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clients'] }),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not update client'),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(client: Client) {
    setForm({
      id: client.id,
      name: client.name,
      contact_person: client.contact_person ?? '',
      email: client.email,
      phone: client.phone ?? '',
    });
    setDialogOpen(true);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium">Clients</h1>
          <p className="mt-1 text-muted-foreground">
            Companies whose requirements you're recruiting for.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New client
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
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
          {!isLoading && clients?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No clients yet.
              </TableCell>
            </TableRow>
          )}
          {clients?.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {client.contact_person || '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{client.email}</TableCell>
              <TableCell className="text-muted-foreground">{client.phone || '—'}</TableCell>
              <TableCell>
                <Badge variant={client.active ? 'success' : 'muted'}>
                  {client.active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2 text-right">
                <Button variant="outline" size="sm" onClick={() => openEdit(client)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActiveMutation.mutate(client)}
                  disabled={toggleActiveMutation.isPending}
                >
                  {client.active ? 'Deactivate' : 'Activate'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit client' : 'New client'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Company name</Label>
              <Input
                id="client-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-contact">Contact person</Label>
              <Input
                id="client-contact"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
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

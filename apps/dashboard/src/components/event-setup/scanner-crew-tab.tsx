import { useState } from "react";
import { 
  useListScannerCrew, getListScannerCrewQueryKey,
  useCreateScannerCrewMember,
  useDeleteScannerCrewMember,
  useListRaces
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Smartphone, ShieldCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ScannerCrewTab({ eventId }: { eventId: number }) {
  const { data: crew, isLoading } = useListScannerCrew(eventId, { query: { enabled: !!eventId, queryKey: getListScannerCrewQueryKey(eventId) } });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteScannerCrewMember();

  const handleDelete = (crewId: number) => {
    if (!confirm("Remove this crew member? They will lose scanner access.")) return;
    deleteMutation.mutate(
      { eventId, scannerId: crewId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScannerCrewQueryKey(eventId) });
          toast({ title: "Crew member removed" });
        }
      }
    );
  };

  return (
    <div className="p-8 max-w-5xl space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Scanner Crew</h2>
          <p className="text-muted-foreground mt-1">Create accounts for volunteers to scan bibs at checkpoints.</p>
        </div>
        <AddCrewDialog eventId={eventId} />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Assigned Checkpoint</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : crew?.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                <div className="flex flex-col items-center justify-center">
                  <Smartphone className="h-8 w-8 mb-2 opacity-50" />
                  <p>No scanner crew accounts yet.</p>
                </div>
              </TableCell></TableRow>
            ) : (
              crew?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {member.name}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{member.username}</TableCell>
                  <TableCell>
                    {member.assignedCheckpointId ? `Checkpoint #${member.assignedCheckpointId}` : <span className="text-muted-foreground">Unassigned (Rover)</span>}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(member.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AddCrewDialog({ eventId }: { eventId: number }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", username: "", password: "", assignedCheckpointId: null as number | null });
  const createMutation = useCreateScannerCrewMember();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = () => {
    createMutation.mutate(
      { eventId, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScannerCrewQueryKey(eventId) });
          toast({ title: "Crew account created" });
          setOpen(false);
          setFormData({ name: "", username: "", password: "", assignedCheckpointId: null });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed to create account", description: err.message })
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><PlusCircle className="h-4 w-4" /> Add Crew Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Scanner Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John (CP1 Volunteer)" />
          </div>
          <div className="space-y-2">
            <Label>Login Username</Label>
            <Input value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} placeholder="e.g. cp1_john" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formData.name || !formData.username || !formData.password || createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
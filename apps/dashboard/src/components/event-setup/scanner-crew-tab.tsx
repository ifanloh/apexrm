import { useMemo, useState } from "react";
import {
  getListEventCheckpointsQueryKey,
  getListScannerCrewQueryKey,
  useCreateScannerCrewMember,
  useDeleteScannerCrewMember,
  useListEventCheckpoints,
  useListScannerCrew
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Trash2, Smartphone, ShieldCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

function formatCheckpointAssignment(checkpoint: {
  raceName: string;
  name: string;
  orderIndex: number;
  distanceFromStart?: number | null;
  isStartLine: boolean;
  isFinishLine: boolean;
}) {
  const checkpointIndex = Math.max(1, checkpoint.orderIndex - 1);
  const roleLabel = checkpoint.isStartLine ? "Start" : checkpoint.isFinishLine ? "Finish" : `CP ${checkpointIndex}`;
  const distanceLabel = checkpoint.distanceFromStart != null ? ` - ${checkpoint.distanceFromStart} km` : "";
  return `${checkpoint.raceName} - ${roleLabel} - ${checkpoint.name}${distanceLabel}`;
}

export function ScannerCrewTab({ eventId }: { eventId: number }) {
  const { data: crew, isLoading } = useListScannerCrew(eventId, {
    query: { enabled: !!eventId, queryKey: getListScannerCrewQueryKey(eventId) }
  });
  const { data: eventCheckpoints } = useListEventCheckpoints(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventCheckpointsQueryKey(eventId) }
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteScannerCrewMember();
  const checkpointLabelById = useMemo(
    () => new Map((eventCheckpoints ?? []).map((checkpoint) => [checkpoint.id, formatCheckpointAssignment(checkpoint)] as const)),
    [eventCheckpoints]
  );

  const handleDelete = (crewId: number) => {
    if (!confirm("Remove this crew member? They will lose scanner access.")) return;
    deleteMutation.mutate(
      { eventId, scannerId: crewId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScannerCrewQueryKey(eventId) });
          queryClient.invalidateQueries({ queryKey: getListEventCheckpointsQueryKey(eventId) });
          toast({ title: "Crew member removed" });
        }
      }
    );
  };

  return (
    <div className="animate-in max-w-5xl space-y-8 p-8 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Scanner Crew</h2>
          <p className="mt-1 text-muted-foreground">
            Create one login per crew member and tie it to a checkpoint so scanner location auto-locks from organizer.
          </p>
        </div>
        <AddCrewDialog eventId={eventId} checkpointCount={eventCheckpoints?.length ?? 0} />
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
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : crew?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <Smartphone className="mb-2 h-8 w-8 opacity-50" />
                    <p>No scanner crew accounts yet.</p>
                  </div>
                </TableCell>
              </TableRow>
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
                    {member.assignedCheckpointId ? (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{checkpointLabelById.get(member.assignedCheckpointId) ?? `Checkpoint #${member.assignedCheckpointId}`}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unassigned (Rover / username fallback)</span>
                    )}
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

function AddCrewDialog({ eventId, checkpointCount }: { eventId: number; checkpointCount: number }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    assignedCheckpointId: null as number | null
  });
  const createMutation = useCreateScannerCrewMember();
  const { data: eventCheckpoints } = useListEventCheckpoints(eventId, {
    query: { enabled: open && !!eventId, queryKey: getListEventCheckpointsQueryKey(eventId) }
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = () => {
    createMutation.mutate(
      { eventId, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScannerCrewQueryKey(eventId) });
          queryClient.invalidateQueries({ queryKey: getListEventCheckpointsQueryKey(eventId) });
          toast({ title: "Crew account created" });
          setOpen(false);
          setFormData({ name: "", username: "", password: "", assignedCheckpointId: null });
        },
        onError: (err: any) =>
          toast({ variant: "destructive", title: "Failed to create account", description: err.message })
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusCircle className="h-4 w-4" /> Add Crew Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Scanner Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input
              value={formData.name}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. John (CP1 Volunteer)"
            />
          </div>
          <div className="space-y-2">
            <Label>Login Username</Label>
            <Input
              value={formData.username}
              onChange={(event) => setFormData((current) => ({ ...current, username: event.target.value }))}
              placeholder="e.g. crew1cp2@event.com"
            />
            <p className="text-xs text-muted-foreground">
              Recommended: include checkpoint marker in the username, for example <code>crew1cp1@event.com</code>,{" "}
              <code>crew2cp2@event.com</code>, or <code>crewstart@event.com</code>.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Assigned Checkpoint</Label>
            <Select
              onValueChange={(value) =>
                setFormData((current) => ({ ...current, assignedCheckpointId: value === "rover" ? null : Number(value) }))
              }
              value={formData.assignedCheckpointId === null ? "rover" : String(formData.assignedCheckpointId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select checkpoint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rover">No fixed checkpoint (Rover)</SelectItem>
                {(eventCheckpoints ?? []).map((checkpoint) => (
                  <SelectItem key={checkpoint.id} value={String(checkpoint.id)}>
                    {formatCheckpointAssignment(checkpoint)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This is the main lock source for scanner login. If left empty, scanner will still try to infer the CP from the
              username pattern.
            </p>
          </div>
          {checkpointCount === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Add checkpoints in <strong>Races & Checkpoints</strong> first if you want the crew account to auto-lock to a specific
              CP.
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.username || !formData.password || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

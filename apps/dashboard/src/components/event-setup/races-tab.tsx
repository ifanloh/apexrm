import { useState } from "react";
import {
  useListRaces,
  getListRacesQueryKey,
  useCreateRace,
  useUpdateRace,
  useDeleteRace,
  useListCheckpoints,
  getListCheckpointsQueryKey,
  useCreateCheckpoint,
  useDeleteCheckpoint
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2, Flag, Upload, Route } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";

async function readUploadedText(file: File) {
  const text = await file.text();
  if (!text.trim()) {
    throw new Error("The uploaded GPX file is empty.");
  }
  return text;
}

export function RacesTab({ eventId }: { eventId: number }) {
  const { data: races, isLoading } = useListRaces(eventId, { query: { enabled: !!eventId, queryKey: getListRacesQueryKey(eventId) } });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useCreateRace();
  const deleteMutation = useDeleteRace();
  const updateRaceMutation = useUpdateRace();

  const [isAddRaceOpen, setIsAddRaceOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    distance: 10,
    elevationGain: 500,
    maxParticipants: 100,
    cutoffTime: "12:00:00"
  });

  const handleCreate = () => {
    createMutation.mutate(
      { eventId, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRacesQueryKey(eventId) });
          toast({ title: "Race category added" });
          setIsAddRaceOpen(false);
          setFormData({
            name: "",
            distance: 10,
            elevationGain: 500,
            maxParticipants: 100,
            cutoffTime: "12:00:00"
          });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to add race" })
      }
    );
  };

  const handleDelete = (raceId: number) => {
    if (!confirm("Are you sure you want to delete this race category?")) return;
    deleteMutation.mutate(
      { eventId, raceId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRacesQueryKey(eventId) });
          toast({ title: "Race deleted" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to delete race" })
      }
    );
  };

  const handleRaceGpxUpload = async (raceId: number, file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      const gpxData = await readUploadedText(file);
      updateRaceMutation.mutate(
        { eventId, raceId, data: { gpxFileName: file.name, gpxData } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListRacesQueryKey(eventId) });
            toast({ title: "Race GPX uploaded" });
          },
          onError: (error: Error) => toast({ variant: "destructive", title: "Failed to upload race GPX", description: error.message })
        }
      );
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to read GPX file",
        description: error instanceof Error ? error.message : "Please try another GPX file."
      });
    }
  };

  return (
    <div className="p-8 max-w-5xl space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Races & Checkpoints</h2>
          <p className="text-muted-foreground mt-1">Manage categories, one route GPX per race, and checkpoint structure.</p>
        </div>
        <Dialog open={isAddRaceOpen} onOpenChange={setIsAddRaceOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><PlusCircle className="h-4 w-4" /> Add Race Category</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Race Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))} placeholder="e.g. 50K Ultra" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Distance (km)</Label>
                  <Input type="number" value={formData.distance} onChange={(e) => setFormData((current) => ({ ...current, distance: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Elevation (m)</Label>
                  <Input type="number" value={formData.elevationGain} onChange={(e) => setFormData((current) => ({ ...current, elevationGain: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Participants</Label>
                  <Input type="number" value={formData.maxParticipants} onChange={(e) => setFormData((current) => ({ ...current, maxParticipants: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Cutoff Time (HH:MM:SS)</Label>
                  <Input value={formData.cutoffTime} onChange={(e) => setFormData((current) => ({ ...current, cutoffTime: e.target.value }))} placeholder="12:00:00" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddRaceOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !formData.name}>Add Race</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((index) => <div key={index} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : races?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card/50 text-muted-foreground">
          No races found. Add one to get started.
        </div>
      ) : (
        <Accordion type="single" collapsible className="space-y-4">
          {races?.map((race) => (
            <AccordionItem key={race.id} value={race.id.toString()} className="border rounded-lg bg-card overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-2 rounded flex-shrink-0">
                      <Flag className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-base">{race.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {race.distance}km | {race.elevationGain}m D+ | {race.participantCount}/{race.maxParticipants} runners
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={race.status === "draft" ? "secondary" : "default"} className="uppercase">
                      {race.status}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-2 border-t bg-muted/10">
                <div className="space-y-6 pt-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Route className="h-4 w-4 text-primary" />
                          Race Route GPX
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-sm">{race.gpxFileName || "No GPX uploaded yet"}</p>
                          <p className="text-xs text-muted-foreground mt-1">Upload the master GPX for this race category.</p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <label className="cursor-pointer">
                            <Upload className="h-4 w-4" />
                            {race.gpxFileName ? "Replace GPX" : "Upload GPX"}
                            <input
                              accept=".gpx,application/gpx+xml,application/xml,text/xml"
                              className="hidden"
                              onChange={(event) => {
                                void handleRaceGpxUpload(race.id, event.target.files?.[0]);
                                event.currentTarget.value = "";
                              }}
                              type="file"
                            />
                          </label>
                        </Button>
                      </CardContent>
                    </Card>

                    <div className="flex justify-end">
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(race.id)} className="gap-2">
                        <Trash2 className="h-4 w-4" /> Delete Race
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Checkpoints Route</h4>
                    <CheckpointsList eventId={eventId} raceId={race.id} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function CheckpointsList({ eventId, raceId }: { eventId: number; raceId: number }) {
  const { data: checkpoints, isLoading } = useListCheckpoints(eventId, raceId, {
    query: { enabled: !!raceId, queryKey: getListCheckpointsQueryKey(eventId, raceId) }
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateCheckpoint();
  const deleteMutation = useDeleteCheckpoint();

  const [formData, setFormData] = useState({
    name: "",
    orderIndex: 1,
    distanceFromStart: 0,
    isStartLine: true,
    isFinishLine: false
  });

  const handleAdd = () => {
    createMutation.mutate(
      { eventId, raceId, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey(eventId, raceId) });
          const nextCount = (checkpoints?.length || 0) + 1;
          setFormData({
            name: "",
            orderIndex: nextCount + 1,
            distanceFromStart: 0,
            isStartLine: false,
            isFinishLine: false
          });
          toast({ title: "Checkpoint added" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to add checkpoint" })
      }
    );
  };

  const handleDelete = (checkpointId: number) => {
    deleteMutation.mutate(
      { eventId, raceId, checkpointId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey(eventId, raceId) });
          toast({ title: "Checkpoint removed" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to remove checkpoint" })
      }
    );
  };

  if (isLoading) return <div className="h-20 bg-muted animate-pulse rounded-md" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {checkpoints?.map((checkpoint) => (
          <div key={checkpoint.id} className="flex flex-col gap-3 rounded-md border bg-card p-3 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                {checkpoint.orderIndex}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{checkpoint.name}</span>
                  <span className="text-muted-foreground">({checkpoint.distanceFromStart}km)</span>
                  {checkpoint.isStartLine ? <Badge variant="outline" className="bg-primary/10 text-primary">Start Line</Badge> : null}
                  {checkpoint.isFinishLine ? <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Finish Line</Badge> : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(checkpoint.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {checkpoints?.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-2">No checkpoints added yet. Start by adding a Start Line.</div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">Mark one checkpoint as the start line and one checkpoint as the finish line.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Name</Label>
            <Input value={formData.name} onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Start Gate" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Order</Label>
            <Input type="number" value={formData.orderIndex} onChange={(event) => setFormData((current) => ({ ...current, orderIndex: Number(event.target.value) }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distance (km)</Label>
            <Input type="number" value={formData.distanceFromStart} onChange={(event) => setFormData((current) => ({ ...current, distanceFromStart: Number(event.target.value) }))} />
          </div>
          <div className="flex items-end justify-start md:justify-end">
            <Button size="sm" onClick={handleAdd} disabled={!formData.name || createMutation.isPending}>Add</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox id={`start-${raceId}`} checked={formData.isStartLine} onCheckedChange={(checked) => setFormData((current) => ({ ...current, isStartLine: !!checked }))} />
            <label htmlFor={`start-${raceId}`} className="text-xs font-medium leading-none">
              Start line
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id={`finish-${raceId}`} checked={formData.isFinishLine} onCheckedChange={(checked) => setFormData((current) => ({ ...current, isFinishLine: !!checked }))} />
            <label htmlFor={`finish-${raceId}`} className="text-xs font-medium leading-none">
              Finish line
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

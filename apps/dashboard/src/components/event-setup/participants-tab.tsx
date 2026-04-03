import { useState } from "react";
import { 
  useListRaces, getListRacesQueryKey,
  useListParticipants, getListParticipantsQueryKey,
  useCreateParticipant,
  useImportParticipants,
  useDeleteParticipant
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, Plus, Download, Trash2, Search } from "lucide-react";

export function ParticipantsTab({ eventId }: { eventId: number }) {
  const { data: races } = useListRaces(eventId, { query: { enabled: !!eventId, queryKey: getListRacesQueryKey(eventId) } });
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  
  const actualRaceId = selectedRaceId ? parseInt(selectedRaceId) : races?.[0]?.id;

  const { data: participants, isLoading } = useListParticipants(eventId, actualRaceId as number, { 
    query: { enabled: !!actualRaceId, queryKey: getListParticipantsQueryKey(eventId, actualRaceId as number) } 
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteParticipant();

  const handleDelete = (participantId: number) => {
    if (!confirm("Remove this participant?")) return;
    deleteMutation.mutate(
      { eventId, raceId: actualRaceId as number, participantId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(eventId, actualRaceId as number) });
          toast({ title: "Participant removed" });
        }
      }
    );
  };

  return (
    <div className="p-8 max-w-6xl space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Participants</h2>
          <p className="text-muted-foreground mt-1">Manage runners for each category.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={selectedRaceId || (races?.[0]?.id.toString() || "")} onValueChange={setSelectedRaceId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select race..." />
            </SelectTrigger>
            <SelectContent>
              {races?.map(r => (
                <SelectItem key={r.id} value={r.id.toString()}>{r.name} ({r.participantCount})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {actualRaceId && (
            <>
              <ImportDialog eventId={eventId} raceId={actualRaceId} />
              <AddParticipantDialog eventId={eventId} raceId={actualRaceId} />
            </>
          )}
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex items-center justify-between bg-muted/20">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search participants..." className="pl-9 h-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>BIB</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : participants?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No participants found in this race.</TableCell></TableRow>
            ) : (
              participants?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-medium">{p.bibNumber || '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{p.gender || '-'}</div>
                    <div className="text-xs text-muted-foreground">{p.ageCategory || '-'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'registered' ? 'secondary' : 'default'} className="uppercase text-[10px]">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
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

function ImportDialog({ eventId, raceId }: { eventId: number, raceId: number }) {
  const [open, setOpen] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const importMutation = useImportParticipants();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handlePreview = () => {
    importMutation.mutate(
      { eventId, raceId, data: { csvData, preview: true } },
      {
        onSuccess: (res) => setPreviewData(res),
        onError: (err: any) => toast({ variant: "destructive", title: "Preview failed", description: err.message })
      }
    );
  };

  const handleApply = () => {
    importMutation.mutate(
      { eventId, raceId, data: { csvData, preview: false } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(eventId, raceId) });
          toast({ title: `Imported ${res.imported} participants successfully` });
          setOpen(false);
          setCsvData("");
          setPreviewData(null);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Import failed", description: err.message })
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Participants</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paste CSV Data</Label>
            <Textarea 
              rows={8} 
              placeholder="bibNumber,fullName,email,phone,gender,ageCategory&#10;101,John Doe,john@example.com,123456,M,Open" 
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          
          {previewData && (
            <div className="bg-muted p-4 rounded-md text-sm">
              <h4 className="font-semibold mb-2">Preview Results</h4>
              <p className="text-green-600">Valid rows to import: {previewData.imported}</p>
              <p className="text-amber-600">Skipped (invalid): {previewData.skipped}</p>
              {previewData.errors?.length > 0 && (
                <ul className="mt-2 text-destructive text-xs list-disc list-inside pl-4">
                  {previewData.errors.slice(0, 3).map((e: string, i: number) => <li key={i}>{e}</li>)}
                  {previewData.errors.length > 3 && <li>...and {previewData.errors.length - 3} more errors</li>}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {previewData ? (
            <>
              <Button variant="outline" onClick={() => setPreviewData(null)}>Edit Data</Button>
              <Button onClick={handleApply} disabled={importMutation.isPending || previewData.imported === 0}>
                {importMutation.isPending ? "Importing..." : "Apply Import"}
              </Button>
            </>
          ) : (
            <Button onClick={handlePreview} disabled={!csvData || importMutation.isPending}>
              {importMutation.isPending ? "Checking..." : "Preview Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddParticipantDialog({ eventId, raceId }: { eventId: number, raceId: number }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ bibNumber: "", fullName: "", email: "", phone: "", gender: "M", ageCategory: "Open" });
  const createMutation = useCreateParticipant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = () => {
    createMutation.mutate(
      { eventId, raceId, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(eventId, raceId) });
          toast({ title: "Participant added" });
          setOpen(false);
          setFormData({ bibNumber: "", fullName: "", email: "", phone: "", gender: "M", ageCategory: "Open" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Failed to add participant", description: err.message })
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Manual</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>BIB Number</Label>
              <Input value={formData.bibNumber} onChange={e => setFormData(p => ({ ...p, bibNumber: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={formData.fullName} onChange={e => setFormData(p => ({ ...p, fullName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formData.fullName || !formData.email || createMutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useMemo, useState } from "react";
import {
  useListRaces,
  getListRacesQueryKey,
  useListParticipants,
  getListParticipantsQueryKey,
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
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { parseParticipantImportFile } from "@/organizerSetup";
import { Upload, Plus, Download, Trash2, Search } from "lucide-react";

const PARTICIPANT_TEMPLATE_HEADERS = [
  "bibNumber",
  "fullName",
  "email",
  "phone",
  "gender",
  "nationality",
  "ageCategory",
  "emergencyContact"
];

const PARTICIPANT_TEMPLATE_SAMPLE_ROWS = [
  ["101", "John Doe", "john@example.com", "08123456789", "Male", "ID", "Open", "Jane Doe 081200000001"],
  ["102", "Siti Rahma", "siti@example.com", "08129876543", "Female", "MY", "Master", "Ahmad 081200000002"]
];

function createParticipantTemplateCsv() {
  return [PARTICIPANT_TEMPLATE_HEADERS.join(","), ...PARTICIPANT_TEMPLATE_SAMPLE_ROWS.map((row) => row.join(","))].join("\n");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadParticipantTemplate(kind: "xlsx" | "csv") {
  if (kind === "csv") {
    downloadBlob("altix-participants-template.csv", new Blob([createParticipantTemplateCsv()], { type: "text/csv;charset=utf-8" }));
    return;
  }

  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([PARTICIPANT_TEMPLATE_HEADERS, ...PARTICIPANT_TEMPLATE_SAMPLE_ROWS]);
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 28 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 }
  ];
  worksheet["!autofilter"] = { ref: `A1:H${PARTICIPANT_TEMPLATE_SAMPLE_ROWS.length + 1}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  downloadBlob(
    "altix-participants-template.xlsx",
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
}

export function ParticipantsTab({ eventId }: { eventId: number }) {
  const { data: races } = useListRaces(eventId, { query: { enabled: !!eventId, queryKey: getListRacesQueryKey(eventId) } });
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const actualRaceId = selectedRaceId ? parseInt(selectedRaceId, 10) : races?.[0]?.id;

  const { data: participants, isLoading } = useListParticipants(eventId, actualRaceId as number, {
    query: { enabled: !!actualRaceId, queryKey: getListParticipantsQueryKey(eventId, actualRaceId as number) }
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteParticipant();

  const filteredParticipants = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return participants ?? [];
    }

    return (participants ?? []).filter((participant) =>
      [participant.bibNumber, participant.fullName, participant.email, participant.ageCategory, participant.gender, participant.countryCode]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [participants, searchQuery]);

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

        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedRaceId || (races?.[0]?.id.toString() || "")} onValueChange={setSelectedRaceId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select race..." />
            </SelectTrigger>
            <SelectContent>
              {races?.map((race) => (
                <SelectItem key={race.id} value={race.id.toString()}>{race.name} ({race.participantCount})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="gap-2" onClick={() => void downloadParticipantTemplate("xlsx")}>
            <Download className="h-4 w-4" /> Download Template
          </Button>

          {actualRaceId ? (
            <>
              <ImportDialog eventId={eventId} raceId={actualRaceId} />
              <AddParticipantDialog eventId={eventId} raceId={actualRaceId} />
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search participants..." className="pl-9 h-9" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Use the template CSV so every import follows the same column order.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>BIB</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredParticipants.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No participants found in this race.</TableCell></TableRow>
            ) : (
              filteredParticipants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell className="font-mono font-medium">{participant.bibNumber || "-"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{participant.fullName}</div>
                    <div className="text-xs text-muted-foreground">{participant.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm">{participant.countryCode || "ID"}</div>
                    <div className="text-xs text-muted-foreground">ISO-2 flag code</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{participant.gender || "-"}</div>
                    <div className="text-xs text-muted-foreground">{participant.ageCategory || "-"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={participant.status === "registered" ? "secondary" : "default"} className="uppercase text-[10px]">
                      {participant.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(participant.id)}>
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

function ImportDialog({ eventId, raceId }: { eventId: number; raceId: number }) {
  const [open, setOpen] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const importMutation = useImportParticipants();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTemplateDownload = (kind: "xlsx" | "csv") => {
    void downloadParticipantTemplate(kind).catch((error) =>
      toast({
        variant: "destructive",
        title: "Failed to download template",
        description: error instanceof Error ? error.message : "Please try again."
      })
    );
  };

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      const parsed = await parseParticipantImportFile(file);

      if (!parsed) {
        throw new Error("Unsupported file format. Use CSV or XLSX.");
      }

      setCsvData(parsed.text);
      setSourceFileName(parsed.fileName);
      setPreviewData(null);
      toast({ title: "Import file loaded", description: parsed.fileName });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to read import file",
        description: error instanceof Error ? error.message : "Please try another file."
      });
    }
  };

  const handlePreview = () => {
    importMutation.mutate(
      { eventId, raceId, data: { csvData, preview: true } },
      {
        onSuccess: (response) => setPreviewData(response),
        onError: (error: Error) => toast({ variant: "destructive", title: "Preview failed", description: error.message })
      }
    );
  };

  const handleApply = () => {
    importMutation.mutate(
      { eventId, raceId, data: { csvData, preview: false } },
      {
        onSuccess: (response) => {
          queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(eventId, raceId) });
          toast({ title: `Imported ${response.imported} participants successfully` });
          setOpen(false);
          setCsvData("");
          setSourceFileName(null);
          setPreviewData(null);
        },
        onError: (error: Error) => toast({ variant: "destructive", title: "Import failed", description: error.message })
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
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Required column order</p>
            <p>{PARTICIPANT_TEMPLATE_HEADERS.join(", ")}</p>
            <p className="mt-2">Use <code>nationality</code> as a 2-letter ISO code like <code>ID</code>, <code>MY</code>, or <code>SG</code> so spectator flags render correctly.</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button variant="link" className="px-0 h-auto" onClick={() => handleTemplateDownload("xlsx")}>
                Download template XLSX
              </Button>
              <Button variant="link" className="px-0 h-auto" onClick={() => handleTemplateDownload("csv")}>
                Download template CSV
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Upload Template File</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <label className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Upload CSV / XLSX
                  <input
                    accept=".csv,.tsv,.txt,.xlsx,.xls"
                    className="hidden"
                    onChange={(event) => {
                      void handleFileSelect(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
              </Button>
              <span className="text-xs text-muted-foreground">{sourceFileName ?? "No file selected yet."}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Paste or Review Tabular Data</Label>
            <Textarea
              rows={8}
              placeholder={createParticipantTemplateCsv()}
              value={csvData}
              onChange={(event) => setCsvData(event.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {previewData ? (
            <div className="bg-muted p-4 rounded-md text-sm">
              <h4 className="font-semibold mb-2">Preview Results</h4>
              <p className="text-green-600">Valid rows to import: {previewData.imported}</p>
              <p className="text-amber-600">Skipped (invalid): {previewData.skipped}</p>
              {previewData.errors.length > 0 ? (
                <ul className="mt-2 text-destructive text-xs list-disc list-inside pl-4">
                  {previewData.errors.slice(0, 3).map((error, index) => <li key={index}>{error}</li>)}
                  {previewData.errors.length > 3 ? <li>...and {previewData.errors.length - 3} more errors</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
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

function AddParticipantDialog({ eventId, raceId }: { eventId: number; raceId: number }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ bibNumber: "", fullName: "", email: "", phone: "", gender: "Male", countryCode: "ID", ageCategory: "Open" });
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
          setFormData({ bibNumber: "", fullName: "", email: "", phone: "", gender: "Male", countryCode: "ID", ageCategory: "Open" });
        },
        onError: (error: Error) => toast({ variant: "destructive", title: "Failed to add participant", description: error.message })
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
              <Input value={formData.bibNumber} onChange={(event) => setFormData((current) => ({ ...current, bibNumber: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={formData.fullName} onChange={(event) => setFormData((current) => ({ ...current, fullName: event.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={formData.email} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nationality (ISO-2)</Label>
              <Input maxLength={2} value={formData.countryCode} onChange={(event) => setFormData((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} placeholder="ID" />
            </div>
            <div className="space-y-2">
              <Label>Age Category</Label>
              <Input value={formData.ageCategory} onChange={(event) => setFormData((current) => ({ ...current, ageCategory: event.target.value }))} />
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

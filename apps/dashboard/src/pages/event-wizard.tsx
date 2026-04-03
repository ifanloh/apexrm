import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateEvent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, ChevronLeft, Mountain, Flag, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EventWizard() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateEvent();

  const [formData, setFormData] = useState({
    name: "",
    location: "",
    startDate: "",
    endDate: "",
    description: "",
    logoUrl: "",
    bannerUrl: "",
    firstRaceName: "10K Trail",
    firstRaceDistance: 10,
    firstRaceElevationGain: 500,
    firstRaceMaxParticipants: 200,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleNext = () => {
    if (step === 1 && (!formData.name || !formData.location)) {
      toast({ variant: "destructive", title: "Name and location are required" });
      return;
    }
    if (step === 3 && !formData.firstRaceName) {
      toast({ variant: "destructive", title: "Race name is required" });
      return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = () => {
    createMutation.mutate(
      { data: formData },
      {
        onSuccess: (event) => {
          toast({ title: "Event draft created successfully!" });
          setLocation(`/events/${event.id}`);
        },
        onError: (err: any) => {
          toast({ 
            variant: "destructive", 
            title: "Failed to create event",
            description: err.message
          });
        }
      }
    );
  };

  const steps = [
    { id: 1, title: "Basics", icon: Mountain },
    { id: 2, title: "Branding", icon: ImageIcon },
    { id: 3, title: "First Race", icon: Flag },
    { id: 4, title: "Review", icon: CheckCircle2 },
  ];

  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Create New Event</h1>
        <p className="text-muted-foreground mt-1">This wizard creates your initial draft.</p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10 rounded-full"></div>
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 rounded-full transition-all duration-300"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          ></div>
          
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <div key={s.id} className="flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isActive ? "bg-primary border-primary text-primary-foreground" : 
                  isCompleted ? "bg-primary border-primary text-primary-foreground" : 
                  "bg-card border-muted text-muted-foreground"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle>
            {step === 1 && "Event Basics"}
            {step === 2 && "Branding (Optional)"}
            {step === 3 && "First Race Category"}
            {step === 4 && "Review & Save Draft"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Tell us about the event overall."}
            {step === 2 && "Add a logo and banner to make it yours."}
            {step === 3 && "Every event needs at least one race distance. You can add more later."}
            {step === 4 && "Look over the details before creating the draft."}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <Label htmlFor="name">Event Name <span className="text-destructive">*</span></Label>
                <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Mount Rinjani Ultra 2025" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location <span className="text-destructive">*</span></Label>
                <Input id="location" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Senaru, Lombok" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" name="startDate" type="date" value={formData.startDate} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" name="endDate" type="date" value={formData.endDate} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" value={formData.description} onChange={handleChange} rows={4} placeholder="A short blurb about the event..." />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input id="logoUrl" name="logoUrl" value={formData.logoUrl} onChange={handleChange} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bannerUrl">Banner URL</Label>
                <Input id="bannerUrl" name="bannerUrl" value={formData.bannerUrl} onChange={handleChange} placeholder="https://..." />
                {formData.bannerUrl && (
                  <div className="mt-4 h-32 w-full rounded-md border bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${formData.bannerUrl})` }} />
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <Label htmlFor="firstRaceName">Race Name <span className="text-destructive">*</span></Label>
                <Input id="firstRaceName" name="firstRaceName" value={formData.firstRaceName} onChange={handleChange} placeholder="e.g. 50K Ultra" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstRaceDistance">Distance (km)</Label>
                  <Input id="firstRaceDistance" name="firstRaceDistance" type="number" min="1" value={formData.firstRaceDistance} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstRaceElevationGain">Elevation Gain (m)</Label>
                  <Input id="firstRaceElevationGain" name="firstRaceElevationGain" type="number" min="0" value={formData.firstRaceElevationGain} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstRaceMaxParticipants">Max Participants</Label>
                <Input id="firstRaceMaxParticipants" name="firstRaceMaxParticipants" type="number" min="1" value={formData.firstRaceMaxParticipants} onChange={handleChange} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-muted/30 p-4 rounded-lg border space-y-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-2">Event</h4>
                  <p className="font-semibold text-lg">{formData.name || "Unnamed Event"}</p>
                  <p className="text-muted-foreground">{formData.location}</p>
                </div>
                <div className="h-px w-full bg-border" />
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-2">First Race</h4>
                  <p className="font-semibold">{formData.firstRaceName}</p>
                  <p className="text-muted-foreground">{formData.firstRaceDistance}km • {formData.firstRaceElevationGain}m D+</p>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-4 rounded-lg text-sm border border-amber-200 dark:border-amber-900/50">
                After saving, you'll be taken to the dashboard where you can add checkpoints, configure scanner crew, and open registration.
              </div>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-between border-t bg-muted/10 p-6">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1 || createMutation.isPending}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          
          {step < 4 ? (
            <Button onClick={handleNext}>
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Save as Draft"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
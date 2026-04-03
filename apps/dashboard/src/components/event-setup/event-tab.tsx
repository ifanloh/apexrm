import { useState, useEffect } from "react";
import { useUpdateEvent, getGetEventQueryKey, type Event } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function EventTab({ event }: { event: Event }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateEvent();

  const [formData, setFormData] = useState({
    name: event.name || "",
    location: event.location || "",
    startDate: event.startDate || "",
    endDate: event.endDate || "",
    description: event.description || "",
    logoUrl: event.logoUrl || "",
    bannerUrl: event.bannerUrl || "",
  });

  useEffect(() => {
    setFormData({
      name: event.name || "",
      location: event.location || "",
      startDate: event.startDate || "",
      endDate: event.endDate || "",
      description: event.description || "",
      logoUrl: event.logoUrl || "",
      bannerUrl: event.bannerUrl || "",
    });
  }, [event]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = () => {
    updateMutation.mutate(
      { eventId: event.id, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(event.id) });
          toast({ title: "Event details updated successfully" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to update event details" });
        }
      }
    );
  };

  return (
    <div className="p-8 max-w-4xl space-y-8 animate-in fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Event Details</h2>
        <p className="text-muted-foreground mt-1">Manage the core information about this event.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>This information will be displayed publicly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Event Name <span className="text-destructive">*</span></Label>
            <Input id="name" name="name" value={formData.name} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location <span className="text-destructive">*</span></Label>
            <Input id="location" name="location" value={formData.location} onChange={handleChange} />
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
            <Textarea id="description" name="description" value={formData.description} onChange={handleChange} rows={5} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Make it yours with a logo and banner.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input id="logoUrl" name="logoUrl" value={formData.logoUrl} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bannerUrl">Banner URL</Label>
            <Input id="bannerUrl" name="bannerUrl" value={formData.bannerUrl} onChange={handleChange} />
            {formData.bannerUrl && (
              <div className="mt-4 h-48 w-full rounded-md border bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${formData.bannerUrl})` }} />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
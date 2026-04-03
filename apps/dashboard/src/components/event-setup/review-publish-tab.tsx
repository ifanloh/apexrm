import { 
  useGetEventSummary, getGetEventSummaryQueryKey,
  usePublishRace, useGoLiveRace,
  useListRaces, getListRacesQueryKey,
  getGetEventQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertTriangle, Rocket, PlayCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ReviewPublishTab({ eventId }: { eventId: number }) {
  const { data: summary, isLoading } = useGetEventSummary(eventId, { query: { enabled: !!eventId, queryKey: getGetEventSummaryQueryKey(eventId) } });
  const { data: races } = useListRaces(eventId, { query: { enabled: !!eventId, queryKey: getListRacesQueryKey(eventId) } });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const publishMutation = usePublishRace();
  const goLiveMutation = useGoLiveRace();

  const handlePublish = (raceId: number) => {
    publishMutation.mutate(
      { eventId, raceId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEventSummaryQueryKey(eventId) });
          queryClient.invalidateQueries({ queryKey: getListRacesQueryKey(eventId) });
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
          toast({ title: "Race published successfully!" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Cannot publish race", description: err.message })
      }
    );
  };

  const handleGoLive = (raceId: number) => {
    if (!confirm("Are you sure? Going live enables the Race Day Ops dashboard and allows scanner crew to start logging.")) return;
    goLiveMutation.mutate(
      { eventId, raceId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEventSummaryQueryKey(eventId) });
          queryClient.invalidateQueries({ queryKey: getListRacesQueryKey(eventId) });
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
          toast({ title: "Race is now LIVE!" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Cannot go live", description: err.message })
      }
    );
  };

  if (isLoading || !summary) return <div className="p-8">Loading...</div>;

  const allPassed = summary.readinessChecks.every(check => check.passed);

  return (
    <div className="p-8 max-w-4xl space-y-8 animate-in fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Review & Publish</h2>
        <p className="text-muted-foreground mt-1">Check readiness and publish races to the public.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-bold text-primary">{summary.totalRaces}</span>
            <span className="text-sm font-medium text-muted-foreground mt-1 uppercase tracking-wider">Total Races</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-bold text-primary">{summary.totalParticipants}</span>
            <span className="text-sm font-medium text-muted-foreground mt-1 uppercase tracking-wider">Participants</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-bold text-primary">{summary.totalScannerCrew}</span>
            <span className="text-sm font-medium text-muted-foreground mt-1 uppercase tracking-wider">Crew Accounts</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Readiness</CardTitle>
          <CardDescription>All checks must pass before a race can go live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!allPassed && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Action Required</AlertTitle>
              <AlertDescription>
                Some setup tasks are incomplete. You cannot start the race until these are resolved.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-3">
            {summary.readinessChecks.map((check, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-md border bg-muted/20">
                {check.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-sm">{check.label}</p>
                  {check.detail && <p className="text-xs text-muted-foreground mt-1">{check.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Race Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {races?.map(race => (
            <div key={race.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold">{race.name}</h4>
                <p className="text-sm text-muted-foreground">Status: <span className="uppercase font-medium">{race.status}</span></p>
              </div>
              <div className="flex gap-2">
                {race.status === 'draft' && (
                  <Button onClick={() => handlePublish(race.id)} disabled={publishMutation.isPending} className="gap-2">
                    <Rocket className="h-4 w-4" /> Publish Race
                  </Button>
                )}
                {race.status === 'upcoming' && (
                  <Button onClick={() => handleGoLive(race.id)} disabled={!allPassed || goLiveMutation.isPending} variant="default" className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                    <PlayCircle className="h-4 w-4" /> Go Live
                  </Button>
                )}
                {race.status === 'live' && (
                  <Button disabled variant="outline" className="border-green-600 text-green-600">Race is Live</Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
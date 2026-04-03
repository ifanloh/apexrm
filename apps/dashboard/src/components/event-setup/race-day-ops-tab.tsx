import { useState } from "react";
import { 
  useListRaces, getListRacesQueryKey,
  useGetRaceDayStatus, getGetRaceDayStatusQueryKey,
  useListScans, getListScansQueryKey
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, ShieldAlert, CheckCircle2, Navigation } from "lucide-react";

export function RaceDayOpsTab({ eventId }: { eventId: number }) {
  const { data: races } = useListRaces(eventId, { query: { enabled: !!eventId, queryKey: getListRacesQueryKey(eventId) } });
  
  // Filter only live or upcoming races for ops
  const activeRaces = races?.filter(r => r.status === 'live' || r.status === 'upcoming') || [];
  
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const actualRaceId = selectedRaceId ? parseInt(selectedRaceId) : activeRaces?.[0]?.id;

  const { data: status } = useGetRaceDayStatus(eventId, actualRaceId as number, {
    query: {
      enabled: !!actualRaceId,
      queryKey: getGetRaceDayStatusQueryKey(eventId, actualRaceId as number),
      refetchInterval: 10000 // 10s auto-refresh
    }
  });

  const { data: scans } = useListScans(eventId, actualRaceId as number, {
    query: {
      enabled: !!actualRaceId,
      queryKey: getListScansQueryKey(eventId, actualRaceId as number),
      refetchInterval: 10000
    }
  });

  if (!activeRaces.length) {
    return (
      <div className="p-12 text-center text-stone-400">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-stone-200">No active races</h2>
        <p>You need to publish a race and set it to 'Live' before Race Day Ops becomes active.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 animate-in fade-in bg-stone-950 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Race Day Operations</h2>
          <p className="text-stone-400 mt-1">Live tracking and command center.</p>
        </div>
        
        <Select value={selectedRaceId || (activeRaces[0]?.id.toString() || "")} onValueChange={setSelectedRaceId}>
          <SelectTrigger className="w-[250px] bg-stone-900 border-stone-800 text-stone-200">
            <SelectValue placeholder="Select active race..." />
          </SelectTrigger>
          <SelectContent className="bg-stone-900 border-stone-800 text-stone-200">
            {activeRaces.map(r => (
              <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-stone-900 border-stone-800">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-stone-400 mb-1">Total Runners</p>
                <p className="text-3xl font-bold text-white">{status.totalParticipants}</p>
              </CardContent>
            </Card>
            <Card className="bg-stone-900 border-stone-800">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-stone-400 mb-1">On Course</p>
                <p className="text-3xl font-bold text-amber-500">{status.scannedIn - status.finished - status.dnf}</p>
              </CardContent>
            </Card>
            <Card className="bg-stone-900 border-stone-800">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-stone-400 mb-1">Finished</p>
                <p className="text-3xl font-bold text-green-500">{status.finished}</p>
              </CardContent>
            </Card>
            <Card className="bg-stone-900 border-stone-800">
              <CardContent className="p-6">
                <p className="text-sm font-medium text-stone-400 mb-1">DNF</p>
                <p className="text-3xl font-bold text-stone-500">{status.dnf}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2">
                <Navigation className="h-5 w-5 text-primary" /> Route Status
              </h3>
              <div className="grid gap-3">
                {status.checkpoints.map(cp => (
                  <div key={cp.checkpointId} className="flex items-center justify-between p-4 rounded-lg border border-stone-800 bg-stone-900/50">
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center h-10 w-10 rounded-full font-bold ${cp.isFinishLine ? 'bg-amber-500/20 text-amber-500' : 'bg-stone-800 text-stone-300'}`}>
                        {cp.orderIndex}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-stone-200">{cp.name}</h4>
                          {cp.isFinishLine && <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">FINISH</Badge>}
                        </div>
                        <p className="text-xs text-stone-500 mt-1">Crew: {cp.assignedCrew || 'None'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-8 text-right">
                      <div>
                        <p className="text-xs text-stone-500 mb-1">Total Scans</p>
                        <p className="font-mono text-lg font-medium text-stone-300">{cp.scanCount}</p>
                      </div>
                      <div className="w-32">
                        <p className="text-xs text-stone-500 mb-1">Last Scan</p>
                        <p className="text-sm text-stone-300 flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {cp.lastScanAt ? new Date(cp.lastScanAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" /> Live Feed
              </h3>
              <Card className="bg-stone-900 border-stone-800 h-[500px] overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-0">
                  {scans?.length === 0 ? (
                    <div className="p-8 text-center text-stone-500 text-sm">Waiting for scans...</div>
                  ) : (
                    <div className="divide-y divide-stone-800">
                      {scans?.slice(0, 50).map(scan => (
                        <div key={scan.id} className="p-3 hover:bg-stone-800/50 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-stone-200">{scan.bibNumber}</span>
                              {scan.isDuplicate && (
                                <ShieldAlert className="h-3 w-3 text-destructive" />
                              )}
                            </div>
                            <span className="text-[10px] text-stone-500 font-mono">
                              {new Date(scan.scannedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                            </span>
                          </div>
                          <div className="text-sm text-stone-400 truncate">{scan.participantName}</div>
                          <div className="text-xs text-primary mt-1 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> {scan.checkpointName}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
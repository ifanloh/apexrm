import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetEvent } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Info, Flag, Users, ScanLine, CheckSquare, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Import tabs
import { EventTab } from "@/components/event-setup/event-tab";
import { RacesTab } from "@/components/event-setup/races-tab";
import { ParticipantsTab } from "@/components/event-setup/participants-tab";
import { ScannerCrewTab } from "@/components/event-setup/scanner-crew-tab";
import { ReviewPublishTab } from "@/components/event-setup/review-publish-tab";
import { RaceDayOpsTab } from "@/components/event-setup/race-day-ops-tab";

type TabValue = 'event' | 'races' | 'participants' | 'crew' | 'publish' | 'ops';

export default function EventSetup() {
  const [, params] = useRoute("/events/:eventId");
  const eventId = params?.eventId ? parseInt(params.eventId) : 0;
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabValue>('event');

  const { data: event, isLoading } = useGetEvent(eventId, {
    query: {
      enabled: !!eventId
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)]">
        <div className="w-64 border-r p-4 space-y-4">
          <Skeleton className="h-8 w-3/4 mb-8" />
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-12 w-1/3 mb-6" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-4">Event not found</h2>
        <Button onClick={() => setLocation("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  const tabs = [
    { id: 'event', label: 'Event Details', icon: Info },
    { id: 'races', label: 'Races & Checkpoints', icon: Flag },
    { id: 'participants', label: 'Participants', icon: Users },
    { id: 'crew', label: 'Scanner Crew', icon: ScanLine },
    { id: 'publish', label: 'Review & Publish', icon: CheckSquare },
    { id: 'ops', label: 'Race Day Ops', icon: Activity, isSpecial: true },
  ];

  const isRaceDayMode = activeTab === 'ops';

  return (
    <div className={`flex h-[calc(100vh-4rem)] transition-colors duration-300 ${isRaceDayMode ? 'bg-stone-950 dark:bg-black text-stone-100' : 'bg-background'}`}>
      {/* Sidebar */}
      <div className={`w-64 flex flex-col border-r ${isRaceDayMode ? 'border-stone-800 bg-stone-900/50' : 'bg-card'}`}>
        <div className="p-4 border-b">
          <Button variant="ghost" className={`w-full justify-start mb-4 ${isRaceDayMode ? 'text-stone-400 hover:text-white hover:bg-stone-800' : ''}`} onClick={() => setLocation("/")}>
            <ChevronLeft className="h-4 w-4 mr-2" /> All Events
          </Button>
          <div className="space-y-1">
            <h2 className={`font-semibold line-clamp-1 ${isRaceDayMode ? 'text-white' : ''}`}>{event.name}</h2>
            <Badge variant="secondary" className="uppercase text-[10px] tracking-wider">
              {event.status}
            </Badge>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            if (tab.isSpecial) {
              return (
                <div key={tab.id} className="pt-4 mt-4 border-t border-border">
                  <button
                    onClick={() => setActiveTab(tab.id as TabValue)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-amber-500/20 text-amber-500' 
                        : isRaceDayMode 
                          ? 'text-stone-400 hover:bg-stone-800 hover:text-stone-200' 
                          : 'text-amber-600 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-950/30'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                </div>
              );
            }
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabValue)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? isRaceDayMode ? 'bg-stone-800 text-white' : 'bg-secondary text-secondary-foreground' 
                    : isRaceDayMode 
                      ? 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 overflow-y-auto ${isRaceDayMode ? 'dark' : ''}`}>
        {activeTab === 'event' && <EventTab event={event} />}
        {activeTab === 'races' && <RacesTab eventId={event.id} />}
        {activeTab === 'participants' && <ParticipantsTab eventId={event.id} />}
        {activeTab === 'crew' && <ScannerCrewTab eventId={event.id} />}
        {activeTab === 'publish' && <ReviewPublishTab eventId={event.id} />}
        {activeTab === 'ops' && <RaceDayOpsTab eventId={event.id} />}
      </div>
    </div>
  );
}
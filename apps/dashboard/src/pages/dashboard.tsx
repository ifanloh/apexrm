import { useListEvents, useDeleteEvent, useDuplicateEvent, getListEventsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, MapPin, Calendar, MoreHorizontal, Settings, Copy, Archive, Mountain } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: events, isLoading } = useListEvents();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const deleteMutation = useDeleteEvent();
  const duplicateMutation = useDuplicateEvent();

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to archive this event?")) return;
    deleteMutation.mutate(
      { eventId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          toast({ title: "Event archived successfully" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to archive event" });
        }
      }
    );
  };

  const handleDuplicate = (id: number) => {
    duplicateMutation.mutate(
      { eventId: id },
      {
        onSuccess: (newEvent) => {
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          toast({ title: "Event duplicated successfully" });
          setLocation(`/events/${newEvent.id}`);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to duplicate event" });
        }
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300';
      case 'upcoming': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300';
      case 'live': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300';
      case 'finished': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300';
      case 'archived': return 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Events</h1>
          <p className="text-muted-foreground mt-1">Manage your upcoming and past trail races.</p>
        </div>
        <Link href="/events/new">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Event
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <Card key={i} className="overflow-hidden">
              <div className="h-32 bg-muted/50 w-full" />
              <CardHeader className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : events?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <Calendar className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No events found</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            Get started by creating your first trail race event. The guided wizard will help you set everything up.
          </p>
          <Link href="/events/new">
            <Button size="lg" className="gap-2">
              <PlusCircle className="h-5 w-5" />
              Create Your First Event
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events?.map((event) => (
            <Card key={event.id} className="flex flex-col hover:shadow-md transition-shadow duration-200">
              <div 
                className="h-32 w-full bg-muted bg-cover bg-center"
                style={{ backgroundImage: event.bannerUrl ? `url(${event.bannerUrl})` : 'none' }}
              >
                {!event.bannerUrl && (
                  <div className="h-full w-full flex items-center justify-center bg-primary/5">
                    <Mountain className="h-10 w-10 text-primary/20" />
                  </div>
                )}
              </div>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className={getStatusColor(event.status)}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setLocation(`/events/${event.id}`)}>
                        <Settings className="h-4 w-4 mr-2" /> Manage
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(event.id)}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(event.id)}
                      >
                        <Archive className="h-4 w-4 mr-2" /> Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="line-clamp-1">{event.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">{event.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>
                    {event.startDate ? format(new Date(event.startDate), 'MMM d, yyyy') : 'No date set'}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/20 pt-4 pb-4">
                <Link href={`/events/${event.id}`} className="w-full">
                  <Button variant="secondary" className="w-full">
                    Open Event
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
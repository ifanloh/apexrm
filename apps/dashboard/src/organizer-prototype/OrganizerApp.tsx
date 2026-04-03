import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router as WouterRouter, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import EventWizard from "@/pages/event-wizard";
import EventSetup from "@/pages/event-setup";
import organizerCssText from "@/organizer-prototype.css?inline";
import { OrganizerPrototypeProvider, type User } from "@/organizer-prototype/api";

const queryClient = new QueryClient();

function ShadowMount({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const shadow = hostRef.current.shadowRoot ?? hostRef.current.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = organizerCssText;
    const mountNode = document.createElement("div");
    mountNode.className = "organizer-prototype-root";
    shadow.append(style, mountNode);
    setContainer(mountNode);
    return () => {
      setContainer(null);
      shadow.innerHTML = "";
    };
  }, []);

  return (
    <div className="organizer-prototype-host flex min-h-0 flex-1 flex-col" ref={hostRef}>
      {container ? createPortal(children, container) : null}
    </div>
  );
}

export function OrganizerPrototypeApp({
  user,
  onLogout,
  initialPath = "/"
}: {
  user: User;
  onLogout: () => void;
  initialPath?: string;
}) {
  const memory = useMemo(() => memoryLocation({ path: initialPath }), []);

  useEffect(() => {
    memory.navigate(initialPath, { replace: true });
  }, [initialPath, memory]);

  return (
    <ShadowMount>
      <QueryClientProvider client={queryClient}>
        <OrganizerPrototypeProvider onLogout={onLogout} user={user}>
          <AuthProvider logout={onLogout} user={user}>
            <WouterRouter hook={memory.hook} searchHook={memory.searchHook}>
              <Switch>
                <Route path="/">
                  <Layout>
                    <Dashboard />
                  </Layout>
                </Route>
                <Route path="/events/new">
                  <Layout>
                    <EventWizard />
                  </Layout>
                </Route>
                <Route path="/events/:eventId">
                  <Layout>
                    <EventSetup />
                  </Layout>
                </Route>
              </Switch>
              <Toaster />
            </WouterRouter>
          </AuthProvider>
        </OrganizerPrototypeProvider>
      </QueryClientProvider>
    </ShadowMount>
  );
}

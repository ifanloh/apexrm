export function getOrganizerPortalContainer() {
  if (typeof document === "undefined") {
    return undefined;
  }

  for (const host of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    const container = host.shadowRoot?.querySelector<HTMLElement>(".organizer-prototype-root");
    if (container) {
      return container;
    }
  }

  return undefined;
}

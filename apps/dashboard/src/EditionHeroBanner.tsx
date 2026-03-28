type Props = {
  brandStack: string[];
  editionLabel: string;
  dateRibbon: string;
  locationRibbon: string;
  bannerTagline: string;
  homeSubtitle: string;
  className?: string;
};

export function EditionHeroBanner({
  brandStack,
  editionLabel,
  dateRibbon,
  locationRibbon,
  bannerTagline,
  homeSubtitle,
  className
}: Props) {
  return (
    <article className={`panel edition-banner-panel ${className ?? ""}`.trim()}>
      <div className="edition-banner-copy">
        <span className="status-chip active">{editionLabel}</span>
        <strong>{bannerTagline}</strong>
        <h2>
          {brandStack.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>
        <p>{homeSubtitle}</p>
      </div>
      <div className="edition-banner-ribbons">
        <span>{dateRibbon}</span>
        <span>{locationRibbon}</span>
      </div>
    </article>
  );
}

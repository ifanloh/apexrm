import type { CSSProperties } from "react";

type Props = {
  brandStack: string[];
  editionLabel: string;
  dateRibbon: string;
  locationRibbon: string;
  bannerTagline: string;
  homeSubtitle: string;
  backgroundImageUrl?: string | null;
  className?: string;
};

export function EditionHeroBanner({
  brandStack,
  editionLabel,
  dateRibbon,
  locationRibbon,
  bannerTagline,
  homeSubtitle,
  backgroundImageUrl,
  className
}: Props) {
  const style = backgroundImageUrl
    ? ({
        "--edition-hero-image": `url("${backgroundImageUrl}")`
      } as CSSProperties)
    : undefined;

  return (
    <article className={`panel edition-banner-panel ${backgroundImageUrl ? "has-custom-image" : ""} ${className ?? ""}`.trim()} style={style}>
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

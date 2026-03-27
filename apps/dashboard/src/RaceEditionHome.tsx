import type { CSSProperties } from "react";
import type { DemoRaceCard, DemoRaceRankingPreview } from "./demoRaceFestival";

type RaceHomeCard = DemoRaceCard & {
  rankingPreview: DemoRaceRankingPreview[];
  isLive?: boolean;
  isSelected?: boolean;
};

type Props = {
  brandStack: string[];
  editionLabel: string;
  dateRibbon: string;
  locationRibbon: string;
  bannerTagline: string;
  homeTitle: string;
  homeSubtitle: string;
  cards: RaceHomeCard[];
  onOpenRace: (slug: string) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildSparkline(seed: number) {
  const width = 280;
  const height = 84;
  const baseline = 62;
  const points = Array.from({ length: 15 }, (_, index) => {
    const ratio = index / 14;
    const x = ratio * width;
    const wave =
      Math.sin((index + seed) * 0.8) * 12 +
      Math.cos((index + seed * 1.7) * 0.45) * 11 +
      Math.sin((index + seed * 0.35) * 1.35) * 7;
    const y = clamp(baseline - wave, 18, 68);
    return { x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return {
    width,
    height,
    linePath,
    areaPath
  };
}

export function RaceEditionHome({
  brandStack,
  editionLabel,
  dateRibbon,
  locationRibbon,
  bannerTagline,
  homeTitle,
  homeSubtitle,
  cards,
  onOpenRace
}: Props) {
  return (
    <section className="edition-home-shell" id="edition-home">
      <article className="panel edition-banner-panel">
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

      <div className="edition-home-header">
        <div>
          <p className="section-label">Race Edition</p>
          <h3>{homeTitle}</h3>
        </div>
        <p>{homeSubtitle}</p>
      </div>

      <div className="race-card-grid" role="list" aria-label="Race categories">
        {cards.map((card) => {
          const sparkline = buildSparkline(card.profileSeed);
          const cardStyle = {
            "--race-accent": card.accent,
            "--race-accent-soft": card.accentSoft
          } as CSSProperties;

          return (
            <article
              className={`race-card ${card.isSelected ? "selected" : ""}`}
              key={card.slug}
              role="listitem"
              style={cardStyle}
            >
              <div className="race-card-topline">
                <span className={`race-status-pill ${card.isLive ? "live" : ""}`}>{card.isLive ? "Live" : card.editionLabel}</span>
              </div>

              <div className="race-card-head">
                <h4>{card.title}</h4>
                <span>{card.scheduleLabel}</span>
              </div>

              <div className="race-card-stats">
                <div>
                  <span>Start</span>
                  <strong>{card.startTown}</strong>
                </div>
                <div>
                  <span>Distance</span>
                  <strong>{card.distanceKm.toFixed(1)} KM</strong>
                </div>
                <div>
                  <span>Ascent</span>
                  <strong>{card.ascentM} M+</strong>
                </div>
              </div>

              <div className="race-card-profile">
                <svg className="race-card-profile-svg" viewBox={`0 0 ${sparkline.width} ${sparkline.height}`} role="img" aria-label={`${card.title} profile`}>
                  <path className="race-card-profile-area" d={sparkline.areaPath} />
                  <path className="race-card-profile-line" d={sparkline.linePath} />
                </svg>
              </div>

              <div className="race-card-summary">
                <div className="race-card-summary-item success">
                  <span>Finishers</span>
                  <strong>{card.finishers}</strong>
                </div>
                <div className="race-card-summary-item danger">
                  <span>DNF</span>
                  <strong>{card.dnf}</strong>
                </div>
              </div>

              <div className="race-card-ranking">
                <div className="race-card-ranking-head">
                  <strong>Ranking</strong>
                  <div className="race-card-segments">
                    <span className="active">Overall</span>
                    <span>Women</span>
                  </div>
                </div>

                {card.rankingPreview.length ? (
                  <div className="race-card-ranking-list">
                    {card.rankingPreview.slice(0, 3).map((entry) => (
                      <div className="race-card-ranking-row" key={`${card.slug}-${entry.rank}-${entry.bib}`}>
                        <strong>{entry.rank}</strong>
                        <div className="race-card-runner">
                          <span>{entry.name}</span>
                          <small>{entry.status}</small>
                        </div>
                        <time>{entry.gap}</time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="race-card-empty">No ranking race</div>
                )}
              </div>

              <button className="race-card-cta" onClick={() => onOpenRace(card.slug)} type="button">
                Open Race Live
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

import type { CSSProperties } from "react";
import type { DemoRaceCard, DemoRaceRankingPreview } from "./demoRaceFestival";
import { EditionHeroBanner } from "./EditionHeroBanner";
import { getOrganizerRaceStateTone, isOrganizerRaceFinishedState, isOrganizerRaceLiveState, isOrganizerRaceUpcomingState } from "./organizerSetup";
import podium1stIcon from "./assets/podium-1st.svg";
import podium2ndIcon from "./assets/podium-2nd.svg";
import podium3rdIcon from "./assets/podium-3rd.svg";

type RaceHomeCard = DemoRaceCard & {
  rankingPreview: DemoRaceRankingPreview[];
  modeLabel?: string;
  modeSummary?: string;
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
  heroBackgroundImageUrl?: string | null;
  cards: RaceHomeCard[];
  onOpenRace: (slug: string) => void;
  showHeroBanner?: boolean;
  showHomeHeader?: boolean;
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

function buildSparklineFromProfile(profilePoints: DemoRaceCard["profilePoints"], seed: number) {
  if (!profilePoints || profilePoints.length < 2) {
    return buildSparkline(seed);
  }

  const width = 280;
  const height = 84;
  const topPadding = 8;
  const bottomPadding = 18;
  const minKm = profilePoints[0]?.km ?? 0;
  const maxKm = profilePoints[profilePoints.length - 1]?.km ?? minKm + 1;
  const minEle = Math.min(...profilePoints.map((point) => point.ele));
  const maxEle = Math.max(...profilePoints.map((point) => point.ele));
  const kmSpan = Math.max(maxKm - minKm, 0.1);
  const eleSpan = Math.max(maxEle - minEle, 1);
  const drawableHeight = height - topPadding - bottomPadding;

  const points = profilePoints.map((point) => {
    const x = ((point.km - minKm) / kmSpan) * width;
    const normalizedEle = (point.ele - minEle) / eleSpan;
    const y = topPadding + (1 - normalizedEle) * drawableHeight;
    return {
      x: Number(x.toFixed(1)),
      y: Number(clamp(y, topPadding, height - bottomPadding).toFixed(1))
    };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return {
    width,
    height,
    linePath,
    areaPath
  };
}

function parseClockDuration(value: string) {
  const normalized = value.trim().replace(/^\+/, "");
  const parts = normalized.split(":").map((part) => Number.parseInt(part, 10));

  if (!parts.length || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function formatClockDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function getPreviewDisplayTime(entry: DemoRaceRankingPreview, index: number, preview: DemoRaceRankingPreview[]) {
  const leaderSeconds = parseClockDuration(preview[0]?.gap ?? "");

  if (index === 0 || !entry.gap.startsWith("+") || leaderSeconds === null) {
    return entry.gap.replace(/^\+/, "");
  }

  const deltaSeconds = parseClockDuration(entry.gap);

  if (deltaSeconds === null) {
    return entry.gap.replace(/^\+/, "");
  }

  return formatClockDuration(leaderSeconds + deltaSeconds);
}

function getPreviewStatusLabel(entry: DemoRaceRankingPreview, isLiveCard: boolean) {
  if (entry.status === "No ranking") {
    return "DNF";
  }

  if (entry.checkpointId === "finish" || entry.status === "Finisher") {
    return "Finisher";
  }

  if (isLiveCard) {
    if (entry.checkpointId === "cp-start") {
      return "Depart";
    }

    return entry.checkpointCode ?? entry.checkpointName ?? "In race";
  }

  return "In race";
}

function getRaceCardCtaLabel(editionLabel: string) {
  if (isOrganizerRaceLiveState(editionLabel)) {
    return "Open Race Live";
  }

  if (isOrganizerRaceFinishedState(editionLabel)) {
    return "View Results";
  }

  return "View Course";
}

function PreviewPodium({ rank }: { rank: number }) {
  const icon = rank === 1 ? podium1stIcon : rank === 2 ? podium2ndIcon : rank === 3 ? podium3rdIcon : null;

  if (!icon) {
    return null;
  }

  return (
    <span className="race-card-podium" aria-hidden="true">
      <img alt="" src={icon} />
    </span>
  );
}

export function RaceEditionHome({
  brandStack,
  editionLabel,
  dateRibbon,
  locationRibbon,
  bannerTagline,
  homeTitle,
  homeSubtitle,
  heroBackgroundImageUrl,
  cards,
  onOpenRace,
  showHeroBanner = true,
  showHomeHeader = true
}: Props) {
  return (
    <section className={`edition-home-shell ${!showHeroBanner && !showHomeHeader ? "cards-only" : ""}`.trim()} id="edition-home">
      {showHeroBanner ? (
        <EditionHeroBanner
          bannerTagline={bannerTagline}
          brandStack={brandStack}
          dateRibbon={dateRibbon}
          editionLabel={editionLabel}
          backgroundImageUrl={heroBackgroundImageUrl}
          homeSubtitle={homeSubtitle}
          locationRibbon={locationRibbon}
        />
      ) : null}

      {showHomeHeader ? (
        <div className="edition-home-header">
          <div>
            <p className="section-label">Race Edition</p>
            <h3>{homeTitle}</h3>
          </div>
          <p>{homeSubtitle}</p>
        </div>
      ) : null}

      <div className="race-card-grid" role="list" aria-label="Race categories">
        {!cards.length ? (
          <article className="race-card-grid-empty" role="listitem">
            <span className="detail-label">No published races yet</span>
            <h4>Race categories will appear here after the organizer publishes them.</h4>
            <p>Organizers can keep their event in draft while they finish branding, categories, crew setup, and participant import.</p>
          </article>
        ) : null}
        {cards.map((card) => {
          const cardStateTone = getOrganizerRaceStateTone(card.editionLabel);
          const isLiveCard = cardStateTone === "live";
          const isFinishedCard = cardStateTone === "finished";
          const isUpcomingCard = isOrganizerRaceUpcomingState(card.editionLabel);
          const sparkline = buildSparklineFromProfile(card.profilePoints, card.profileSeed);
          const cardStyle = {
            "--race-accent": card.accent,
            "--race-accent-soft": card.accentSoft
          } as CSSProperties;

          return (
            <article
              className={`race-card ${card.isSelected ? "selected" : ""} ${
                isLiveCard ? "race-card-live" : isFinishedCard ? "race-card-finished" : "race-card-upcoming"
              }`}
              key={card.slug}
              role="listitem"
              style={cardStyle}
            >
              <div className="race-card-topline">
                <span className={`race-status-pill ${isLiveCard ? "live-card" : isFinishedCard ? "finished-card" : "upcoming-card"}`}>
                  {isLiveCard ? "LIVE" : isFinishedCard ? "FINISHED" : "UPCOMING"}
                </span>
                {card.modeLabel ? <span className="race-status-pill neutral-card">{card.modeLabel}</span> : null}
              </div>

              <div className="race-card-head">
                <h4>{card.title}</h4>
                <span>{card.scheduleLabel}</span>
              </div>
              {card.modeSummary ? <p className="race-card-mode-copy">{card.modeSummary}</p> : null}

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
                  <strong>{isLiveCard ? "Leading" : isFinishedCard ? "Ranking" : "Starting soon"}</strong>
                  <div className="race-card-segments">
                    <span className="active">Overall</span>
                    <span>Women</span>
                  </div>
                </div>

                {isUpcomingCard ? (
                  <div className="race-card-empty">Course info is ready. Live timing will appear after the race starts.</div>
                ) : card.rankingPreview.length ? (
                  <div className="race-card-ranking-list">
                    {card.rankingPreview.slice(0, 3).map((entry, index) => (
                      <div className="race-card-ranking-row" key={`${card.slug}-${entry.rank}-${entry.bib}`}>
                        <strong>
                          {entry.rank}
                          {!isLiveCard ? <PreviewPodium rank={entry.rank} /> : null}
                        </strong>
                        <div className="race-card-runner">
                          <span>{entry.name}</span>
                          <small>{getPreviewStatusLabel(entry, isLiveCard)}</small>
                        </div>
                        <time>{getPreviewDisplayTime(entry, index, card.rankingPreview)}</time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="race-card-empty">No ranking race</div>
                )}
              </div>

              <button className="race-card-cta" onClick={() => onOpenRace(card.slug)} type="button">
                {getRaceCardCtaLabel(card.editionLabel)}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

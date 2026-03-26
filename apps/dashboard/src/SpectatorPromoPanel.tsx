export function SpectatorPromoPanel() {
  return (
    <section className="spectator-promo-panel">
      <div className="spectator-promo-qr" aria-hidden="true">
        <div className="spectator-promo-qr-grid" />
      </div>

      <div className="spectator-promo-copy">
        <span className="spectator-promo-kicker">LiveTrail App</span>
        <h3>An essential app for runners and support crew</h3>
        <p>
          All the information to optimize your race experience and share the adventure with followers thanks to real-time
          rankings, passings, course views, and event-day updates.
        </p>
        <div className="spectator-promo-actions">
          <button className="store-button" type="button">
            App Store
          </button>
          <button className="store-button" type="button">
            Google Play
          </button>
        </div>
      </div>

      <div className="spectator-promo-phone" aria-hidden="true">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="phone-card" />
          <div className="phone-card" />
          <div className="phone-card tall" />
        </div>
      </div>
    </section>
  );
}

export function SpectatorPromoPanel() {
  return (
    <section className="spectator-promo-panel">
      <div className="spectator-promo-qr" aria-hidden="true">
        <div className="spectator-promo-qr-grid" />
      </div>

      <div className="spectator-promo-copy">
        <span className="spectator-promo-kicker">LiveTrail-style Race Hub</span>
        <h3>An essential app for runners and support crew</h3>
        <p>
          Semua informasi race untuk penonton, crew, dan organizer dalam satu hub live. Ikuti ranking, passings, course
          profile, dan update race tanpa perlu berpindah halaman.
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

export function SpectatorPromoPanel() {
  return (
    <section className="spectator-promo-panel">
      <div className="spectator-promo-qr" aria-hidden="true">
        <div className="spectator-promo-qr-grid" />
      </div>

      <div className="spectator-promo-copy">
        <span className="spectator-promo-kicker">Altix App</span>
        <h3>An essential app for runners and support crew</h3>
        <p>
          All the information to optimize your race management and share the adventure with your followers thanks to
          real-time tracking and numerous predictions. Be ready to experience the event as intensely as possible!
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

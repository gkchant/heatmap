export default function HeaderSection({
  statusText,
  markerCounts,
  yellowOltAverages,
  compact,
}) {
  const marqueeItems = yellowOltAverages
    ? [...yellowOltAverages, ...yellowOltAverages]
    : [];
  return (
    <header className={`app__header${compact ? " app__header--compact" : ""}`}>
      <div className="header-row">
        {markerCounts ? <div className="counts-box">{markerCounts}</div> : null}
      </div>
      <p>{statusText}</p>
      {yellowOltAverages && yellowOltAverages.length ? (
        <div className="olt-summary">
          <div className="marquee">
            <div className="marquee__track">
              {marqueeItems.map((item, idx) => (
                <span
                  className="marquee__item"
                  key={`${item.olt}-${item.slot}-${item.port}-${idx}`}
                >
                  OLT: {item.olt} | Slot: {item.slot} | Port: {item.port} | TX avg:{" "}
                  {item.txAvg} dBm | RX avg: {item.rxAvg} dBm ({item.count})
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

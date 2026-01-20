export default function SearchBar({
  city,
  setCity,
  fdaSelections,
  setFdaSelections,
  fdaOptions,
  fdaOpen,
  setFdaOpen,
  fdaRef,
  fdhSelections,
  setFdhSelections,
  fdhOptions,
  fdhOpen,
  setFdhOpen,
  fdhRef,
  dropFilter,
  setDropFilter,
  status,
  onSearch,
  handleLightLevel,
  lightConfig,
  lightLoading,
  autoLightEnabled,
  setAutoLightEnabled,
  autoLightSeconds,
  setAutoLightSeconds,
  ontFilter,
  setOntFilter,
  oltFilter,
  setOltFilter,
  powerFilter,
  setPowerFilter,
}) {
  return (
    <form
      className="search-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <label htmlFor="cityInput">City</label>
      <select
        id="cityInput"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      >
        <option value="Arlington">Arlington</option>
        <option value="McKinney">McKinney</option>
        <option value="Rockwall">Rockwall</option>
      </select>
      <label>FDA</label>
      <div className="dropdown" ref={fdaRef}>
        <button
          type="button"
          className="dropdown-toggle"
          onClick={() => setFdaOpen((open) => !open)}
        >
          {fdaSelections.length === 0
            ? "Any"
            : `${fdaSelections.length} selected`}
          <span className="caret">▾</span>
        </button>
        {fdaOpen && (
          <div className="dropdown-panel">
            {fdaOptions.length === 0 ? (
              <span className="muted">No FDA options</span>
            ) : (
              fdaOptions.map((opt) => (
                <label key={opt} className="checkbox-item">
                  <input
                    type="checkbox"
                    value={opt}
                    checked={fdaSelections.includes(opt)}
                    onChange={(e) => {
                      const { checked, value } = e.target;
                      setFdaSelections((prev) =>
                        checked
                          ? [...prev, value]
                          : prev.filter((v) => v !== value),
                      );
                    }}
                  />
                  {opt}
                </label>
              ))
            )}
          </div>
        )}
      </div>
      <label>FDH</label>
      <div className="dropdown" ref={fdhRef}>
        <button
          type="button"
          className="dropdown-toggle"
          onClick={() => setFdhOpen((open) => !open)}
        >
          {fdhSelections.length === 0
            ? "Any"
            : `${fdhSelections.length} selected`}
          <span className="caret">▾</span>
        </button>
        {fdhOpen && (
          <div className="dropdown-panel">
            {fdhOptions.length === 0 ? (
              <span className="muted">No FDH options</span>
            ) : (
              fdhOptions.map((opt) => (
                <label key={opt} className="checkbox-item">
                  <input
                    type="checkbox"
                    value={opt}
                    checked={fdhSelections.includes(opt)}
                    onChange={(e) => {
                      const { checked, value } = e.target;
                      setFdhSelections((prev) =>
                        checked
                          ? [...prev, value]
                          : prev.filter((v) => v !== value),
                      );
                    }}
                  />
                  {opt}
                </label>
              ))
            )}
          </div>
        )}
      </div>
      <label htmlFor="dropFilter">Drop</label>
      <select
        id="dropFilter"
        value={dropFilter}
        onChange={(e) => setDropFilter(e.target.value)}
      >
        <option value="any">Any</option>
        <option value="completed">Completed</option>
        <option value="notcompleted">Not completed</option>
      </select>
      <button type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Searching…" : "Search"}
        </button>
      <input
        type="text"
        placeholder="ONT search"
        value={ontFilter}
        onChange={(e) => setOntFilter(e.target.value)}
        style={{ minWidth: "140px", padding: "6px 8px" }}
      />
      <input
        type="text"
        placeholder="OLT search"
        value={oltFilter}
        onChange={(e) => setOltFilter(e.target.value)}
        style={{ minWidth: "140px", padding: "6px 8px" }}
      />
      <select
        value={powerFilter}
        onChange={(e) => setPowerFilter(e.target.value)}
        style={{ padding: "6px 8px" }}
      >
        <option value="all">All</option>
        <option value="red">Red - Offline</option>
        <option value="purple">Purple - Suspended</option>
        <option value="black">Black - Inactive</option>
        <option value="blue">Blue - Drop Completed - No ONT</option>
        <option value="gray">Gray - Drop not done</option>
        <option value="yellow">Yellow - Low light</option>
        <option value="green">Green - Online</option>
      </select>
      <button
        type="button"
        className="light-button"
        onClick={handleLightLevel}
        disabled={!lightConfig || lightLoading}
      >
        {lightLoading ? (
          <span className="spinner-wrap">
            <span className="spinner" aria-hidden="true" />
            Running…
          </span>
        ) : (
          "Light Level"
        )}
      </button>
      <div className="auto-light-row">
        <label className="checkbox-item" style={{ gap: "6px" }}>
          <input
            type="checkbox"
            checked={autoLightEnabled}
            onChange={(e) => setAutoLightEnabled(e.target.checked)}
            disabled={!lightConfig}
          />
          Auto
        </label>
        <select
          value={autoLightSeconds}
          onChange={(e) => setAutoLightSeconds(Number(e.target.value) || 0)}
          disabled={!lightConfig || !autoLightEnabled}
          aria-label="Auto light interval (minutes)"
          style={{ padding: "6px 8px", width: "110px" }}
        >
          <option value={900}>15 min</option>
          <option value={1800}>30 min</option>
          <option value={2700}>45 min</option>
          <option value={3600}>60 min</option>
        </select>
      </div>
    </form>
  );
}

export default function HeaderSection({
  statusText,
  filterSummary,
  markerCounts,
}) {
  return (
    <header className="app__header">
      <h1>Novos Map</h1>
      <p>{statusText}</p>
      {markerCounts ? <p>{markerCounts}</p> : null}
      {filterSummary ? <p>{filterSummary}</p> : null}
    </header>
  );
}

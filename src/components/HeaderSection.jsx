export default function HeaderSection({
  statusText,
  filterSummary,
}) {
  return (
    <header className="app__header">
      <h1>Novos Map</h1>
      <p>{statusText}</p>
      {filterSummary ? <p>{filterSummary}</p> : null}
    </header>
  );
}

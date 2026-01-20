import { MapContainer, CircleMarker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Default marker icons for Leaflet in Vite.
L.Marker.prototype.options.icon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const startPosition = [32.7, -97.0]; // Texas center-ish

const normalizeCpeName = (value) => {
  if (!value) return "";
  const lower = String(value).toLowerCase().trim();
  const parts = lower.split("_");
  return parts[0] || lower;
};

const findLightMatch = (entries, cpeValue) => {
  const cpeKey = normalizeCpeName(cpeValue);
  if (!cpeKey) return null;
  return (
    entries.find((entry) => {
      const entryKey = normalizeCpeName(entry.name);
      return entryKey && entryKey === cpeKey;
    }) || null
  );
};

export default function MapView({ points, lightEntries, markerColorForPoint }) {
  return (
    <div className="map-shell">
      <MapContainer
        center={startPosition}
        zoom={10}
        scrollWheelZoom
        className="map-shell__map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => {
          const color = markerColorForPoint
            ? markerColorForPoint(point)
            : (() => {
                const completed = point.dropCompleted === true;
                let hasLight = false;
                let lowLight = false;
                if (point.accounts && point.accounts.length > 0 && lightEntries.length > 0) {
                  for (const acct of point.accounts) {
                    const match = findLightMatch(lightEntries, acct.value);
                    if (match && match["rx-power"] !== undefined) {
                      hasLight = true;
                      const rx = Number(match["rx-power"]);
                      if (!Number.isNaN(rx) && rx <= -22.9) {
                        lowLight = true;
                        break;
                      }
                    }
                  }
                }
                const suspended =
                  point.accounts &&
                  point.accounts.some(
                    (acct) =>
                      String(acct.account_status_id) === "4" ||
                      (acct.account_status_text || "").toLowerCase() === "suspended",
                  );
                const hasRunLight = lightEntries.length > 0;
                return suspended
                  ? "#9333ea"
                  : !completed
                    ? "#9ca3af"
                    : hasRunLight
                      ? !hasLight
                        ? "#dc2626"
                        : lowLight
                          ? "#facc15"
                          : "#16a34a"
                      : "#16a34a";
              })();
          return (
            <CircleMarker
              key={point.id}
              center={point.position}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.85 }}
              radius={10}
            >
              <Popup>
                <strong>{point.name}</strong>
                <br />
                {point.addressId ? (
                  <>
                    Address ID: {point.addressId}
                    <br />
                  </>
                ) : null}
                {point.line1}
                {point.line2 ? (
                  <>
                    <br />
                    {point.line2}
                  </>
                ) : null}
                {point.fdaFdh ? (
                  <>
                    <br />
                    {point.fdaFdh.includes("|")
                      ? (() => {
                          const [fdaPart, fdhPart] = point.fdaFdh.split("|");
                          return (
                            <>
                              FDA: {fdaPart.replace("FDA:", "")} | FDH:{" "}
                              {fdhPart.replace("FDH:", "")}
                            </>
                          );
                        })()
                      : `FDA: ${point.fdaFdh}`}
                  </>
                ) : null}
                {point.dropCompleted !== undefined ? (
                  <>
                    <br />
                    Drop: {point.dropCompleted ? "Completed" : "Not completed"}
                  </>
                ) : null}
                {point.accounts && point.accounts.length > 0 ? (() => {
                  const grouped = point.accounts.reduce((acc, acct) => {
                    const key = acct.account_id || "unknown";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(acct);
                    return acc;
                  }, {});
                  const groupedArr = Object.entries(grouped).map(([accountId, items]) => ({
                    accountId,
                    items,
                  }));
                  return (
                    <>
                      <br />
                      {groupedArr.map((group) => (
                        <div key={group.accountId} style={{ marginTop: "4px" }}>
                          Account ID: {group.accountId}
                          {group.items[0]?.account_status_id ? (
                            <>
                              <br />
                              Account Status:{" "}
                              {group.items[0].account_status_text ||
                                group.items[0].account_status_id}
                            </>
                          ) : null}
                          <br />
                          CPE:
                          <ul className="account-list">
                            {(() => {
                              const unique = [];
                              const seen = new Set();
                              group.items.forEach((item) => {
                                const key = `${item.inventory_model}|||${item.value}`;
                                if (!seen.has(key)) {
                                  seen.add(key);
                                  unique.push(item);
                                }
                              });
                              return unique.slice(0, 5).map((item, idx) => {
                                const match = findLightMatch(lightEntries, item.value);
                                return (
                                  <li
                                    key={`${group.accountId}-${item.inventory_model}-${item.value}-${idx}`}
                                  >
                                    {item.inventory_model}: {item.value}
                                    {match ? (
                                      <div className="muted" style={{ marginTop: "2px" }}>
                                        OLT: {match.olt || "n/a"}
                                        <br />
                                        OLT Slot: {match.slot}
                                        <br />
                                        Port: {match.port}
                                        <br />
                                        RX @ OLT: {match["rx-power-olt"] ?? "n/a"} dBm
                                        <br />
                                        Fiber distance: {match["fiber-distance"] ?? "n/a"} km
                                        <br />
                                        TX power: {match["tx-power"] ?? "n/a"} dBm
                                        <br />
                                        RX power: {match["rx-power"] ?? "n/a"} dBm
                                        <br />
                                        TX bias current: {match["tx-bias-current"] ?? "n/a"} mA
                                        <br />
                                        TX bias temp: {match["tx-bias-temperature"] ?? "n/a"} °C
                                        <br />
                                        Module voltage: {match["module-voltage"] ?? "n/a"} V
                                        <br />
                                        Module temp: {match["module-temperature"] ?? "n/a"} °C
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              });
                            })()}
                            {(() => {
                              const uniqueCount = new Set(
                                group.items.map(
                                  (item) => `${item.inventory_model}|||${item.value}`,
                                ),
                              ).size;
                              return uniqueCount > 5 ? (
                                <li className="muted">
                                  +{uniqueCount - 5} more
                                </li>
                              ) : null;
                            })()}
                          </ul>
                        </div>
                      ))}
                    </>
                  );
                })() : null}
                {point.latitude && point.longitude ? (
                  <>
                    <br />
                    Lat/Lng: {point.latitude}, {point.longitude}
                  </>
                ) : null}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

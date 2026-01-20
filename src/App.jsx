import { useEffect, useRef, useState } from "react";
import "./index.css";
import HeaderSection from "./components/HeaderSection";
import SearchBar from "./components/SearchBar";
import MapView from "./components/MapView";
const apiUrl =
  import.meta.env.VITE_API_URL || "http://localhost:4500/points";

// Fallback sample points if API fails.
const samplePoints = [
  {
    id: "ferry-building",
    name: "Ferry Building",
    position: [37.7955, -122.3937],
    info: "Farmers market & food hall.",
  },
  {
    id: "dolores-park",
    name: "Dolores Park",
    position: [37.7596, -122.4269],
    info: "Great for picnics with a view.",
  },
  {
    id: "gg-park",
    name: "Golden Gate Park",
    position: [37.7694, -122.4862],
    info: "Gardens, trails, and museums.",
  },
];

export default function App() {
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState("idle");
  const [statusText, setStatusText] = useState(
    "Select a city and one or more FDA/FDH values, then search to load markers.",
  );
  const [city, setCity] = useState("Arlington");
  const [fdaSelections, setFdaSelections] = useState([]);
  const [fdhSelections, setFdhSelections] = useState([]);
  const [fdaOptions, setFdaOptions] = useState([]);
  const [fdhOptions, setFdhOptions] = useState([]);
  const [fdaOpen, setFdaOpen] = useState(false);
  const [fdhOpen, setFdhOpen] = useState(false);
  const [dropFilter, setDropFilter] = useState("any");
  const [statusSelections, setStatusSelections] = useState([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ontFilter, setOntFilter] = useState("");
  const [oltFilter, setOltFilter] = useState("");
  const [powerFilter, setPowerFilter] = useState("all"); // all, red, yellow, green
  const statusOptions = [
    { id: 1, label: "Active" },
    { id: 2, label: "Inactive" },
    { id: 4, label: "Suspended" },
    { id: 39, label: "Scheduled" },
    { id: 75, label: "Test ONT" },
  ];
  const [lightConfig, setLightConfig] = useState(null);
  const [lightStatus, setLightStatus] = useState("");
  const [lightEntries, setLightEntries] = useState([]);
  const [runAllLight] = useState(true);
  const [lightLoading, setLightLoading] = useState(false);
  const [autoLightEnabled, setAutoLightEnabled] = useState(false);
  const [autoLightSeconds, setAutoLightSeconds] = useState(900); // default 15 minutes
  const autoLightTimer = useRef(null);
  const fdaRef = useRef(null);
  const fdhRef = useRef(null);
  const statusRef = useRef(null);
  // Normalize CPE/optic identifiers for matching: lowercase and strip anything after "_".
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

  const markerColorForPoint = (point) => {
    const completed = point.dropCompleted === true;
    let hasLight = false;
    let lowLight = false;
    if (point.accounts && point.accounts.length > 0 && lightEntries.length > 0) {
      for (const acct of point.accounts) {
        const match = findLightMatch(lightEntries, acct.value);
        if (match && match["rx-power"] !== undefined) {
          hasLight = true;
          const rx = Number(match["rx-power"]);
          if (!Number.isNaN(rx) && rx <= -24.9) {
            lowLight = true;
            break;
          }
        }
      }
    }
    const inactive =
      point.accounts &&
      point.accounts.some(
        (acct) =>
          String(acct.account_status_id) === "2" ||
          (acct.account_status_text || "").toLowerCase() === "inactive",
      );
    const hasStatus =
      point.accounts &&
      point.accounts.some((acct) => acct.account_status_id);
    const suspended =
      point.accounts &&
      point.accounts.some(
        (acct) =>
          String(acct.account_status_id) === "4" ||
          (acct.account_status_text || "").toLowerCase() === "suspended",
      );
    const hasRunLight = lightEntries.length > 0;
    if (inactive) return "#111827";
    if (suspended) return "#9333ea";
    if (!completed) return "#9ca3af";
    if (completed && !hasStatus) return "#2563eb";
    if (hasRunLight) {
      if (!hasLight) return "#dc2626";
      if (lowLight) return "#facc15";
      return "#16a34a";
    }
    return "#16a34a";
  };
  const allowedOltsByCity = (cityName, olts) => {
    if (!olts || !Array.isArray(olts)) return [];
    if (cityName === "Arlington") return olts.filter((o) => o.startsWith("DFW2-"));
    if (cityName === "McKinney") return olts.filter((o) => o.startsWith("DFW3-"));
    if (cityName === "Rockwall") return olts.filter((o) => o.startsWith("DFW4-"));
    return olts;
  };

  const normalizeFda = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const numeric = trimmed.match(/^\d{1,3}$/);
    if (numeric) {
      return `FDA:${numeric[0].padStart(3, "0")}`;
    }
    const fdaPrefix = trimmed.match(/^FDA:(\d{1,3})$/i);
    if (fdaPrefix) {
      return `FDA:${fdaPrefix[1].padStart(3, "0")}`;
    }
    return trimmed;
  };

  const normalizeFdh = (value) => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    const numeric = trimmed.match(/^\d{1,3}$/);
    if (numeric) {
      return `FDH:${numeric[0].padStart(3, "0")}`;
    }
    const fdhPrefix = trimmed.match(/^FDH:?\s*(\d{1,3})$/i);
    if (fdhPrefix) {
      return `FDH:${fdhPrefix[1].padStart(3, "0")}`;
    }
    return trimmed;
  };

  const buildUrl = (
    path,
    cityFilter,
    fdaList,
    fdhList,
    dropValue,
    statusList,
  ) => {
    let url;
    const normalizedList = (fdaList || [])
      .map((v) => normalizeFda(v || ""))
      .filter(Boolean);
    const fdhNormalized = (fdhList || [])
      .map((v) => normalizeFdh(v || ""))
      .filter(Boolean);
    const dropNormalized =
      dropValue && dropValue !== "any" ? dropValue : "";
    const statusNormalized = (statusList || [])
      .map((v) => String(v).trim())
      .filter(Boolean);
    try {
      const u = new URL(apiUrl);
      u.pathname = path;
      u.search = "";
      if (cityFilter && cityFilter.trim().length > 0) {
        u.searchParams.set("city", cityFilter.trim());
      }
      normalizedList.forEach((v) => u.searchParams.append("fda", v));
      fdhNormalized.forEach((v) => u.searchParams.append("fdh", v));
      if (dropNormalized) {
        u.searchParams.set("drop", dropNormalized);
      }
      statusNormalized.forEach((v) => u.searchParams.append("status", v));
      url = u.toString();
    } catch (e) {
      url = apiUrl.replace(/\/points.*/, path);
      const parts = [];
      if (cityFilter && cityFilter.trim().length > 0) {
        parts.push(`city=${encodeURIComponent(cityFilter.trim())}`);
      }
      normalizedList.forEach((v) =>
        parts.push(`fda=${encodeURIComponent(v)}`),
      );
      fdhNormalized.forEach((v) =>
        parts.push(`fdh=${encodeURIComponent(v)}`),
      );
      if (dropNormalized) {
        parts.push(`drop=${encodeURIComponent(dropNormalized)}`);
      }
      statusNormalized.forEach((v) =>
        parts.push(`status=${encodeURIComponent(v)}`),
      );
      if (parts.length) {
        url += (url.includes("?") ? "&" : "?") + parts.join("&");
      }
    }
    return url;
  };

  const fetchPoints = (
    cityFilter,
    fdaList,
    fdhList,
    dropValue,
    statusList,
  ) => {
    const normalizedList = (fdaList || [])
      .map((v) => normalizeFda(v || ""))
      .filter(Boolean);
    const fdhNormalized = (fdhList || [])
      .map((v) => normalizeFdh(v || ""))
      .filter(Boolean);
    const dropNormalized =
      dropValue && dropValue !== "any" ? dropValue : "";
    const statusNormalized = (statusList || []).map((v) => String(v));
    setFdaOpen(false);
    setFdhOpen(false);
    setStatus("loading");
    const descParts = [];
    if (cityFilter) descParts.push(cityFilter);
    if (normalizedList.length)
      descParts.push(`FDA in [${normalizedList.join(", ")}]`);
    if (fdhNormalized.length)
      descParts.push(`FDH in [${fdhNormalized.join(", ")}]`);
    if (dropNormalized)
      descParts.push(
        dropNormalized === "completed" ? "Drop: Completed" : "Drop: Not completed",
      );
    if (statusNormalized.length)
      descParts.push(`Account Status in [${statusNormalized.join(", ")}]`);
    const desc = descParts.length ? descParts.join(" + ") : "points";
    setStatusText(`Loading ${desc}…`);
    const url = buildUrl(
      "/points",
      cityFilter,
      normalizedList,
      fdhNormalized,
      dropNormalized,
      statusNormalized,
    );

    fetch(url)
      .then((res) => res.json())
      .then((rows) => {
        const normalized = rows
          .filter((row) => row.latitude && row.longitude)
          .map((row) => ({
            id: row.id ?? `${row.latitude}-${row.longitude}`,
            name: row.city || "Point",
            position: [row.latitude, row.longitude],
            info: row.address || "",
            addressId: row.id,
            line1: row.address,
            line2: row.unit, // aliased in API
            subdivision: row.state, // aliased in API
            zip: row.zip,
            latitude: row.latitude,
            longitude: row.longitude,
            fdaFdh: row.fda_fdh,
            dropCompleted: Number(row.drop_status) === 1,
            accounts: Array.isArray(row.accounts) ? row.accounts : [],
          }));

        if (normalized.length === 0) {
          setStatus("error");
          setStatusText("No results for that city.");
        } else {
          setStatus("loaded");
          setStatusText(`Showing ${normalized.length} locations.`);
        }
        setPoints(normalized);
      })
      .catch((err) => {
        console.error(`Failed to load points from API (${url}).`, err);
        setStatus("error");
        setStatusText("Could not load points. Showing sample markers.");
        const sample = samplePoints.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          info: p.info,
          addressId: p.id,
          line1: p.info,
          latitude: p.position[0],
          longitude: p.position[1],
          dropCompleted: false,
        }));
        setPoints(sample);
      });
  };

  const fetchFdaOptions = (cityFilter) => {
    const url = buildUrl("/fda-options", cityFilter, [], [], "", []);
    fetch(url)
      .then((res) => res.json())
      .then((rows) => {
        setFdaOptions(rows || []);
        setFdaSelections([]);
      })
      .catch((err) => {
        console.error(`Failed to load FDA options from API (${url}).`, err);
        setFdaOptions([]);
        setFdaSelections([]);
      });
  };

  const fetchFdhOptions = (cityFilter, fdaList) => {
    const url = buildUrl("/fdh-options", cityFilter, fdaList, [], "", []);
    fetch(url)
      .then((res) => res.json())
      .then((rows) => {
        const normalized = (rows || [])
          .map((v) => normalizeFdh(v))
          .filter(Boolean);
        setFdhOptions(Array.from(new Set(normalized)));
        setFdhSelections([]);
      })
      .catch((err) => {
        console.error(`Failed to load FDH options from API (${url}).`, err);
        setFdhOptions([]);
        setFdhSelections([]);
      });
  };

  useEffect(() => {
    fetchFdaOptions(city);
  }, [city]);

  useEffect(() => {
    fetchFdhOptions(city, fdaSelections);
  }, [city, fdaSelections]);

  useEffect(() => {
    const handler = (e) => {
      const targets = [
        { open: fdaOpen, ref: fdaRef, close: () => setFdaOpen(false) },
        { open: fdhOpen, ref: fdhRef, close: () => setFdhOpen(false) },
        { open: statusOpen, ref: statusRef, close: () => setStatusOpen(false) },
      ];
      targets.forEach(({ open, ref, close }) => {
        if (open && ref.current && !ref.current.contains(e.target)) {
          close();
        }
      });
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fdaOpen, fdhOpen, statusOpen]);

  // Auto light runner
  useEffect(() => {
    if (autoLightTimer.current) {
      clearInterval(autoLightTimer.current);
      autoLightTimer.current = null;
    }
    if (autoLightEnabled && lightConfig && autoLightSeconds > 0) {
      autoLightTimer.current = setInterval(() => {
        if (!lightLoading) {
          handleLightLevel();
        }
      }, autoLightSeconds * 1000);
    }
    return () => {
      if (autoLightTimer.current) {
        clearInterval(autoLightTimer.current);
        autoLightTimer.current = null;
      }
    };
  }, [autoLightEnabled, autoLightSeconds, lightConfig, lightLoading]);

  // Derived filtered points based on ont/olt filters.
  const filteredPoints = points.filter((p) => {
    const ont = ontFilter.trim().toLowerCase();
    const olt = oltFilter.trim().toLowerCase();
    const canFilterOlt = lightEntries.length > 0;
    const color = markerColorForPoint(p);
    let ontMatch = true;
    let oltMatch = true;
    if (ont) {
      ontMatch =
        lightEntries.length > 0 &&
        (p.accounts || []).some(
          (acct) =>
            (acct.value && acct.value.toLowerCase().includes(ont)) ||
            (acct.inventory_model &&
              acct.inventory_model.toLowerCase().includes(ont)),
        );
    }
    if (olt && canFilterOlt) {
      // Require a light entry match with the given OLT string
      oltMatch = (p.accounts || []).some((acct) => {
        const match = findLightMatch(lightEntries, acct.value);
        return (
          match &&
          match.olt &&
          String(match.olt).toLowerCase().includes(olt)
        );
      });
    }
    let powerMatch = true;
    if (powerFilter === "red") powerMatch = color === "#dc2626";
    if (powerFilter === "purple") powerMatch = color === "#9333ea";
    if (powerFilter === "black") powerMatch = color === "#111827";
    if (powerFilter === "blue") powerMatch = color === "#2563eb";
    if (powerFilter === "gray") powerMatch = color === "#9ca3af";
    if (powerFilter === "yellow") powerMatch = color === "#facc15";
    if (powerFilter === "green") powerMatch = color === "#16a34a";
    return ontMatch && oltMatch && powerMatch;
  });

  useEffect(() => {
    const originFromApi = (() => {
      try {
        return new URL(apiUrl).origin;
      } catch {
        return window.location.origin;
      }
    })();
    fetch(`${originFromApi}/light-config`)
      .then((res) => res.json())
      .then((cfg) => {
        setLightConfig(cfg);
      })
      .catch((err) => {
        console.error("Failed to load light config", err);
        setLightStatus("Could not load light config.");
      });
  }, []);

  const handleLightLevel = (e) => {
    e?.preventDefault();
    const originFromApi = (() => {
      try {
        return new URL(apiUrl).origin;
      } catch {
        return window.location.origin;
      }
    })();
    const allOlts = allowedOltsByCity(city, lightConfig?.olts || []);
    const oltsToUse = allOlts;
    const slotsToUse = lightConfig?.slots || [];
    const portsToUse = [];
    const min = lightConfig?.minPort || 1;
    const max = lightConfig?.maxPort || 16;
    for (let p = min; p <= max; p++) portsToUse.push(p);
    if (oltsToUse.length === 0 || slotsToUse.length === 0 || portsToUse.length === 0) {
      setLightStatus("No allowed OLT/slot/port combos for this city.");
      return;
    }

    const comboCount = oltsToUse.length * slotsToUse.length * portsToUse.length;
    setLightStatus(`Loading light level for ${comboCount} combo(s)...`);
    setLightLoading(true);
    const tasksPayloads = [];
    oltsToUse.forEach((o) => {
      tasksPayloads.push({
        olt: o,
        slot: slotsToUse,
        port: portsToUse,
      });
    });

    const runTask = (payload) =>
      fetch(`${originFromApi}/light-level`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => res.json().then((data) => ({ ok: res.ok, data })));

    Promise.all(tasksPayloads.map(runTask))
      .then((allResponses) => {
        const entries = [];
        const addOptic = (opt, meta = {}) => {
          if (!opt || typeof opt !== "object") return;
          entries.push({ ...meta, ...opt });
        };
        const addCollection = (collection, meta = {}) => {
          if (!collection) return;
          if (Array.isArray(collection)) {
            collection.forEach((opt) => addOptic(opt, meta));
          } else if (typeof collection === "object") {
            addOptic(collection, meta);
          }
        };
        const processSource = (source, meta) => {
          if (!source || typeof source !== "object") return;
          addCollection(source["ont-optics"], meta);
          const pon = source["pon-optics"];
          if (Array.isArray(pon)) {
            pon.forEach((opt) => {
              addOptic(opt, meta);
              if (opt && typeof opt === "object") {
                addCollection(opt["ont-optics"], meta);
              }
            });
          } else if (pon && typeof pon === "object") {
            addOptic(pon, meta);
            addCollection(pon["ont-optics"], meta);
          }
        };

        let okCount = 0;
        allResponses.forEach((resp, idx) => {
          const payload = tasksPayloads[idx];
          if (!resp.ok) return;
          okCount += 1;
          const payloadSlots = Array.isArray(payload.slot)
            ? payload.slot
            : [payload.slot];
          const payloadPorts = Array.isArray(payload.port)
            ? payload.port
            : [payload.port];

          if (Array.isArray(resp.data)) {
            resp.data.forEach((row) => {
              const meta = {
                olt: payload.olt,
                slot: row.slot || payloadSlots?.[0],
                port: row.port || payloadPorts?.[0],
              };
              processSource(row?.data?.parsed, meta);
              processSource(row?.data, meta);
            });
          }
        });

        setLightEntries(entries);
        const totalOk = okCount;
        const totalCombos = comboCount;
        setLightStatus(
          entries.length
            ? `${entries.length} optic result(s) loaded (${totalOk}/${tasksPayloads.length} requests ok; ${totalCombos} combos)`
            : `No optic results returned (${totalOk}/${tasksPayloads.length} requests ok; ${totalCombos} combos)`,
        );
      })
      .catch((err) => {
        console.error("Light level error", err);
        setLightStatus("Failed to fetch light level");
      })
      .finally(() => {
        setLightLoading(false);
      });
  };

  const filterSummary = (() => {
    const parts = [];
    if (fdaSelections.length) parts.push(`FDA: ${fdaSelections.join(", ")}`);
    if (fdhSelections.length) parts.push(`FDH: ${fdhSelections.join(", ")}`);
    if (dropFilter !== "any") {
      parts.push(
        `Drop: ${
          dropFilter === "completed" ? "Completed" : "Not completed"
        }`,
      );
    }
    if (ontFilter.trim()) parts.push(`ONT contains "${ontFilter.trim()}"`);
    if (oltFilter.trim()) parts.push(`OLT contains "${oltFilter.trim()}"`);
    if (powerFilter !== "all") {
      const label =
        powerFilter === "red"
          ? "Red markers"
          : powerFilter === "yellow"
            ? "Yellow markers"
            : "Green markers";
      parts.push(label);
    }
    return parts.length ? `Filters — ${parts.join(" | ")}` : null;
  })();

  const markerCounts = (() => {
    const counts = {
      black: 0,
      blue: 0,
      red: 0,
      yellow: 0,
      green: 0,
      gray: 0,
      purple: 0,
    };
    filteredPoints.forEach((point) => {
      const color = markerColorForPoint(point);
      if (color === "#111827") counts.black += 1;
      else if (color === "#2563eb") counts.blue += 1;
      else if (color === "#dc2626") counts.red += 1;
      else if (color === "#facc15") counts.yellow += 1;
      else if (color === "#16a34a") counts.green += 1;
      else if (color === "#9ca3af") counts.gray += 1;
      else if (color === "#9333ea") counts.purple += 1;
    });
    return `Online: ${counts.green} | Low light: ${counts.yellow} | Offline: ${counts.red} | Suspended: ${counts.purple} | Inactive: ${counts.black} | Drop done no acct: ${counts.blue} | Drop not completed: ${counts.gray}`;
  })();

  return (
    <div className="app">
      <HeaderSection
        statusText={statusText}
        filterSummary={filterSummary}
        lightEntries={lightEntries}
        points={filteredPoints}
        markerCounts={markerCounts}
      />

      <SearchBar
        city={city}
        setCity={setCity}
        fdaSelections={fdaSelections}
        setFdaSelections={setFdaSelections}
        fdaOptions={fdaOptions}
        fdaOpen={fdaOpen}
        setFdaOpen={setFdaOpen}
        fdaRef={fdaRef}
        fdhSelections={fdhSelections}
        setFdhSelections={setFdhSelections}
        fdhOptions={fdhOptions}
        fdhOpen={fdhOpen}
        setFdhOpen={setFdhOpen}
        fdhRef={fdhRef}
        dropFilter={dropFilter}
        setDropFilter={setDropFilter}
        statusSelections={statusSelections}
        setStatusSelections={setStatusSelections}
        statusOptions={statusOptions}
        statusOpen={statusOpen}
        setStatusOpen={setStatusOpen}
        statusRef={statusRef}
        status={status}
        onSearch={() =>
          fetchPoints(
            city,
            fdaSelections,
            fdhSelections,
            dropFilter,
            statusSelections,
          )
        }
        handleLightLevel={handleLightLevel}
        lightConfig={lightConfig}
        lightLoading={lightLoading}
        autoLightEnabled={autoLightEnabled}
        setAutoLightEnabled={setAutoLightEnabled}
        autoLightSeconds={autoLightSeconds}
        setAutoLightSeconds={setAutoLightSeconds}
        ontFilter={ontFilter}
        setOntFilter={setOntFilter}
        oltFilter={oltFilter}
        setOltFilter={setOltFilter}
        powerFilter={powerFilter}
        setPowerFilter={setPowerFilter}
      />

      <MapView
        points={filteredPoints}
        lightEntries={lightEntries}
        markerColorForPoint={markerColorForPoint}
      />
    </div>
  );
}

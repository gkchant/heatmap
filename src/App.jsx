import { useEffect, useRef, useState } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import "./index.css";
import HeaderSection from "./components/HeaderSection";
import SearchBar from "./components/SearchBar";
import MapView from "./components/MapView";
import { loginRequest } from "./authConfig";
const apiUrl =
  import.meta.env.VITE_API_URL || "https://heatmap-nov.duckdns.org/api"; // "http://localhost:4500/points"; 

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
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const hasClientId = Boolean(import.meta.env.VITE_MSAL_CLIENT_ID);
  const activeAccount =
    instance.getActiveAccount() || (accounts.length ? accounts[0] : null);
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState("idle");
  const [headerCompact, setHeaderCompact] = useState(false);
  const [statusText, setStatusText] = useState(
    "",
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
  const [manualOlt, setManualOlt] = useState("");
  const [manualSlot, setManualSlot] = useState("");
  const [manualPorts, setManualPorts] = useState("");
  const autoLightTimer = useRef(null);
  const fdaRef = useRef(null);
  const fdhRef = useRef(null);
  const statusRef = useRef(null);

  useEffect(() => {
    if (!instance.getActiveAccount() && accounts.length > 0) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  useEffect(() => {
    const allowed = allowedOltsByCity(city, lightConfig?.olts || []);
    if (allowed.length > 0 && !allowed.includes(manualOlt)) {
      setManualOlt(allowed[0]);
    }
  }, [city, lightConfig, manualOlt]);

  useEffect(() => {
    const slots = lightConfig?.slots || [];
    if (slots.length > 0 && !slots.includes(manualSlot)) {
      setManualSlot(slots[0]);
    }
  }, [lightConfig, manualSlot]);

  const handleLogin = () => {
    if (!hasClientId) return;
    instance.loginRedirect(loginRequest).catch((err) => {
      console.error("Microsoft login failed", err);
    });
  };

  const handleLogout = () => {
    instance.logoutRedirect().catch((err) => {
      console.error("Microsoft logout failed", err);
    });
  };
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

  const buildPortRange = (minPort, maxPort) => {
    const min = Number.isFinite(minPort) ? minPort : 1;
    const max = Number.isFinite(maxPort) ? maxPort : min;
    const ports = [];
    for (let p = min; p <= max; p++) ports.push(p);
    return ports;
  };

  const parsePortInput = (value, minPort, maxPort) => {
    if (!value || !value.trim()) return [];
    const min = Number.isFinite(minPort) ? minPort : 1;
    const max = Number.isFinite(maxPort) ? maxPort : min;
    const ports = new Set();
    const parts = value.split(/[,\s]+/).filter(Boolean);
    parts.forEach((part) => {
      const range = part.split("-").map((v) => Number(v));
      if (range.length === 2 && Number.isFinite(range[0]) && Number.isFinite(range[1])) {
        const start = Math.min(range[0], range[1]);
        const end = Math.max(range[0], range[1]);
        for (let p = start; p <= end; p++) {
          if (p >= min && p <= max) ports.add(p);
        }
      } else if (range.length === 1 && Number.isFinite(range[0])) {
        const port = range[0];
        if (port >= min && port <= max) ports.add(port);
      }
    });
    return Array.from(ports).sort((a, b) => a - b);
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
      // Preserve any base pathname like "/api" and append the endpoint.
      u.pathname = `${u.pathname.replace(/\/$/, "")}${path}`;
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
      url = apiUrl.replace(/\/$/, "") + path;
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
        setStatusText("");
        }
        setPoints(normalized);
      })
      .catch((err) => {
        console.error(`Failed to load points from API (${url}).`, err);
        setStatus("error");
        setStatusText("");
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
    const lightConfigUrl = (() => {
      try {
        const u = new URL(apiUrl);
        return `${u.origin}${u.pathname.replace(/\/$/, "")}/light-config`;
      } catch {
        return `${apiUrl.replace(/\/$/, "")}/light-config`;
      }
    })();
    fetch(lightConfigUrl)
      .then((res) => res.json())
      .then((cfg) => {
        setLightConfig(cfg);
      })
      .catch((err) => {
        console.error("Failed to load light config", err);
        setLightStatus("Could not load light config.");
      });
  }, []);

  const runLightLevel = (oltsToUse, slotsToUse, portsToUse, label) => {
    const lightLevelUrl = (() => {
      try {
        const u = new URL(apiUrl);
        return `${u.origin}${u.pathname.replace(/\/$/, "")}/light-level`;
      } catch {
        return `${apiUrl.replace(/\/$/, "")}/light-level`;
      }
    })();
    if (oltsToUse.length === 0 || slotsToUse.length === 0 || portsToUse.length === 0) {
      setLightStatus("No allowed OLT/slot/port combos for this city.");
      return;
    }

    const comboCount = oltsToUse.length * slotsToUse.length * portsToUse.length;
    const labelPrefix = label ? `${label} ` : "";
    setLightStatus(`Loading ${labelPrefix}light level for ${comboCount} combo(s)...`);
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
      fetch(lightLevelUrl, {
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

  const handleLightLevel = (e) => {
    e?.preventDefault();
    const allOlts = allowedOltsByCity(city, lightConfig?.olts || []);
    const slotsToUse = lightConfig?.slots || [];
    const min = lightConfig?.minPort || 1;
    const max = lightConfig?.maxPort || 16;
    const portsToUse = buildPortRange(min, max);
    runLightLevel(allOlts, slotsToUse, portsToUse, "");
  };

  const handleManualLightLevel = () => {
    const allOlts = allowedOltsByCity(city, lightConfig?.olts || []);
    const slotsToUse = manualSlot ? [manualSlot] : lightConfig?.slots || [];
    const min = lightConfig?.minPort || 1;
    const max = lightConfig?.maxPort || 16;
    const parsedPorts = parsePortInput(manualPorts, min, max);
    const portsToUse = parsedPorts.length > 0 ? parsedPorts : buildPortRange(min, max);
    const oltsToUse = manualOlt ? [manualOlt] : allOlts;
    runLightLevel(oltsToUse, slotsToUse, portsToUse, "Manual");
  };

  const manualOltOptions = allowedOltsByCity(city, lightConfig?.olts || []);
  const manualSlotOptions = lightConfig?.slots || [];

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
    return `Online CPE: ${counts.green} | Low light: ${counts.yellow} | Offline: ${counts.red} | Suspended: ${counts.purple} | Inactive: ${counts.black} | Drop done no acct: ${counts.blue} | Drop not completed: ${counts.gray}`;
  })();

  const buildOltStatsForPoint = (accounts) => {
    if (!accounts || accounts.length === 0 || lightEntries.length === 0) {
      return [];
    }
    const seen = new Set();
    const stats = new Map();
    accounts.forEach((acct) => {
      const uniqueKey = `${acct.inventory_model}|||${acct.value}`;
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);
      const match = findLightMatch(lightEntries, acct.value);
      if (!match) return;
      const olt = match.olt ?? "n/a";
      const slot = match.slot ?? "n/a";
      const port = match.port ?? "n/a";
      const statKey = `${olt}|||${slot}|||${port}`;
      const current = stats.get(statKey);
      if (current) {
        current.count += 1;
      } else {
        stats.set(statKey, { olt, slot, port, count: 1 });
      }
    });
    return Array.from(stats.values());
  };

  const buildPopupText = (point) => {
    const lines = [];
    const pushIf = (value) => {
      if (value) lines.push(value);
    };
    const pushBlank = () => {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
    };

    pushIf(point.name);
    pushIf(point.addressId ? `Address ID: ${point.addressId}` : "");
    pushIf(point.line1);
    pushIf(point.line2);
    if (point.fdaFdh) {
      if (point.fdaFdh.includes("|")) {
        const [fdaPart, fdhPart] = point.fdaFdh.split("|");
        pushIf(
          `FDA: ${fdaPart.replace("FDA:", "")} | FDH: ${fdhPart.replace("FDH:", "")}`,
        );
      } else {
        pushIf(`FDA: ${point.fdaFdh}`);
      }
    }
    if (point.dropCompleted !== undefined) {
      pushIf(`Drop: ${point.dropCompleted ? "Completed" : "Not completed"}`);
    }

    const oltStats = buildOltStatsForPoint(point.accounts);
    if (oltStats.length) {
      pushBlank();
      lines.push("OLT Summary:");
      lines.push("");
      oltStats.forEach((stat) => {
        lines.push(`    OLT: ${stat.olt} | Slot: ${stat.slot} | Port: ${stat.port} (${stat.count})`);
      });
    }

    if (point.accounts && point.accounts.length > 0) {
      const grouped = point.accounts.reduce((acc, acct) => {
        const key = acct.account_id || "unknown";
        if (!acc[key]) acc[key] = [];
        acc[key].push(acct);
        return acc;
      }, {});
      const groupedArr = Object.entries(grouped).map(
        ([accountId, items]) => ({
          accountId,
          items,
        }),
      );
      groupedArr.forEach((group) => {
        pushBlank();
        lines.push(`Account ID: ${group.accountId}`);
        if (group.items[0]?.account_status_id) {
          lines.push(
            `Account Status: ${group.items[0].account_status_text || group.items[0].account_status_id}`,
          );
        }
        lines.push("CPE:");
        lines.push("");
        const unique = [];
        const seen = new Set();
        group.items.forEach((item) => {
          const key = `${item.inventory_model}|||${item.value}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
          }
        });
        unique.forEach((item) => {
          lines.push(`    ${item.inventory_model}: ${item.value}`);
          const match = findLightMatch(lightEntries, item.value);
          if (match) {
            lines.push(`    OLT: ${match.olt || "n/a"}`);
            lines.push(`    OLT Slot: ${match.slot}`);
            lines.push(`    Port: ${match.port}`);
            lines.push(`    RX @ OLT: ${match["rx-power-olt"] ?? "n/a"} dBm`);
            lines.push(`    Fiber distance: ${match["fiber-distance"] ?? "n/a"} km`);
            lines.push(`    TX power: ${match["tx-power"] ?? "n/a"} dBm`);
            lines.push(`    RX power: ${match["rx-power"] ?? "n/a"} dBm`);
            lines.push(`    TX bias current: ${match["tx-bias-current"] ?? "n/a"} mA`);
            lines.push(
              `    TX bias temp: ${match["tx-bias-temperature"] ?? "n/a"} °C`,
            );
            lines.push(
              `    Module voltage: ${match["module-voltage"] ?? "n/a"} V`,
            );
            lines.push(
              `    Module temp: ${match["module-temperature"] ?? "n/a"} °C`,
            );
            lines.push("");
          } else {
            lines.push("");
          }
        });
        while (lines.length > 0 && lines[lines.length - 1] === "") {
          lines.pop();
        }
      });
    } else {
      pushBlank();
      lines.push("CPE:");
      lines.push("");
      lines.push("    n/a");
    }

    if (point.latitude && point.longitude) {
      pushBlank();
      lines.push(`Lat/Lng: ${point.latitude}, ${point.longitude}`);
    }
    return lines.join("\r\n");
  };

  const buildCpeColumns = (point) => {
    const accounts = point.accounts || [];
    if (accounts.length === 0) {
      return {
        account_id: "",
        cpe_model: "",
        cpe_value: "",
        olt: "",
        olt_slot: "",
        olt_port: "",
        rx_power_olt_dbm: "",
        fiber_distance_km: "",
        tx_power_dbm: "",
        rx_power_dbm: "",
        tx_bias_current_ma: "",
        tx_bias_temp_c: "",
        module_voltage_v: "",
        module_temp_c: "",
      };
    }
    const seen = new Set();
    let first = null;
    for (const item of accounts) {
      const key = `${item.inventory_model}|||${item.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        first = item;
        break;
      }
    }
    if (!first) {
      return {
        account_id: "",
        cpe_model: "",
        cpe_value: "",
        olt: "",
        olt_slot: "",
        olt_port: "",
        rx_power_olt_dbm: "",
        fiber_distance_km: "",
        tx_power_dbm: "",
        rx_power_dbm: "",
        tx_bias_current_ma: "",
        tx_bias_temp_c: "",
        module_voltage_v: "",
        module_temp_c: "",
      };
    }
    const match = findLightMatch(lightEntries, first.value);
    return {
      account_id: first.account_id ?? "",
      cpe_model: first.inventory_model ?? "",
      cpe_value: first.value ?? "",
      olt: match?.olt ?? "",
      olt_slot: match?.slot ?? "",
      olt_port: match?.port ?? "",
      rx_power_olt_dbm: match?.["rx-power-olt"] ?? "",
      fiber_distance_km: match?.["fiber-distance"] ?? "",
      tx_power_dbm: match?.["tx-power"] ?? "",
      rx_power_dbm: match?.["rx-power"] ?? "",
      tx_bias_current_ma: match?.["tx-bias-current"] ?? "",
      tx_bias_temp_c: match?.["tx-bias-temperature"] ?? "",
      module_voltage_v: match?.["module-voltage"] ?? "",
      module_temp_c: match?.["module-temperature"] ?? "",
    };
  };

  const markerLabelForColor = (color) => {
    if (color === "#111827") return "black";
    if (color === "#2563eb") return "blue";
    if (color === "#dc2626") return "red";
    if (color === "#facc15") return "yellow";
    if (color === "#16a34a") return "green";
    if (color === "#9ca3af") return "gray";
    if (color === "#9333ea") return "purple";
    return "unknown";
  };

  const exportMarkersToCsv = () => {
    if (!filteredPoints.length) return;
    const headers = [
      "marker_color",
      "name",
      "address_id",
      "line1",
      "line2",
      "fda_fdh",
      "drop_completed",
      "latitude",
      "longitude",
      "account_id",
      "cpe_model",
      "cpe_value",
      "olt",
      "olt_slot",
      "olt_port",
      "rx_power_olt_dbm",
      "fiber_distance_km",
      "tx_power_dbm",
      "rx_power_dbm",
      "tx_bias_current_ma",
      "tx_bias_temp_c",
      "module_voltage_v",
      "module_temp_c",
    ];
    const escapeCsv = (value) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      const escaped = str.replace(/"/g, '""');
      return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
    };
    const rows = filteredPoints.map((point) => {
      const color = markerColorForPoint(point);
      const cpe = buildCpeColumns(point);
      return [
        markerLabelForColor(color),
        point.name ?? "",
        point.addressId ?? "",
        point.line1 ?? "",
        point.line2 ?? "",
        point.fdaFdh ?? "",
        point.dropCompleted !== undefined ? String(point.dropCompleted) : "",
        point.latitude ?? "",
        point.longitude ?? "",
        cpe.account_id,
        cpe.cpe_model,
        cpe.cpe_value,
        cpe.olt,
        cpe.olt_slot,
        cpe.olt_port,
        cpe.rx_power_olt_dbm,
        cpe.fiber_distance_km,
        cpe.tx_power_dbm,
        cpe.rx_power_dbm,
        cpe.tx_bias_current_ma,
        cpe.tx_bias_temp_c,
        cpe.module_voltage_v,
        cpe.module_temp_c,
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "");
    link.href = url;
    link.download = `markers-export-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const yellowOltAverages = (() => {
    if (!lightEntries.length) return [];
    const stats = new Map();
    const addEntry = (match) => {
      if (!match) return;
      const olt = match.olt ?? "n/a";
      const slot = match.slot ?? "n/a";
      const port = match.port ?? "n/a";
      const key = `${olt}|||${slot}|||${port}`;
      let current = stats.get(key);
      if (!current) {
        current = {
          olt,
          slot,
          port,
          txSum: 0,
          txCount: 0,
          rxSum: 0,
          rxCount: 0,
          count: 0,
        };
        stats.set(key, current);
      }
      current.count += 1;
      const tx = Number(match["tx-power"]);
      if (!Number.isNaN(tx)) {
        current.txSum += tx;
        current.txCount += 1;
      }
      const rx = Number(match["rx-power"]);
      if (!Number.isNaN(rx)) {
        current.rxSum += rx;
        current.rxCount += 1;
      }
    };

    filteredPoints.forEach((point) => {
      const color = markerColorForPoint(point);
      if (color !== "#facc15") return;
      const seen = new Set();
      (point.accounts || []).forEach((acct) => {
        const uniqueKey = `${acct.inventory_model}|||${acct.value}`;
        if (seen.has(uniqueKey)) return;
        seen.add(uniqueKey);
        const match = findLightMatch(lightEntries, acct.value);
        addEntry(match);
      });
    });

    return Array.from(stats.values())
      .map((entry) => ({
        olt: entry.olt,
        slot: entry.slot,
        port: entry.port,
        count: entry.count,
        txAvg: entry.txCount ? entry.txSum / entry.txCount : null,
        rxAvg: entry.rxCount ? entry.rxSum / entry.rxCount : null,
      }))
      .sort((a, b) => {
        const oltSort = String(a.olt).localeCompare(String(b.olt));
        if (oltSort) return oltSort;
        const slotSort = String(a.slot).localeCompare(String(b.slot));
        if (slotSort) return slotSort;
        return String(a.port).localeCompare(String(b.port));
      })
      .map((entry) => ({
        ...entry,
        txAvg: entry.txAvg === null ? "n/a" : entry.txAvg.toFixed(1),
        rxAvg: entry.rxAvg === null ? "n/a" : entry.rxAvg.toFixed(1),
      }));
  })();

  useEffect(() => {
    const handleScroll = () => {
      setHeaderCompact(window.scrollY > 80);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Sign in</h1>
          <p>Use your Microsoft account to access the map.</p>
          {!hasClientId ? (
            <p className="auth-warning">
              Missing `VITE_MSAL_CLIENT_ID` in your `.env` file.
            </p>
          ) : null}
          <button
            className="auth-button"
            type="button"
            onClick={handleLogin}
            disabled={!hasClientId}
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="auth-bar">
        <div className="auth-user">
          <span className="auth-label">Signed in</span>
          <span className="auth-name">
            {activeAccount?.name || activeAccount?.username || "User"}
          </span>
        </div>
        <button className="secondary-button" type="button" onClick={handleLogout}>
          Sign out
        </button>
      </div>
      <HeaderSection
        statusText={statusText}
        markerCounts={markerCounts}
        yellowOltAverages={yellowOltAverages}
        compact={headerCompact}
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
        manualOlt={manualOlt}
        setManualOlt={setManualOlt}
        manualSlot={manualSlot}
        setManualSlot={setManualSlot}
        manualPorts={manualPorts}
        setManualPorts={setManualPorts}
        manualOltOptions={manualOltOptions}
        manualSlotOptions={manualSlotOptions}
        handleManualLightLevel={handleManualLightLevel}
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
        onExport={exportMarkersToCsv}
        exportDisabled={filteredPoints.length === 0}
      />

      <MapView
        points={filteredPoints}
        lightEntries={lightEntries}
        markerColorForPoint={markerColorForPoint}
      />
    </div>
  );
}

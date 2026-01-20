import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

const {
  DATABASE_URL,
  TABLE_NAME = "address_data",
  ID_COLUMN,
  LAT_COLUMN = "latitude",
  LNG_COLUMN = "longitude",
  CITY_COLUMN = "city",
  ADDRESS_COLUMN = "address",
  LINE2_COLUMN = "line2",
  SUBDIVISION_COLUMN = "subdivision",
  ZIP_COLUMN = "zip",
  FDA_FDH_COLUMN = "fda_fdh",
  DROP_COLUMN = "drop",
  SERVICEABLE_COLUMN = "serviceable",
  LIGHT_IP = "172.30.36.146",
  LIGHT_ALLOWED_OLTS = "",
  LIGHT_ALLOWED_SLOTS = "LT1,LT2",
  LIGHT_MIN_PORT = "1",
  LIGHT_MAX_PORT = "16",
  PORT = 3001,
} = process.env;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const validIdentifier = (value) => /^[a-zA-Z0-9_]+$/.test(value);
const guardIdentifiers = () => {
  const identifiers = [
    { key: "TABLE_NAME", value: TABLE_NAME },
    { key: "ID_COLUMN", value: ID_COLUMN },
    { key: "LAT_COLUMN", value: LAT_COLUMN },
    { key: "LNG_COLUMN", value: LNG_COLUMN },
    { key: "CITY_COLUMN", value: CITY_COLUMN },
    { key: "ADDRESS_COLUMN", value: ADDRESS_COLUMN },
    { key: "LINE2_COLUMN", value: LINE2_COLUMN },
    { key: "SUBDIVISION_COLUMN", value: SUBDIVISION_COLUMN },
    { key: "ZIP_COLUMN", value: ZIP_COLUMN },
    { key: "FDA_FDH_COLUMN", value: FDA_FDH_COLUMN },
    { key: "DROP_COLUMN", value: DROP_COLUMN },
    { key: "SERVICEABLE_COLUMN", value: SERVICEABLE_COLUMN },
  ];
  identifiers.forEach(({ key, value }) => {
    if (value && !validIdentifier(value)) {
      console.error(`${key} contains invalid characters: ${value}`);
      process.exit(1);
    }
  });
};

guardIdentifiers();

app.get("/points", async (req, res) => {
  const { minLat, maxLat, minLng, maxLng, city, fda, fdh, drop, status } =
    req.query;
  const hasBounds =
    minLat !== undefined &&
    maxLat !== undefined &&
    minLng !== undefined &&
    maxLng !== undefined;

  const params = [];
  const conditions = [
    `t.${LAT_COLUMN} IS NOT NULL`,
    `t.${LNG_COLUMN} IS NOT NULL`,
    `t.${SERVICEABLE_COLUMN} = TRUE`,
  ];

  if (hasBounds) {
    const start = params.length + 1;
    conditions.push(
      `t.${LAT_COLUMN} BETWEEN $${start} AND $${start + 1} AND t.${LNG_COLUMN} BETWEEN $${start + 2} AND $${start + 3}`,
    );
    params.push(Number(minLat), Number(maxLat), Number(minLng), Number(maxLng));
  }

  if (city) {
    const idx = params.length + 1;
    conditions.push(`t.${CITY_COLUMN} = $${idx}`);
    params.push(city);
  }

  const parseList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
};

  const fdaList = parseList(fda);
  if (fdaList.length > 0) {
    const idx = params.length + 1;
    conditions.push(
      `split_part(${FDA_FDH_COLUMN}, '|', 1) = ANY($${idx}::text[])`,
    );
    params.push(fdaList);
  }

  const fdhList = parseList(fdh);
  if (fdhList.length > 0) {
    const idx = params.length + 1;
    conditions.push(
      `split_part(${FDA_FDH_COLUMN}, '|', 2) = ANY($${idx}::text[])`,
    );
    params.push(fdhList);
  }

  const statusList = parseList(status)
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
  if (statusList.length > 0) {
    const idx = params.length + 1;
    conditions.push(
      `EXISTS (
        SELECT 1 FROM account_inventory ai
        JOIN account a ON a.id = ai.account_id
        WHERE ai.address_id = t.${ID_COLUMN || "address_id"}
          AND a.account_status_id = ANY($${idx}::int[])
      )`,
    );
    params.push(statusList);
  }

  if (drop) {
    const dropValue = String(drop).toLowerCase();
    if (dropValue === "completed" || dropValue === "1") {
      conditions.push(`t.${DROP_COLUMN}::text = '1'`);
    } else if (
      dropValue === "notcompleted" ||
      dropValue === "0" ||
      dropValue === "null"
    ) {
      conditions.push(
        `(t.${DROP_COLUMN} IS NULL OR t.${DROP_COLUMN}::text <> '1')`,
      );
    }
  }

  const idSelect = ID_COLUMN
    ? `t.${ID_COLUMN}`
    : "ROW_NUMBER() OVER ()";
  const fdaFdhSelect = FDA_FDH_COLUMN
    ? `t.${FDA_FDH_COLUMN}`
    : "NULL";
  const dropSelect = DROP_COLUMN
    ? `t.${DROP_COLUMN}`
    : "NULL";
  const accountsSelect = ID_COLUMN
    ? `COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'account_id', ai.account_id,
              'inventory_model', ai.inventory_model,
              'value', ai.value,
              'account_status_id', a.account_status_id,
              'account_status_text',
                CASE a.account_status_id
                  WHEN 1 THEN 'Active'
                  WHEN 2 THEN 'Inactive'
                  WHEN 4 THEN 'Suspended'
                  WHEN 39 THEN 'Scheduled'
                  WHEN 75 THEN 'Test ONT'
                  ELSE NULL
                END
            )
          )
          FROM account_inventory ai
          LEFT JOIN account a ON a.id = ai.account_id
          WHERE ai.address_id = t.${ID_COLUMN}
            AND a.account_status_id IN (1, 2, 4, 39, 75)
        ),
        '[]'::json
      )`
    : `'[]'::json`;

  const sql = `
    SELECT
      ${idSelect} AS id,
      t.${CITY_COLUMN} AS city,
      t.${ADDRESS_COLUMN} AS address,
      ${LINE2_COLUMN ? `t.${LINE2_COLUMN} AS unit,` : "NULL AS unit,"}
      ${SUBDIVISION_COLUMN ? `t.${SUBDIVISION_COLUMN} AS state,` : "NULL AS state,"}
      ${ZIP_COLUMN ? `t.${ZIP_COLUMN} AS zip,` : "NULL AS zip,"}
      t.${LAT_COLUMN} AS latitude,
      t.${LNG_COLUMN} AS longitude,
      ${fdaFdhSelect} AS fda_fdh,
      ${dropSelect} AS drop_status,
      ${accountsSelect} AS accounts
    FROM ${TABLE_NAME} t
    WHERE ${conditions.join(" AND ")}
    ;
  `;

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching points", err);
    res.status(500).json({ error: "Failed to fetch points" });
  }
});

app.get("/fda-options", async (req, res) => {
  const { city } = req.query;
  const params = [];
  const conditions = [
    `${FDA_FDH_COLUMN} IS NOT NULL`,
    `${LAT_COLUMN} IS NOT NULL`,
    `${LNG_COLUMN} IS NOT NULL`,
    `${SERVICEABLE_COLUMN} = TRUE`,
  ];

  if (city) {
    const idx = params.length + 1;
    conditions.push(`${CITY_COLUMN} = $${idx}`);
    params.push(city);
  }

  const sql = `
    SELECT DISTINCT split_part(${FDA_FDH_COLUMN}, '|', 1) AS fda
    FROM ${TABLE_NAME}
    WHERE ${conditions.join(" AND ")}
    ORDER BY fda;
  `;

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r) => r.fda).filter(Boolean));
  } catch (err) {
    console.error("Error fetching FDA options", err);
    res.status(500).json({ error: "Failed to fetch FDA options" });
  }
});

app.get("/fdh-options", async (req, res) => {
  const { city, fda } = req.query;
  const params = [];
  const conditions = [
    `${FDA_FDH_COLUMN} IS NOT NULL`,
    `${LAT_COLUMN} IS NOT NULL`,
    `${LNG_COLUMN} IS NOT NULL`,
    `${SERVICEABLE_COLUMN} = TRUE`,
  ];

  if (city) {
    const idx = params.length + 1;
    conditions.push(`${CITY_COLUMN} = $${idx}`);
    params.push(city);
  }

  const parseList = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.length > 0) {
      return value.split(",").map((v) => v.trim()).filter(Boolean);
    }
    return [];
  };

  const fdaList = parseList(fda);
  if (fdaList.length > 0) {
    const idx = params.length + 1;
    conditions.push(
      `split_part(${FDA_FDH_COLUMN}, '|', 1) = ANY($${idx}::text[])`,
    );
    params.push(fdaList);
  }

  const sql = `
    SELECT DISTINCT split_part(${FDA_FDH_COLUMN}, '|', 2) AS fdh
    FROM ${TABLE_NAME}
    WHERE ${conditions.join(" AND ")}
    ORDER BY fdh;
  `;

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r) => r.fdh).filter(Boolean));
  } catch (err) {
    console.error("Error fetching FDH options", err);
    res.status(500).json({ error: "Failed to fetch FDH options" });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

// Light-level config and proxy
const lightConfig = {
  ip: LIGHT_IP,
  olts: (LIGHT_ALLOWED_OLTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  slots: (LIGHT_ALLOWED_SLOTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  minPort: Number(LIGHT_MIN_PORT) || 1,
  maxPort: Number(LIGHT_MAX_PORT) || 16,
};

app.get("/light-config", (_req, res) => {
  res.json(lightConfig);
});

app.post("/light-level", async (req, res) => {
  const { olt, slot, port } = req.body || {};
  if (!olt || !slot || port === undefined) {
    return res.status(400).json({ error: "Missing olt, slot, or port" });
  }

  if (lightConfig.olts.length && !lightConfig.olts.includes(olt)) {
    return res.status(400).json({ error: "OLT not allowed" });
  }
  const slots = Array.isArray(slot) ? slot : [slot];
  const ports = Array.isArray(port) ? port : [port];
  const invalidSlot = slots.find(
    (s) => lightConfig.slots.length && !lightConfig.slots.includes(s),
  );
  if (invalidSlot) {
    return res.status(400).json({ error: `Slot not allowed: ${invalidSlot}` });
  }
  const portNums = ports.map((p) => Number(p));
  const badPort = portNums.find(
    (p) =>
      Number.isNaN(p) || p < lightConfig.minPort || p > lightConfig.maxPort,
  );
  if (badPort !== undefined) {
    return res.status(400).json({ error: `Port out of range: ${badPort}` });
  }

  const tasks = [];
  slots.forEach((s) => {
    portNums.forEach((p) => {
      tasks.push({ slot: s, port: p });
    });
  });

  try {
    const results = [];
    for (const task of tasks) {
      const response = await fetch("https://api.novosfiber.com/pon_proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: lightConfig.ip,
          olt,
          slot: task.slot,
          port: task.port,
          insecure: true,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        results.push({
          slot: task.slot,
          port: task.port,
          error: "Upstream error",
          status: response.status,
          body: text,
        });
      } else {
        const data = await response.json();
        results.push({ slot: task.slot, port: task.port, data });
      }
    }
    res.json(results);
  } catch (err) {
    console.error("Error calling light-level proxy", err);
    res.status(500).json({ error: "Failed to fetch light level" });
  }
});

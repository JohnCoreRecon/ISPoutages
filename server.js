// =============================================================================
// South Texas ISP Outage Watch — self-hosted server
// Serves the dashboard and a cached /api/status endpoint that performs the
// live outage check server-side (no CORS issues, API key stays on the server).
// =============================================================================

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.MODEL || "claude-sonnet-4-6";
const CACHE_MS = (Number(process.env.CACHE_SECONDS) || 90) * 1000;

// ISP ids the backend asks about (must match the frontend roster ids).
const ISP_IDS = [
  "spectrum", "att", "grande", "frontier",
  "brightspeed", "tmobile", "verizon", "starlink",
];
const ISP_NAMES = {
  spectrum: "Spectrum", att: "AT&T", grande: "Astound/Grande", frontier: "Frontier",
  brightspeed: "Brightspeed", tmobile: "T-Mobile Home", verizon: "Verizon", starlink: "Starlink",
};

// ---- optional HTTP Basic Auth (set BASIC_AUTH="user:pass" to enable) --------
if (process.env.BASIC_AUTH) {
  const [u, p] = process.env.BASIC_AUTH.split(":");
  const expected = "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
  app.use((req, res, next) => {
    if (req.headers.authorization === expected) return next();
    res.set("WWW-Authenticate", 'Basic realm="ISP Outage Watch"');
    res.status(401).send("Authentication required.");
  });
}

// ---- simple in-memory cache so the API isn't hit on every page load ---------
let cache = { ts: 0, data: null };

async function liveCheck() {
  const key = process.env.ANTHROPIC_API_KEY;
  // No key configured: return a clear empty-state so the UI still renders.
  if (!key) {
    return {
      mode: "demo",
      results: ISP_IDS.map((id) => ({
        id, status: "unknown", signal: "none",
        summary: "Set ANTHROPIC_API_KEY on the server to enable live checks.",
        areas: [],
      })),
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const names = ISP_IDS.map((id) => `${id} = ${ISP_NAMES[id]}`).join("; ");

  const body = {
    model: MODEL,
    max_tokens: 1200,
    system:
      "You are a network outage checker. Use web_search to find the CURRENT outage status for each ISP, " +
      "specifically in the Corpus Christi, TX metro and broader South Texas region (Coastal Bend). " +
      "Check Downdetector and recent reports/news. Be conservative: only flag 'outage' with clear evidence of a " +
      "current widespread regional disruption; 'possible' for elevated reports; otherwise 'operational'. Use 'unknown' " +
      "if you truly cannot find a signal. Respond with ONLY a raw JSON array, no markdown, no commentary. " +
      'Each element: {"id":"<id>","status":"operational|possible|outage|unknown",' +
      '"signal":"none|low|elevated|high","summary":"<=16 words, plain","areas":["city",...]}.',
    messages: [
      {
        role: "user",
        content: `Date: ${today}. Region: Corpus Christi / South Texas. Check these ISPs (use these exact ids): ${ISP_IDS.join(", ")}. (${names}). Return the JSON array for all of them.`,
      },
    ],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${txt.slice(0, 300)}`);
  }

  const payload = await res.json();
  const text = (payload.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array in model response");

  const arr = JSON.parse(text.slice(start, end + 1));
  return { mode: "live", results: arr };
}

app.get("/api/status", async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_MS) {
    return res.json({ ...cache.data, cached: true, age: Math.round((now - cache.ts) / 1000) });
  }
  try {
    const data = await liveCheck();
    cache = { ts: now, data };
    res.json({ ...data, cached: false, age: 0 });
  } catch (err) {
    // Serve stale cache on failure if we have it; otherwise report the error.
    if (cache.data) {
      return res.json({ ...cache.data, cached: true, stale: true, age: Math.round((now - cache.ts) / 1000) });
    }
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.get("/healthz", (req, res) => res.json({ ok: true, model: MODEL }));

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  const mode = process.env.ANTHROPIC_API_KEY ? "LIVE" : "DEMO (no API key set)";
  console.log(`South Texas ISP Outage Watch → http://localhost:${PORT}  [${mode}]`);
});

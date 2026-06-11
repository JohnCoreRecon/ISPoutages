# South Texas ISP Outage Watch

A self-hosted, NOC-style dashboard showing live outage status for the internet
providers that serve the **Corpus Christi / Coastal Bend** area: Spectrum, AT&T,
Astound/Grande, Frontier, Brightspeed, T-Mobile Home, Verizon, and Starlink.

Each refresh runs a **server-side live web search** (Downdetector + public
reports, scoped to South Texas) and pairs it with one-click links to every
provider's official status page. Status is a community-signal view, not official
provider telemetry — the per-card status link is the authoritative confirm.

---

## Run it locally (2 minutes)

```bash
npm install
cp .env.example .env        # then paste your ANTHROPIC_API_KEY into .env
npm start
```

Open **http://localhost:3000**.

Without a key it runs in **demo mode** — the UI renders and is fully wired, it
just won't pull live data until you add the key.

---

## Get a real URL

Pick whichever fits your setup. All of these give you a public address.

**A. On the CoreRecon server / any VPS, behind your existing site**
Run it on an internal port and reverse-proxy a subdomain to it (Nginx example):

```nginx
server {
  server_name outages.corerecon.com;
  location / { proxy_pass http://127.0.0.1:3000; }
}
```
Keep it alive with `pm2 start server.js --name isp-outage` (or a systemd unit).

**B. Docker (anywhere)**
```bash
docker build -t isp-outage .
docker run -d -p 3000:3000 --env-file .env --name isp-outage isp-outage
```

**C. Render / Railway / Fly.io (managed, fast)**
Push this folder to a Git repo, create a new Web Service, set the build to
`npm install` and the start command to `npm start`, and add `ANTHROPIC_API_KEY`
as an environment variable. You'll get an HTTPS URL automatically.

---

## Configuration (.env)

| Variable            | Purpose                                                        | Default            |
|---------------------|----------------------------------------------------------------|--------------------|
| `ANTHROPIC_API_KEY` | Enables live checks. Stays server-side, never sent to browser. | _(none → demo)_    |
| `PORT`              | Port to listen on.                                             | `3000`             |
| `MODEL`             | Anthropic model used for the live check.                       | `claude-sonnet-4-6`|
| `CACHE_SECONDS`     | How long a live result is reused before re-checking.           | `90`               |
| `BASIC_AUTH`        | `user:pass` to password-protect the dashboard.                 | _(open)_           |

> The cache matters: it means a wall-mounted display or a whole team hitting the
> page share one live check per 90s instead of one per visitor.

---

## How it works

```
browser ──GET /api/status──> Express server ──web_search──> live results
   ▲                              │  (cached CACHE_SECONDS)
   └──────── dashboard HTML ──────┘
```

The browser never sees your API key or talks to Anthropic/Downdetector directly —
the server does the work, which is also what sidesteps the CORS wall that blocks
a pure static page from doing this.

---

## Customizing the provider list

Edit the `ROSTER` array in `public/index.html` (controls the cards and links) and
the `ISP_IDS` / `ISP_NAMES` in `server.js` (controls what the live check asks
about). Keep the ids identical between the two files.

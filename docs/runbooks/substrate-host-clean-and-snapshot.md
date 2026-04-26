# Substrate host (170.64.184.28) — clean + golden snapshot

**Target:** `170.64.184.28` — shared substrate host. Free/indie/pro tier customer
substrates run as Docker containers here.

**NOT touching:** `170.64.198.144` / `mmpm.co.nz` — that's the MMPM agent memory
droplet, blacklisted by the droplet-ops procedure. Every SSH/scp command in this
runbook is hard-coded to `170.64.184.28`.

**Pre-condition:** there are no real customers on this host yet — only manual
test substrates. If that changes (real paying customer on shared tier), STOP.
This runbook deletes data without a backup.

**Outcome:** containers and volumes for all customer substrates removed; base
images, Traefik gateway sidecar, OS untouched; new DO snapshot taken to use as
the `image` field for new dedicated provisioning (and as a clean rebuild
baseline for the shared host itself).

---

## Phase 0 — Pre-flight on your Mac

> **Why:** confirm you're hitting the right droplet, not the memory droplet.
> **Where:** your Mac terminal.
> **Safe:** yes. Read-only.

```bash
# Confirm SSH alias resolves to 170.64.184.28 and NOT 170.64.198.144.
ssh -G substrate-host 2>/dev/null | grep -E '^hostname ' || \
  echo "no SSH alias; will use IP directly"

# If you don't have a 'substrate-host' alias, just verify the IP visually:
echo "TARGET: 170.64.184.28  (must NOT be 170.64.198.144)"
```

If the alias points anywhere other than `170.64.184.28`, fix `~/.ssh/config`
before continuing. From here on, replace `<USER>@170.64.184.28` with whatever
SSH login works for you (probably `root` or `deploy`).

---

## Phase 1 — Inventory what's on the droplet

> **Why:** we need to see exactly what we're about to remove before we remove
> it. No `rm` blind.
> **Where:** SSH session into 170.64.184.28.
> **Safe:** yes. Read-only `docker ps`, `docker volume ls`, `df`.

```bash
# === ON YOUR MAC ===
ssh <USER>@170.64.184.28
```

Then on the droplet:

```bash
# === ON 170.64.184.28 ===

# 1. Confirm hostname + IP — sanity check we're on the right box.
hostname && hostname -I

# 2. List ALL containers (running + stopped).
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

# 3. List all named volumes.
docker volume ls

# 4. Find substrate bind-mount data dirs (common locations).
sudo ls -la /var/lib/mmpm/ 2>/dev/null
sudo ls -la ~/.mmpm/ 2>/dev/null
sudo ls -la /opt/mmpm/ 2>/dev/null

# 5. Show docker compose projects, if any.
docker compose ls 2>/dev/null || true

# 6. Disk usage by docker (gives sense of what'll be freed).
docker system df -v | head -50
```

**Expected pattern** (based on memory `v1.fact.unified_provisioner_architecture`):
- Per-customer containers come in pairs: `mmpm-service-<id>` + `mmpm-mcp-<id>` —
  exact prefix may differ. **Read what's actually there** before generalising.
- Traefik gateway sidecar should be present and we KEEP it.
- Base images `mmpm-service` and `mmpm-mcp` should be present and we KEEP them.

> **Stop here and paste the output back to me.** I'll write phase 2's exact
> command with your actual container names — don't run a generic `prune` until
> we've confirmed the prefix.

---

## Phase 2 — Stop and remove substrate containers

> **Why:** clear test substrates so the snapshot is a fresh template.
> **Where:** SSH session into 170.64.184.28.
> **Safe:** destructive (deletes container state). Reversible via DO snapshot
> from before this run if you took one. Not reversible from inside the host.

The exact commands depend on phase 1 output. Two common patterns:

### Pattern A — substrates run as one big docker compose project

```bash
# === ON 170.64.184.28 ===
# Identify the project name from `docker compose ls` in phase 1.
# DO NOT run this against the gateway/traefik project.

PROJECT=<substrate-project-name-from-phase-1>

# Stop and remove containers + networks for that project.
docker compose -p "$PROJECT" down

# If volumes were declared in the compose file, also remove them:
docker compose -p "$PROJECT" down -v
```

### Pattern B — substrates are individual containers per customer

```bash
# === ON 170.64.184.28 ===
# Build the list FIRST, eyeball it, then act.
PREFIX=<substrate-prefix-from-phase-1>   # e.g. "mmpm-substrate-" or "substrate-"

# Show what we'd kill.
docker ps -a --filter "name=^${PREFIX}" --format 'table {{.Names}}\t{{.Status}}'

# If the list is exactly what you expect, stop them all:
docker ps -aq --filter "name=^${PREFIX}" | xargs -r docker stop

# Then remove them:
docker ps -aq --filter "name=^${PREFIX}" | xargs -r docker rm

# Verify nothing left with that prefix:
docker ps -a --filter "name=^${PREFIX}"
```

**Do NOT run** `docker rm -f $(docker ps -aq)` — that would also kill the
Traefik gateway sidecar.

---

## Phase 3 — Remove substrate volumes and any bind-mount data

> **Why:** container removal alone leaves named volumes behind. Volumes hold
> the LevelDB substrate data. We want a clean snapshot.
> **Where:** SSH session into 170.64.184.28.
> **Safe:** destructive. Per memory rule, file deletion is human-only — these
> commands are for you to type, not for me to run.

```bash
# === ON 170.64.184.28 ===
# 1. Show ALL volumes that aren't currently mounted by a running container.
docker volume ls --filter dangling=true

# 2. List substrate volumes specifically (adjust filter to match your prefix).
docker volume ls --filter "name=^substrate" --format 'table {{.Name}}\t{{.Driver}}'

# 3. If the list matches expectations, remove them:
docker volume ls -q --filter "name=^substrate" | xargs -r docker volume rm

# 4. Bind-mount data directories — only if these paths actually exist and only
#    the substrate subdirs (NOT the parent /var/lib/mmpm if it has shared
#    config, NOT ~/.mmpm if there's gateway state).
sudo ls -la /var/lib/mmpm/substrates/ 2>/dev/null   # inspect first
sudo rm -rf /var/lib/mmpm/substrates/*              # only if the listing was substrate dirs

# 5. Verify nothing dangles.
docker volume ls --filter dangling=true
docker system df
```

> If `docker volume rm` fails with "volume is in use", a container still
> references it — go back to Phase 2 and `docker rm` that container first.

---

## Phase 4 — Sanity-check the golden state (verification gate)

> **Why:** this is the test gate. If anything below fails, do NOT snapshot.
> **Where:** SSH session into 170.64.184.28.
> **Safe:** read-only.

```bash
# === ON 170.64.184.28 ===

# Test 1: zero substrate containers (running or stopped).
test "$(docker ps -aq --filter 'name=^substrate' | wc -l)" -eq 0 \
  && echo "PASS: no substrate containers" \
  || echo "FAIL: substrate containers still present"

# Test 2: zero substrate volumes.
test "$(docker volume ls -q --filter 'name=^substrate' | wc -l)" -eq 0 \
  && echo "PASS: no substrate volumes" \
  || echo "FAIL: substrate volumes still present"

# Test 3: gateway sidecar / Traefik still running (whatever the name is on
# YOUR host — confirm from phase 1 listing).
docker ps --format '{{.Names}}' | grep -E 'traefik|gateway|sidecar' \
  && echo "PASS: gateway present" \
  || echo "FAIL: gateway missing — investigate before snapshotting"

# Test 4: base images still pulled (will let new substrates spin up fast).
docker images --format '{{.Repository}}' | grep -E 'mmpm-service|mmpm-mcp' \
  && echo "PASS: base images cached" \
  || echo "WARN: base images missing — run `docker pull` before snapshot"

# Test 5: gateway sidecar health endpoint reachable.
curl -fsS https://api.droplet-mcp.nz/health \
  || echo "FAIL: gateway not serving health"

# Test 6: disk has been freed (rough check — not strict).
df -h /
docker system df
```

**Decision gate:** all five `PASS` lines must fire. If any `FAIL`, stop and
debug before snapshotting — a bad snapshot is worse than no snapshot.

---

## Phase 5 — Power off cleanly, then snapshot via DO web console

> **Why:** snapshots taken on a powered-off droplet are guaranteed-consistent.
> Snapshots on a running droplet may capture mid-write state. DO recommends
> powering off.
> **Where:** SSH session, then DO web UI in your browser.
> **Safe:** powering off makes the host unreachable for ~5–15 min while the
> snapshot runs. New substrate provisioning that targets this host will fail
> during this window — but you said no real customers, so this is fine.

### Step 5.1 — power off via SSH

```bash
# === ON 170.64.184.28 ===
sudo shutdown -h now
```

Your SSH session will hang up. Wait 30 seconds, then verify in DO web console:
**Droplets → 170.64.184.28 → status should read "Off"**.

### Step 5.2 — take the snapshot in DO web console

1. Go to <https://cloud.digitalocean.com/droplets>.
2. Click the droplet `170.64.184.28` (whatever its display name is — confirm
   the IP matches before clicking; do NOT click `mmpm.co.nz`).
3. Sidebar → **Snapshots** tab.
4. **Take Snapshot** button.
5. Snapshot name: `substrate-golden-2026-04-26` (date-stamped so we can tell it
   apart from the previous golden).
6. Wait until status flips from `Pending` to `Available` (typically 2–10 min).

### Step 5.3 — power back on

In DO web console: **Droplet → Power → Turn On**.

Verify reachable:

```bash
# === ON YOUR MAC ===
ssh <USER>@170.64.184.28 'echo OK; docker ps --format "{{.Names}}"'
curl -fsS https://api.droplet-mcp.nz/health && echo "gateway healthy"
```

---

## Phase 6 — Capture the new snapshot ID and update references

> **Why:** the substrate provisioner uses `SUBSTRATE_SNAPSHOT_ID` as the
> `image` field when creating dedicated droplets. If we don't update it, new
> dedicated provisioning still pulls the OLD snapshot.
> **Where:** DO web console → your `.env.prod` (you edit it; per ground rules I
> don't touch `.env*` files).
> **Safe:** `.env` edits are human-only.

### Step 6.1 — find the snapshot ID

In DO web console **Snapshots** page, the snapshot row shows the numeric ID
(e.g. `123456789`). Or via `doctl` on your Mac:

```bash
# === ON YOUR MAC ===
doctl compute snapshot list --resource droplet \
  --format ID,Name,CreatedAt,MinDiskSize \
  | grep substrate-golden
```

### Step 6.2 — update `.env.prod` yourself

I cannot read or edit `.env*` files (ground rule). Update the appropriate env
var in your `parametric-memory-compute` repo's `.env.prod`:

```env
SUBSTRATE_SNAPSHOT_ID=<new-numeric-id-from-step-6.1>
```

Common var names — check your codebase for the exact one:
- `SUBSTRATE_SNAPSHOT_ID`
- `DEDICATED_DROPLET_IMAGE_ID`
- `DO_SUBSTRATE_IMAGE`

### Step 6.3 — verify by provisioning a throwaway substrate

```bash
# === ON YOUR MAC ===
# Trigger a test provision (whatever your usual command is — typically a
# script in mmpm-compute). Confirm the new droplet boots from the new
# snapshot (DO console → Droplet → Image should show the new snapshot name).
```

---

## Phase 7 — Tell me when done

When the new snapshot is `Available` and `.env.prod` has the new ID, paste me
the snapshot ID and I'll update memory:

- tombstone `v1.state.substrate_golden_image_snapshotted` (the previous one),
- write `v1.state.substrate_golden_image_snapshotted_2026_04_26 = <id>` with a
  `supersedes` edge to the old state atom,
- write a `v1.event.substrate_golden_resnapped_2026_04_26` immutable event,
- run 2 train passes on the workflow.

---

## Quick reference — commands you'll run

| Phase | On Mac | On droplet |
|---|---|---|
| 0 | verify SSH alias | — |
| 1 | `ssh <USER>@170.64.184.28` | `docker ps -a` / `docker volume ls` / `docker compose ls` |
| 2 | — | `docker compose -p ... down -v` OR `docker stop/rm` by prefix |
| 3 | — | `docker volume rm` by prefix; `rm -rf` substrate bind-mount dirs |
| 4 | — | five PASS tests above |
| 5 | open DO web console | `sudo shutdown -h now` |
| 5.2 | take snapshot in DO UI | — |
| 5.3 | `ssh ... echo OK` | — |
| 6 | edit `.env.prod` yourself | — |

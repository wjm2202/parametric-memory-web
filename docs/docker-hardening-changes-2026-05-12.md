# Docker hardening — mmpm-website — 2026-05-12

Companion to `mm-memory/markov-merkle-memory/docs/docker-security-hardening-2026.md`.
This file records the changes applied to **`mmpm-website`** today and the commands you'll run to finish the supply-chain side.

---

## 1. What was already good (no change)

The 2026-03-09 audit had already done the hardest parts. These remain:

- Multi-stage build (`deps` → `builder` → `runner`)
- `npm ci --ignore-scripts` (reproducible, no lifecycle-script attacks)
- Dedicated non-root user (`nextjs`, UID 1001)
- `COPY --chown=nextjs:nodejs` on app payload
- Image-level `HEALTHCHECK`
- Compose binds port 3000 to `127.0.0.1` only (nginx in front)
- Compose has log rotation (`max-size: 10m`, `max-file: 3`)

So this round is incremental hardening, not a rewrite.

---

## 2. Changes applied

### 2.1 `Dockerfile`

- Added `# syntax=docker/dockerfile:1.7` pragma — pins the BuildKit frontend (reproducible parses across Docker versions).
- Added a header `TODO` block with the exact command to pin `node:22-alpine` to a `@sha256:` digest.
- Added OCI labels in the `runner` stage (`title`, `description`, `source`, `url`, `licenses`, `revision`, `vendor`). `revision` is wired to the existing `GIT_COMMIT_SHA` ARG. These show up in Docker Hub, Scout, and `docker inspect`.

### 2.2 `docker-compose.yml`

Added a hardening block to the `web` service:

```yaml
init: true                # Docker runs tini as PID 1
user: "1001:1001"         # defense-in-depth on top of Dockerfile USER
read_only: true           # immutable rootfs
tmpfs:
  - /tmp:size=64m
  - /app/.next/cache:size=256m
cap_drop:
  - ALL                   # drop every Linux capability
security_opt:
  - no-new-privileges:true
mem_limit: 1g
cpus: "1.0"
pids_limit: 200
```

Trade-off worth knowing: `.next/cache` is now tmpfs, so the Next.js ISR/fetch cache resets on container restart. Fine for a marketing site; if you ever want it to persist across deploys, swap the tmpfs entry for a named volume:

```yaml
volumes:
  - next-cache:/app/.next/cache
# and at the bottom:
volumes:
  next-cache:
```

### 2.3 `.dockerignore`

Real bug fix. The previous file used `.env.\*` with an escaped asterisk — Docker's matcher treats `\*` as a literal asterisk character, so `.env.production`, `.env.local`, etc were **not being excluded**. Same issue with `_.test.ts`/`_.test.tsx`/`_.spec.ts`/`_.spec.tsx` (probably markdown rendering at some point converted `*` to `_`), `docker-compose\*.yml`, and `\*.md`. All fixed to use literal `*` wildcards.

While in there, also added:

- `playwright.config.ts`, `playwright-report/`, `test-results/`, `e2e/` — Playwright artefacts shouldn't ship in the image.
- A comment marking the bug and the fix date so future-you doesn't undo it.

---

## 3. What's left (you need to run these)

All three are P0-P1 from the hardening doc. They require pushing to the registry or installing tooling, so I've left them for you to run.

### 3.1 Pin the base image to a digest

**Why:** Tags drift — `node:22-alpine` today is not the same content as `node:22-alpine` next week. A pinned digest is immutable.
**Where:** Any shell on your machine with Docker installed.
**Safe:** Yes — read-only against the public registry, no push.

```bash
docker buildx imagetools inspect node:22-alpine \
  --format '{{.Manifest.Digest}}'
# → sha256:abcdef0123...
```

Then in `mmpm-website/Dockerfile`, replace **all three** occurrences of `FROM node:22-alpine` with `FROM node:22-alpine@sha256:abcdef0123...` keeping the `AS <stage>` suffix. Renovate or Dependabot can keep this current automatically.

### 3.2 Build with SBOM + provenance attestations

**Why:** Closes the "Missing supply-chain attestation(s)" Scout finding for the web image. SBOM = list of every package; provenance = how the image was built.
**Where:** `mmpm-website/` directory on your machine (or wired into the CI workflow that pushes to Docker Hub).
**Safe:** Yes for `--load` builds, but `--push` writes to your registry — only run when you're publishing an actual release.

```bash
cd /Users/glenosborne/Documents/code/mmpm-website

# Build + push with full attestations.
# Replace <commit-sha> with the real SHA (or pass via --build-arg).
docker buildx build \
  --platform linux/amd64 \
  --sbom=true \
  --provenance=mode=max \
  --build-arg GIT_COMMIT_SHA=<commit-sha> \
  --tag parametricmemory/parametric-memory-web:<commit-sha> \
  --push \
  .
```

After push, verify the attestations are attached:

```bash
docker buildx imagetools inspect \
  parametricmemory/parametric-memory-web:<commit-sha>
# Look for an `Attestations:` section listing sbom + provenance.
```

If your build runs in GitHub Actions, the `docker/build-push-action` v5+ accepts `sbom: true` and `provenance: mode=max` as inputs — same flags, just YAML.

### 3.3 Scan locally before pushing

**Why:** Catch CVE regressions before Scout flags them in Docker Hub.
**Where:** Same directory after a local build (`--load` instead of `--push`).
**Safe:** Yes — pure read.

```bash
docker scout cves parametricmemory/parametric-memory-web:<commit-sha>
docker scout recommendations parametricmemory/parametric-memory-web:<commit-sha>
```

### 3.4 Sign the image with cosign keyless

**Why:** Tamper-evidence. Anyone pulling the image can prove it was built+signed by your identity, not by a registry compromise.
**Where:** Any host with `cosign` installed (`brew install cosign` on macOS).
**Safe:** Yes — signs an already-published image. First run will open a browser for OIDC login (Google / GitHub / Microsoft).

```bash
# Pin to the digest you just pushed, not the tag — signatures attach to digests.
DIGEST=$(docker buildx imagetools inspect \
  parametricmemory/parametric-memory-web:<commit-sha> \
  --format '{{.Manifest.Digest}}')

cosign sign --yes \
  parametricmemory/parametric-memory-web@${DIGEST}
```

Verify it landed:

```bash
cosign verify \
  --certificate-identity entityone22@gmail.com \
  --certificate-oidc-issuer https://accounts.google.com \
  parametricmemory/parametric-memory-web@${DIGEST}
```

(Replace identity/issuer with whatever OIDC provider you signed with.)

### 3.5 Bring up the hardened compose

**Why:** Test that `read_only: true` and `cap_drop: ALL` don't break the app.
**Where:** `mmpm-website/` on whichever host you deploy to (probably the droplet).
**Safe:** Yes for staging; for production, stage it first — `read_only` occasionally catches an unexpected write path. If it does, the container will crash with an `EROFS` or "read-only file system" error in the logs, and you can add another `tmpfs` entry to cover the path.

```bash
# Make sure your env vars are set first (Stripe keys, OAuth secrets, etc).
# This compose file does NOT load a .env file — variables come from the shell.

docker compose -f docker-compose.yml up -d
docker compose logs -f web    # watch for any EROFS errors
docker compose ps             # confirm health: status should become "(healthy)"
curl -fsS http://127.0.0.1:3000/api/health  # sanity check
```

If something breaks because of `read_only`, the fix is almost always one extra `tmpfs:` entry. Common Next.js suspects:

- `/app/.next/cache` (already covered)
- `/tmp` (already covered)
- `/app/.next/server/pages/api/` if you use a custom server (not your case)
- `/home/nextjs/.npm` if anything tries to invoke npm at runtime (shouldn't, but check)

---

## 4. Verification checklist

After steps 3.1–3.5 land, you should be able to confirm:

- `docker buildx imagetools inspect parametricmemory/parametric-memory-web:<sha>` shows an `Attestations:` block with `sbom` and `provenance` rows.
- `docker inspect parametricmemory/parametric-memory-web:<sha>` shows the OCI labels under `Config.Labels`.
- `docker compose exec web id` reports `uid=1001(nextjs)`.
- `docker compose exec web cat /proc/1/status | grep ^CapEff` reports `CapEff: 0000000000000000` (all capabilities dropped).
- `docker compose exec web touch /test-write` fails with `Read-only file system`.
- Docker Hub Scout health score for this image flips from red to (at minimum) "Supply-chain attestations: pass" and "Non-root user: pass".

---

## 5. Files touched today

| File | Change |
|---|---|
| `mmpm-website/Dockerfile` | syntax pragma, OCI labels, digest-pin TODO header |
| `mmpm-website/docker-compose.yml` | added init/user/read_only/tmpfs/cap_drop/security_opt/resource limits |
| `mmpm-website/.dockerignore` | fixed broken wildcard patterns (`\*` → `*`), added Playwright excludes |
| `mmpm-website/docs/docker-hardening-changes-2026-05-12.md` | this doc |

No `.env` files touched, no git ops run, no files deleted, no DB touched — per your ground rules.

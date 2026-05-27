# CI/CD supply-chain hardening review — mmpm-website — 2026-05-12

Companion to `docker-hardening-changes-2026-05-12.md`. The local Dockerfile/compose hardening is done. This file reviews the **GitHub Actions** side of the pipeline and lists the concrete changes needed to:

1. Ship images with SBOM + provenance attestations (closes the Scout "Missing supply chain attestations" finding).
2. Sign every published image with cosign keyless (closes any future "Image signatures" Scout policy).
3. Deploy by digest, not by tag, and verify the signature on the droplet before bringing the image up.
4. Optional: gate merges/deploys on Scout CVE policy.

Nothing in this file has been applied yet. The diffs below are proposals — confirm and I'll edit the workflow.

---

## 1. TL;DR — four edits

| # | What | Where | Effort |
|---|---|---|---|
| 1 | Add `permissions: id-token: write` + SBOM/provenance inputs + cosign install+sign | `.github/workflows/deploy.yml` | ~15 lines |
| 2 | Output the build digest and pass it to the deploy job | `.github/workflows/deploy.yml` | ~5 lines |
| 3 | Pull-by-digest on the droplet and `cosign verify` before `docker compose up` | `.github/workflows/deploy.yml` (deploy script) | ~10 lines |
| 4 | Let compose accept a digest override via `IMAGE_REF` env var | `docker-compose.yml` | 1 line |

Optional 5th: add a `docker/scout-action@v1` step to gate on critical/high CVEs. Worth doing but not required to close the current Scout findings.

---

## 2. Per-workflow assessment

### 2.1 `deploy.yml` — needs the most work (this is where images get built/pushed)

What's good already:

- Uses `docker/build-push-action@v6`, which natively supports SBOM/provenance.
- Builds and tags by commit SHA, not by branch.
- Concurrency group `deploy-production` with `cancel-in-progress: false` — won't kill an in-flight prod deploy.
- Deploys via SSH using a dedicated `DROPLET_USER`.
- Health-checks both internally (in-container) and externally (production URL) before declaring success.

What's missing:

- **No `permissions:` block on the workflow or jobs.** GitHub defaults the `GITHUB_TOKEN` to read-only for repo contents, but `id-token: write` is required for cosign keyless OIDC. Without it, cosign can't mint a Fulcio cert. Add this explicitly — keep it least-privilege.
- **No SBOM input.** `provenance` is auto-`max` for public repos and auto-`min` for private; you need to set it explicitly so it's not subject to GitHub's defaults. `sbom: true` is required regardless.
- **No cosign install / sign step.** Currently the image is pushed unsigned.
- **No digest output from the build job.** The deploy step pulls by tag (`:${{ github.sha }}`), which works but isn't tied to what was actually built. If Docker Hub were ever compromised between push and pull, the deploy would happily pull an attacker's image with the same tag.
- **No signature verification on the droplet.** The deploy script does `docker pull "$IMAGE_TAG"` and `docker compose up`. There's no `cosign verify` step.
- **`:latest` is published every deploy.** Convenience, but anyone or anything that pulls `:latest` is at the mercy of whoever pushed last. Keep it if humans use it for debugging; just be aware it's an attack surface for downstream consumers if you have any.
- **Third-party actions pinned to v-tags, not SHAs.** `appleboy/ssh-action@v1` could be moved/replaced under that tag at any time. Pinning to a commit SHA (with the `@v1` in a comment) is the GitHub-recommended hardening. This applies to `appleboy/ssh-action` and `treosh/lighthouse-ci-action`. The official `docker/*` and `actions/*` actions are lower-risk because they're org-verified.

### 2.2 `ci.yml` — no changes needed for image hardening

Runs on PRs only. No image build, no push, no deploy. Fine as-is.

### 2.3 `guards.yml` — no changes needed for image hardening

Same — no Docker involvement. Fine as-is.

### 2.4 `lighthouse.yml` — no changes needed

Builds Next.js in-CI to run Lighthouse against the rendered output. Doesn't build a Docker image. Fine as-is (and currently disabled per the comment in the file).

---

## 3. Concrete diff for `deploy.yml`

Three changes to the existing file. I'll show the relevant sections with `+` lines.

### 3.1 Add permissions at the workflow level

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for manual deploy'
        type: string
        required: false

+# Least-privilege token scope.
+#   contents: read   → checkout
+#   id-token: write  → required for cosign keyless OIDC (Fulcio cert minting)
+permissions:
+  contents: read
+  id-token: write

concurrency:
  group: deploy-production
  cancel-in-progress: false
```

### 3.2 SBOM + provenance + digest output, then cosign sign

Replace the `build-and-push` job's outputs and the `Build and push` + downstream steps:

```yaml
jobs:
  build-and-push:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.tag.outputs.tag }}
+      image_digest: ${{ steps.build.outputs.digest }}
+      image_ref: ${{ steps.tag.outputs.repo }}@${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4

      - name: Set image tag
        id: tag
-        run: echo "tag=parametricmemory/parametric-memory-web:${{ github.sha }}" >> "$GITHUB_OUTPUT"
+        run: |
+          echo "repo=parametricmemory/parametric-memory-web" >> "$GITHUB_OUTPUT"
+          echo "tag=parametricmemory/parametric-memory-web:${{ github.sha }}" >> "$GITHUB_OUTPUT"

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
+        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
+          # SBOM = list of every package in the image (SPDX, in-toto).
+          # provenance = how the image was built (SLSA, in-toto). mode=max also
+          # records the source materials so the build can be replayed.
+          sbom: true
+          provenance: mode=max
          tags: |
            parametricmemory/parametric-memory-web:latest
            ${{ steps.tag.outputs.tag }}
          build-args: |
            GIT_COMMIT_SHA=${{ github.sha }}
          cache-from: type=registry,ref=parametricmemory/parametric-memory-web:buildcache
          cache-to: type=registry,ref=parametricmemory/parametric-memory-web:buildcache,mode=max

+      - name: Install cosign
+        uses: sigstore/cosign-installer@v3
+
+      - name: Sign the image (keyless, OIDC)
+        env:
+          # Signing the digest, not the tag — tags are mutable.
+          IMAGE_REF: ${{ steps.tag.outputs.repo }}@${{ steps.build.outputs.digest }}
+        run: |
+          cosign sign --yes "$IMAGE_REF"
+          echo "Signed: $IMAGE_REF"
```

What this does:

- `permissions: id-token: write` (set workflow-wide above) gives `sigstore/cosign-installer` the OIDC token it needs.
- `sigstore/cosign-installer@v3` puts the `cosign` binary on the runner.
- `cosign sign --yes <digest>` does keyless signing: GitHub Actions OIDC token → Fulcio short-lived cert → sign the image's manifest digest → publish to Rekor transparency log. No secrets to manage.
- `--yes` accepts the Rekor transparency-log notice non-interactively (required in CI).
- The job now outputs `image_digest` and a convenience `image_ref` (`repo@sha256:…`) so the deploy job has the immutable reference.

### 3.3 Pull-by-digest and verify-before-deploy

Replace the `deploy` job's SSH script:

```yaml
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build-and-push
    environment:
      name: production
      url: https://parametric-memory.dev
    steps:
      - name: Log manual deploy reason
        if: github.event_name == 'workflow_dispatch' && inputs.reason != ''
        run: |
          echo "Manual deploy - reason: ${{ inputs.reason }}"

      - name: Deploy to droplet
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DROPLET_HOST }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.DROPLET_SSH_KEY }}
          command_timeout: 10m
          script: |
            set -euo pipefail

            cd /home/deploy/parametric-memory-web

            git fetch origin main
            git reset --hard origin/main

-            IMAGE_TAG="${{ needs.build-and-push.outputs.image_tag }}"
-            echo "Pulling image: $IMAGE_TAG"
-            docker pull "$IMAGE_TAG"
+            # Pull-by-digest — tied to the exact bytes the build produced.
+            # If Docker Hub were ever compromised between push and pull,
+            # this digest pin would refuse to load a swapped image.
+            IMAGE_REF="${{ needs.build-and-push.outputs.image_ref }}"
+            echo "Verifying signature for: $IMAGE_REF"
+
+            # Refuse to deploy unsigned images. certificate-identity-regexp
+            # must match the GitHub Actions workflow that signed the image.
+            cosign verify \
+              --certificate-identity-regexp 'https://github\.com/parametricmemory/parametric-memory-web/\.github/workflows/deploy\.yml@refs/heads/main' \
+              --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
+              "$IMAGE_REF"
+
+            echo "Pulling: $IMAGE_REF"
+            docker pull "$IMAGE_REF"

            export GIT_COMMIT_SHA="${{ github.sha }}"
+            # Compose reads IMAGE_REF if set, else falls back to :tag.
+            export IMAGE_REF
            docker compose up -d --no-build --force-recreate --remove-orphans

            echo "Waiting for container to be healthy..."
            HEALTH_OK=false
            for i in $(seq 1 20); do
              if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
                echo "Health check passed on attempt $i"
                HEALTH_OK=true
                break
              fi
              echo "Attempt $i failed, waiting 3s..."
              sleep 3
            done

            if [ "$HEALTH_OK" != "true" ]; then
              echo "ERROR: Health check failed after 20 attempts"
              docker compose logs --tail=50
              exit 1
            fi

            docker image prune -f
            echo "Deploy complete: $IMAGE_REF"
```

Caveats on the cosign verify identity regex:

- `parametricmemory/parametric-memory-web` is the GitHub owner/repo path — change to whatever your real repo path is.
- The regex anchors to `refs/heads/main`. If you ever sign from a non-main branch (release tag, hotfix branch), the verify will fail. Acceptable since you only deploy from main.
- You can broaden to `refs/heads/.*` or add a second `--certificate-identity-regexp` for a tag-release workflow if you adopt one.

---

## 4. Concrete diff for `docker-compose.yml`

One line, backward-compatible. Lets the deploy script pin to a digest while local dev keeps using the tag-based fallback.

```yaml
services:
  web:
-    image: parametricmemory/parametric-memory-web:${GIT_COMMIT_SHA:-latest}
+    # In CI the deploy script exports IMAGE_REF=parametricmemory/parametric-memory-web@sha256:…
+    # — pulls the exact image that was built+signed. For local/manual use, falls
+    # back to the tag-based reference.
+    image: ${IMAGE_REF:-parametricmemory/parametric-memory-web:${GIT_COMMIT_SHA:-latest}}
    container_name: pm-web
    ...
```

Local dev with nothing set → `parametricmemory/parametric-memory-web:latest`.
Local with `GIT_COMMIT_SHA=abc…` → `parametricmemory/parametric-memory-web:abc…`.
CI deploy with `IMAGE_REF=…@sha256:…` → the digest-pinned reference.

---

## 5. One-time droplet setup

You'll need `cosign` installed on the droplet for the verify step. One command, runs once.

**Why:** the verify step in section 3.3 calls `cosign`. If it's not installed, the deploy fails.
**Where:** SSH into the droplet as `deploy` (or whichever user the SSH action uses).
**Safe:** yes — installs from sigstore's official release, pinned to v2.x. No secrets touched.

```bash
# On the droplet, as the deploy user (or root):
COSIGN_VERSION=2.4.1
curl -fsSL -o /tmp/cosign \
  "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
echo "Verifying download..."
# Optional: verify the download against the published checksum
curl -fsSL -o /tmp/cosign.sum \
  "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign_checksums.txt"
grep cosign-linux-amd64 /tmp/cosign.sum | sha256sum -c -
chmod +x /tmp/cosign
sudo mv /tmp/cosign /usr/local/bin/cosign
cosign version
```

(Latest stable as of writing is v2.4.x — bump the version string when you run this; check https://github.com/sigstore/cosign/releases.)

---

## 6. GitHub repo settings — what to check

- **`id-token: write` is in the workflow file** (covered above) — no repo-level toggle needed; GitHub allows OIDC by default.
- **No new secrets required.** Cosign keyless uses the runner's OIDC token, not a long-lived key. You already have `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `DROPLET_*` — those stay.
- **Environment protection rules.** Your `deploy` job already uses `environment: production`. If you want approval gates on production deploys, add reviewers under Settings → Environments → production. Out of scope for image hardening, just worth flagging.
- **Branch protection** — required for `id-token: write` to be safe. If anyone can push to `main`, anyone can sign as your identity. Confirm `main` requires PR review.

---

## 7. Optional: Scout CVE gate

Adds a pre-push step that fails the build if `critical` or `high` CVEs are detected. The build-push-action would still publish the image (it runs first); the scan runs *after* push and reports back. To turn it into a true gate, move it before the push and use `load: true` instead of `push: true` for a local-only build, then push manually if the scan passes.

I'd suggest **starting in advisory mode** (no exit-code) for two weeks to see what fires, then flipping `exit-code: true` once you've accepted the baseline.

```yaml
+      - name: Docker Scout — CVE scan (advisory)
+        if: github.event_name != 'pull_request'
+        uses: docker/scout-action@v1
+        with:
+          command: cves
+          image: ${{ steps.tag.outputs.tag }}
+          only-severities: critical,high
+          # Flip to `true` after you've cleaned up the baseline. Until then,
+          # this surfaces CVEs in the workflow log without blocking deploys.
+          exit-code: false
+          summary: true
```

Requires the `DOCKERHUB_TOKEN` to have at minimum `read` scope on the repo. Yours already does (login step uses it).

---

## 8. Optional follow-ups

These are worth doing but not blocking the current Scout findings:

### 8.1 Pin third-party actions to SHAs

```yaml
- # Before:
-      uses: appleboy/ssh-action@v1
+      # Pin to commit SHA, comment the version for readability.
+      uses: appleboy/ssh-action@<40-char-sha>  # v1.x
```

Find current SHAs at https://github.com/appleboy/ssh-action/releases (click the tag, read the commit SHA). Renovate / Dependabot will keep these current if configured.

### 8.2 Renovate config to auto-bump the base image digest

Add `renovate.json` in the repo root:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "docker": {
    "pinDigests": true
  },
  "packageRules": [
    {
      "matchManagers": ["dockerfile"],
      "matchUpdateTypes": ["digest", "pin"],
      "automerge": true,
      "automergeType": "branch"
    }
  ]
}
```

Renovate will:

- Pin `FROM node:22-alpine` → `FROM node:22-alpine@sha256:…` on its first PR.
- Open a PR every time `node:22-alpine` republishes (typically weekly).
- Auto-merge digest bumps if CI passes.

### 8.3 GHCR migration (medium effort, real upside)

Docker Hub is the only registry in your pipeline that doesn't support OIDC for push auth — you have to maintain `DOCKERHUB_TOKEN`. GHCR (`ghcr.io`) accepts the GitHub Actions OIDC token directly via `permissions: packages: write`, so no long-lived token is needed.

Trade-offs:

- Pro: one fewer secret to rotate; free storage included with the repo; faster pulls if your droplet is on a GitHub-adjacent CDN region.
- Con: requires a one-time update of the deploy script's pull URLs; existing `parametricmemory/*` Docker Hub images stay there as a historical archive unless you delete them.

Not blocking anything. File it for when you have a spare hour.

---

## 9. What could break

Realistic risk register if all four changes ship together:

| Change | What might break | How to detect | How to recover |
|---|---|---|---|
| `sbom: true, provenance: mode=max` | Slightly slower builds (+30–60s). Some registry mirrors don't index attestation manifests, so `docker pull <tag>` may pull the index manifest and warn. | Workflow logs show a longer build step. | Nothing to recover — informational. |
| Cosign sign | First sign per repo prints a transparency-log notice that requires `--yes`. Without `id-token: write`, the OIDC step errors with "missing token". | Workflow fails at the sign step. | Verify the `permissions` block on the workflow. Re-run. |
| Pull-by-digest + verify | If you ever push a manual hotfix image without signing it, the next deploy will fail at verify. | Deploy step errors with `no matching signatures`. | Either sign the hotfix (`cosign sign …`) or temporarily skip verify (commit a one-liner change, deploy, revert). |
| `IMAGE_REF` in compose | If a local `.env` (or shell) accidentally exports a stale `IMAGE_REF`, dev `docker compose up` would pull that digest instead of `:latest`. | `docker compose ps` shows an unexpected image. | `unset IMAGE_REF` and retry. |

None of these are silent failures — every one shows up as a red workflow or an `EROFS`/`signature missing` log line.

---

## 10. Apply order

If you give the go-ahead, the order I'd apply in:

1. Edit `docker-compose.yml` for the `IMAGE_REF` fallback (safe — backward-compatible).
2. Install cosign on the droplet (section 5).
3. Edit `deploy.yml` — permissions, sbom/provenance, cosign install+sign, digest output, verify on droplet.
4. Trigger a deploy from `workflow_dispatch` with `reason: "test supply-chain hardening"` to validate end-to-end.
5. After the first signed image is up, optionally add the Scout CVE gate (advisory mode).
6. After two weeks of clean scans, flip Scout gate to `exit-code: true`.

Per your ground rules I won't run any git/push commands myself, won't `rm` anything, won't touch `.env*`, and won't deploy. I'll only edit the workflow YAML and the compose file when you confirm.

---

## Sources

- [Docker — Add SBOM and provenance attestations with GitHub Actions](https://docs.docker.com/build/ci/github-actions/attestations/)
- [docker/build-push-action](https://github.com/docker/build-push-action)
- [sigstore/cosign-installer](https://github.com/sigstore/cosign-installer)
- [Sigstore — Signing Containers](https://docs.sigstore.dev/cosign/signing/signing_with_containers/)
- [docker/scout-action — CVEs in CI](https://github.com/docker/scout-action)
- [Docker — Evaluate policy compliance in CI](https://docs.docker.com/scout/policy/ci/)
- [Renovate — pinDigests](https://docs.renovatebot.com/configuration-options/#pindigests)
- [GitHub — securing workflows: hardening for GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

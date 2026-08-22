/**
 * Regression test — the nginx config-sync step in .github/workflows/deploy.yml.
 *
 * Context: nginx.conf lives in the repo but nginx runs on the droplet host,
 * outside Docker (docker-compose.yml only publishes the app on
 * 127.0.0.1:3000). Before this step existed, `git reset --hard` updated the
 * checked-out copy of nginx.conf on every deploy but nothing ever applied it
 * to the live config nginx actually reads — a CSP change (see
 * src/nginx-csp.test.ts) could sit unshipped indefinitely with a green
 * deploy pipeline and no signal that anything was wrong.
 *
 * This is a plain-text/regex test, not a YAML-aware one — deliberately, to
 * match the pattern already used for nginx.conf and robots.txt elsewhere in
 * this repo (see src/nginx-csp.test.ts, src/app/__tests__/seo-headers.test.ts).
 * The workflow only runs on GitHub's runners against the real droplet, so a
 * true end-to-end test isn't possible from CI; what we CAN pin down for free
 * is that the safety properties are present and in the right order — a
 * step that skips `nginx -t`, or reloads before validating, is exactly the
 * kind of change that looks fine in review and takes the site down.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe(".github/workflows/deploy.yml — nginx config sync", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const workflow = readFileSync(path.join(repoRoot, ".github/workflows/deploy.yml"), "utf8");

  it("targets the documented live nginx config path", () => {
    expect(workflow).toContain("/etc/nginx/sites-available/parametric-memory.dev");
  });

  it("only touches nginx when the checked-out config actually differs", () => {
    // `cmp -s` is silent and exit-code-only — the right tool for a
    // deploy-time diff gate. Its absence would mean every deploy reloads
    // nginx unconditionally, which is unnecessary and, under load, avoidable
    // risk.
    expect(workflow).toMatch(/cmp -s nginx\.conf "\$NGINX_LIVE"/);
  });

  it("backs up the live config before overwriting it", () => {
    const backupIdx = workflow.indexOf('cp "$NGINX_LIVE" "$BACKUP"');
    const overwriteIdx = workflow.indexOf('cp nginx.conf "$NGINX_LIVE"');
    expect(backupIdx, "backup step missing").toBeGreaterThan(-1);
    expect(overwriteIdx, "overwrite step missing").toBeGreaterThan(-1);
    expect(backupIdx, "backup must happen BEFORE the live config is overwritten").toBeLessThan(
      overwriteIdx,
    );
  });

  it("validates with 'nginx -t' before reloading — never reload an unvalidated config", () => {
    const overwriteIdx = workflow.indexOf('cp nginx.conf "$NGINX_LIVE"');
    const testIdx = workflow.indexOf("nginx -t", overwriteIdx);
    const reloadIdx = workflow.indexOf("systemctl reload nginx", overwriteIdx);
    expect(testIdx, "nginx -t missing after the config is copied in").toBeGreaterThan(-1);
    expect(reloadIdx, "systemctl reload nginx missing").toBeGreaterThan(-1);
    expect(testIdx, "'nginx -t' must run BEFORE 'systemctl reload nginx'").toBeLessThan(reloadIdx);
  });

  it("rolls back to the backup and fails the job if validation fails", () => {
    // Everything from the failed nginx -t to the restore + non-zero exit
    // must live inside the same failure branch.
    const failureBranch = workflow.slice(
      workflow.indexOf("ERROR: new nginx.conf failed"),
      workflow.indexOf("IMAGE_TAG="),
    );
    expect(failureBranch).toMatch(/cp "\$BACKUP" "\$NGINX_LIVE"/);
    expect(failureBranch).toMatch(/exit 1/);
  });

  it("fails loudly if the expected site file is missing rather than silently skipping it", () => {
    expect(workflow).toMatch(/sudo test -f "\$NGINX_LIVE"/);
    const guardIdx = workflow.indexOf('sudo test -f "$NGINX_LIVE"');
    const exitIdx = workflow.indexOf("exit 1", guardIdx);
    expect(exitIdx, "missing-file guard must exit non-zero").toBeGreaterThan(guardIdx);
  });

  it("runs before the app container is redeployed, so nginx and app config land in the same deploy", () => {
    const nginxIdx = workflow.indexOf("NGINX_LIVE=");
    const imageTagIdx = workflow.indexOf("IMAGE_TAG=");
    expect(nginxIdx).toBeGreaterThan(-1);
    expect(imageTagIdx).toBeGreaterThan(-1);
    expect(nginxIdx).toBeLessThan(imageTagIdx);
  });
});

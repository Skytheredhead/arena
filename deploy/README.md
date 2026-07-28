# Deployment operator notes

Arena deployment is intentionally split into module, edge, frontend, and
verification gates. The executable source remains in `apps/server` and
`apps/client`; this directory contains no unattended production mutation.

Use:

- [`../docs/production-cutover.md`](../docs/production-cutover.md) for the exact
  Arena database identity and guarded publish;
- [`../docs/cloudflare-origin-policy.md`](../docs/cloudflare-origin-policy.md)
  for the public browser-origin boundary;
- [`../docs/verification-checklist.md`](../docs/verification-checklist.md) for
  acceptance evidence;
- [`systemd/README.md`](systemd/README.md) for the obsolete unit boundary.

No credential belongs under `deploy/`. Commands that need SpacetimeDB owner
authentication, Cloudflare/Vercel access, SSH, sudo, or physical QA remain
interactive owner steps.

# Cloudflare origin and WebSocket policy

`arenaapi.skylarenns.com` is a public game API, not a website. The desired
browser caller is exactly:

```text
https://arena.skylarenns.com
```

Origin filtering reduces cross-site browser abuse; it is not authentication.
Non-browser clients can forge `Origin`, so SpacetimeDB identity checks,
server-side validation, and reducer rate limits remain mandatory.

The production frontend's optional `VITE_SPACETIME_FALLBACK_URI` must remain
blank unless a separate endpoint has been explicitly reviewed. A fallback
origin needs an exact CSP `connect-src` HTTPS/WSS allowlist entry and an
equivalent edge-origin policy; do not loosen the primary Arena rule or add a
wildcard to accommodate it.

## Existing route to preserve

The audited Cloudflare Tunnel ingress already maps:

```text
arenaapi.skylarenns.com -> http://127.0.0.1:4789
```

Do not replace the tunnel, expose a new public port, rotate its credential, or
modify unrelated ingress entries for this cutover.

## Active production rules

The following Cloudflare rules were confirmed Active on 2026-07-27. Preserve
their scope and IDs; update the existing rule rather than creating a duplicate.

| Rule                                         | ID                                 | Active behavior                              |
| -------------------------------------------- | ---------------------------------- | -------------------------------------------- |
| `Arena API — production browser origin`      | `0c0a0dc32be7419a8051f3a97ce3aecb` | WAF custom rule, Block                       |
| `Arena API — exact production CORS response` | `44a5b310b6b040a4a6609338527a5b9a` | Response Header Transform, static exact ACAO |

The WAF expression is:

```text
(http.host eq "arenaapi.skylarenns.com"
 and any(http.request.headers["origin"][*] ne "https://arena.skylarenns.com"))
```

It rejects malformed requests containing multiple Origin values when any value
is not allowlisted. With no Origin header the array is empty and the expression
does not match, so CLI, health, and other non-browser protocol traffic remains
possible. Require SpacetimeDB authentication for administrative operations;
never treat a missing or allowed Origin as trusted.

## CORS response policy

The active response rule is scoped to
`http.host eq "arenaapi.skylarenns.com"` and sets:

```text
Access-Control-Allow-Origin: https://arena.skylarenns.com
```

This replaces the previously observed wildcard at the edge. Retain only the
methods and request headers SpacetimeDB 2.1.0 needs, and never combine a
wildcard origin with credentials. Verify preflight and ordinary HTTP responses.
WebSocket enforcement belongs in the request WAF rule because a
`101 Switching Protocols` response does not use browser CORS in the same way as
fetch.

## Rate limiting

Apply edge rate limiting narrowly to abusive connection or reducer traffic
only after observing normal 12-player behavior. Never use a threshold that
conflicts with reconnect bursts, subscriptions, or the module's 240-input/s
safety ceiling. Server reducer limits remain authoritative even when an edge
rule exists.

## Verification matrix

| Request                                                     | Expected                                          |
| ----------------------------------------------------------- | ------------------------------------------------- |
| HTTPS/preflight with `Origin: https://arena.skylarenns.com` | Allowed; exact ACAO value                         |
| WebSocket upgrade with the allowed Origin                   | `101`, then valid SpacetimeDB protocol traffic    |
| Request with `Origin: https://evil.example`                 | Blocked at Cloudflare                             |
| Authenticated CLI/non-browser request without Origin        | Reaches SpacetimeDB; authorization still enforced |
| Request to an unrelated hostname                            | Unaffected by these rules                         |

Pre-cutover curl notes from 2026-07-27 are historical only. The bare API-root
response has since been observed changing from the earlier recorded 200 to
404, so neither status is current release evidence.

After the module and frontend cutover, capture fresh results for every row in
the matrix against the actual SpacetimeDB HTTP and WebSocket protocol paths.
Record the request path, timestamp, Origin, status, ACAO value, successful
protocol exchange where applicable, sampled Cloudflare events, and rollback
version. HTTP checks alone do not prove gameplay or a successful WebSocket
protocol session. Do not commit an API token, private zone metadata, tunnel
credential, or Access cookie.

## Official references

- [Cloudflare request-header field](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.request.headers/)
- [Cloudflare request-header values](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.request.headers.values/)
- [WAF custom rules](https://developers.cloudflare.com/waf/custom-rules/)
- [Request Header Transform Rules](https://developers.cloudflare.com/rules/transform/request-header-modification/)
- [Response Header Transform Rules](https://developers.cloudflare.com/rules/transform/response-header-modification/)
- [Cloudflare Tunnel public hostnames](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/routing-to-tunnel/)

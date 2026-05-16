# Contract — `GET /api/health`

The single public HTTP interface introduced by feature 001.

## Endpoint

| Field | Value |
|---|---|
| Method | `GET` |
| Path | `/api/health` |
| Auth | None (public). Future gating is a feature-002+ concern. |
| Content-Type (response) | `application/json` |
| Caching | None. Route is rendered dynamically; no client/server cache headers. |

## Request

No request body, no query parameters, no required headers.

## Responses

### Healthy — `200 OK`

```json
{
  "data": {
    "app": "ok",
    "database": "ok"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `data.app` | `"ok"` | The Next.js process is responding to requests. |
| `data.database` | `"ok"` | A raw `SELECT 1` query through the Prisma client succeeded. |

### Database unavailable — `503 Service Unavailable`

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Database is not reachable: <human-readable reason>"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `error.code` | `"DATABASE_UNAVAILABLE"` | Stable machine-readable code identifying the failing component. |
| `error.message` | `string` | Human-readable explanation. May include the underlying error type (e.g., `connection refused`) but MUST NOT leak connection strings or secrets. |

### App down

Not applicable to this contract — if the app itself is down, the request never reaches the handler. Liveness vs. readiness split is deferred to a future feature.

## Envelope conformance

Both responses conform to the constitution's response shape: `{ data } | { error: { code, message } }`. HTTP status reflects outcome (200 for success, 503 for the unhealthy case).

## Implementation notes (for the implementer)

- Use `prisma.$queryRaw\`SELECT 1\`` — not `$queryRawUnsafe`, not a model query.
- Wrap in `try/catch`. Caught exception → 503 envelope. The exception's message goes into `error.message` (trimmed if absurdly long).
- Declare `export const dynamic = "force-dynamic"` in the route file so Next.js never tries to statically render or cache this endpoint.
- Do not introduce a global error handler — the try/catch in this route is the only error path.

## Test coverage

A Playwright test at `tests/e2e/health.spec.ts` asserts the healthy-path contract end-to-end (status 200, body shape). The unhealthy-path (503 + `DATABASE_UNAVAILABLE`) is exercised manually for this feature (stop the Postgres container, hit the endpoint); a future task can add an automated test once the harness supports DB-state manipulation.

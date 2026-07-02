# @matter/thread-br — Migration Record

Record of how this package was brought into the matter.js monorepo from
`@matter-server/thread-br` (the OHF Matter Server), and the deliberate decisions taken.
For maintainer review of the rationale behind what was aligned and what was kept as-is.

## What changed (idiom alignment)

- **Scope/name:** `@matter-server/thread-br` → `@matter/thread-br`; headers relicensed to
  `Copyright 2022-2026 Matter.js Authors`; dual ESM+CJS emit (nacho-build).
- **Imports:** depend on leaf packages, not the `@matter/main` umbrella —
  `Bytes`/`Logger`/`Observable`/`Environment`/`Crypto`/`MatterError`/`TimeoutError` and the
  DNS record types from `@matter/general`; `MdnsService` from `@matter/protocol`.
- **Errors → `MatterError`:** `CoapTimeoutError` and `CommissionerTimeoutError` now extend
  `TimeoutError`; `CommissionerRejectedError` extends `MatterError`. Class names, messages, and
  `instanceof` behavior preserved (consumers catch these).
- **Timers → matter.js `Time`:** every raw `setTimeout`/`setInterval` across the package
  (OTBR-REST fetch-abort, MeshCoP diagnostic windows, Commissioner keepalive/retry, CoAP
  RFC 7252 retransmit, DTLS RFC 6347 retransmit + connect-deadline) replaced with
  `Time.getTimer`/`getPeriodicTimer`/`Time.sleep`. All durations and timing relationships are
  byte-for-byte preserved. Tests drive them with `MockTime` (`enable` + `advance`), which also
  removed the package's last process-exit leak and the test-injected `setTimeoutImpl` hooks.
- **UDP transport → matter.js `Network`:** `NobleDtlsChannel` now obtains a `UdpSocket` from
  `Environment.get(Network)` instead of `node:dgram`. An optional `environment` flows through
  `connectMeshcop` → `DtlsConnectOpts` (defaults to `Environment.default`, so consumers are
  unaffected). The DTLS handshake test runs over `MockNetwork`/`NetworkSimulator` instead of a
  real UDP loopback. mDNS discovery already used matter.js `MdnsService`.

## What was kept as-is, and why (deliberate, not gaps)

- **AES-CCM-8 stays on Node `crypto`** (`dtls/record/AesCcm8.ts`). Thread MeshCoP DTLS uses
  `*_WITH_AES_128_CCM_8` (8-byte tag); matter.js `Crypto.encrypt`/`decrypt` is hardcoded
  AES-128-CCM-**16** (16-byte tag). Not interchangeable. Revisit only if matter.js exposes a
  configurable-tag CCM.
- **AES-CMAC stays on Node `crypto`** (`crypto/AesCmacPrf128.ts`, used by `Pskc`). matter.js
  `Crypto` exposes no raw AES block primitive to build CMAC on.
- **TLS PRF stays hand-rolled** (`dtls/prf/TlsPrf.ts`, HMAC-SHA256). Swapping to
  `Crypto.signHmac` was evaluated and **deferred**: it is mbedTLS-matched, vector-tested, and
  interop-critical, and would yield no portability benefit while CCM-8/CMAC already pin the
  package to Node `crypto`.
- **`@noble/curves` stays** (declared dep). EC-JPAKE needs raw P-256 point/scalar arithmetic
  (Schnorr proof, hash-to-scalar, scalar-mod-n) that `Crypto` does not expose. It is also a
  transitive dep of `@matter/general`.
- **`@noble/hashes` stays.** Swapping its 2 `sha256` sites to `Crypto.computeHash` was
  evaluated and **deferred**: `@noble/hashes` is a transitive dependency of `@noble/curves`
  (which we keep), so the swap removes nothing from the tree while adding async propagation
  through EC-JPAKE and vector-break risk.
- **`coap-packet` stays** (declared dep). **New third-party dependency for the matter.js
  monorepo** — no `@matter` package provides CoAP framing. Flagged for maintainer sign-off.
  Our `CoapClient` implements the RFC 7252 CON/ACK/separate-response state machine on top of it.
- **MeshCoP / Network-Diagnostic TLV codecs stay** (`tlv/`). Thread MeshCoP TLV
  (`[type:1][length:1/3][value]`) is a different wire format from Matter TLV; not substitutable.

## Runtime requirement: Node.js (for now)

The package targets a Node.js runtime. The binding constraints are **crypto**, not networking:
AES-CCM-8 and AES-CMAC require Node `crypto`, and `coap-packet` is `Buffer`-based. The UDP
transport is now abstracted behind matter.js `Network`, so the networking layer itself is
portable — but the crypto keeps the package Node-bound. If matter.js `Crypto` later gains
configurable-tag CCM and AES-CMAC, browser/RN support could be revisited.

## Deferred / follow-up (carried from the source effort)

See [CAPABILITY-BACKLOG.md](./CAPABILITY-BACKLOG.md). Notably "built but not yet wired":
`childIpv6Addresses`/`routerNeighbors` decode but aren't on a WS wire; `energyScan`/`panIdQuery`/
`getEnergyScanTask` exist but no caller wires them. Fold these into the live-OTBR validation pass.
The `ROUTER_NEIGHBOR(31)` test fixture is hand-built and wants a real-wire capture.

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes, Environment } from "@matter/general";

/**
 * Connection parameters consumed by {@link connectDtls}. The `random` and
 * `ephemeralScalar` overrides exist for deterministic tests; production callers
 * leave them unset and the channel wires in {@link Entropy}-backed defaults.
 */
export interface DtlsConnectOpts {
    /** IPv6 (or IPv4) address of the peer's MeshCoP DTLS port. Link-local zone IDs (`%en0`) accepted. */
    address: string;

    /** UDP port (typically 49191 for the ot-cli simulator's MeshCoP service). */
    port: number;

    /** EC-JPAKE password (PSKc — 16 bytes for Thread MeshCoP). */
    password: Bytes;

    /** Override the IPv4/IPv6 binding hint; default inferred from `address`. */
    type?: "udp4" | "udp6";

    /** RFC 6347 §4.2.4 initial retransmit interval. Default 1000ms. */
    initialRetransmitMs?: number;

    /** RFC 6347 §4.2.4 retransmit cap (doubling stops here). Default 60000ms. */
    maxRetransmitMs?: number;

    /** Maximum retransmit attempts before giving up. Default 5 (~31s total at default initial). */
    maxRetransmits?: number;

    /** Path-MTU advisory. Default 1280 — the Thread mesh constraint. */
    mtu?: number;

    /** Connect timeout. Default 30000ms. */
    connectTimeoutMs?: number;

    /** Override `random()` for deterministic testing. Production: CSPRNG. */
    random?: () => Bytes;

    /** Override `ephemeralScalar()` for deterministic testing. Production: CSPRNG-backed. */
    ephemeralScalar?: () => bigint;

    /** Environment providing the {@link Network} used for the UDP transport and the {@link Crypto} entropy source. */
    environment: Environment;
}

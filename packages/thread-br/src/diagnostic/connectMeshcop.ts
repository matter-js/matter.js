/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/main";
import { CoapClient } from "../coap/CoapClient.js";
import { Commissioner } from "../commissioner/Commissioner.js";
import type { ThreadNetworkCredentials } from "../credentials/ThreadNetworkCredentials.js";
import type { BorderRouterEntry } from "../discovery/BorderRouterEntry.js";
import { createDtlsBackend, type DtlsBackendKind } from "../dtls/socket/createDtlsBackend.js";
import type { DtlsBackend } from "../dtls/socket/DtlsBackend.js";
import type { DiagnosticSource } from "./DiagnosticSource.js";
import { MeshCopDiagnosticSource } from "./MeshCopDiagnosticSource.js";

const logger = Logger.get("ConnectMeshcop");

export interface ConnectMeshcopOpts {
    creds: ThreadNetworkCredentials;
    br: BorderRouterEntry;
    /** Override the BR address selection. Bypasses the link-local guard. */
    address?: string;
    /** Override the BR port. Defaults to {@link BorderRouterEntry.meshcopPort}. */
    port?: number;
    /** DTLS backend kind. Defaults to `"noble"`. */
    backendKind?: DtlsBackendKind;
    /** @internal — for testing. Override the default backend factory. */
    makeBackend?: () => DtlsBackend;
}

export interface MeshcopHandle {
    source: DiagnosticSource;
    close: () => Promise<void>;
}

/**
 * Set up the per-network MeshCoP plumbing for diagnostic queries:
 * DTLS-EC-JPAKE handshake → CoAP client → Commissioner → MeshCopDiagnosticSource.
 *
 * Pure link-local (`fe80::/10`) IPv6 addresses are skipped: scope IDs are not
 * preserved through every mDNS resolver path, and the main HA SkyConnect /
 * Yellow / Green deployments always advertise a ULA address. If only
 * link-local addresses are present, this throws with a clear message.
 */
export async function connectMeshcop(opts: ConnectMeshcopOpts): Promise<MeshcopHandle> {
    const address = opts.address ?? selectBrAddress(opts.br.addresses);
    const port = opts.port ?? opts.br.meshcopPort;
    if (port === undefined) {
        throw new Error("connectMeshcop: BR has no meshcopPort and no opts.port override");
    }

    logger.debug(`[ThreadDiag] connectMeshcop START ${address}:${port}`);
    const dtlsStart = Date.now();
    const backend = opts.makeBackend?.() ?? createDtlsBackend({ kind: opts.backendKind ?? "noble" });
    const socket = await backend.connect({
        address,
        port,
        password: opts.creds.pskc,
        type: address.includes(":") ? "udp6" : "udp4",
    });
    logger.debug(`[ThreadDiag] DTLS handshake OK ${address}:${port} duration=${Date.now() - dtlsStart}ms`);

    try {
        const coap = new CoapClient(socket);
        const commissioner = new Commissioner(coap);
        const source = new MeshCopDiagnosticSource(commissioner, coap, opts.creds.meshLocalPrefix);
        return {
            source,
            close: async () => {
                logger.debug(`[ThreadDiag] connectMeshcop CLOSE ${address}:${port}`);
                await coap.close();
            },
        };
    } catch (err) {
        logger.warn(`[ThreadDiag] connectMeshcop post-DTLS setup FAIL ${address}:${port}: ${err}`);
        await socket.close().catch(() => {});
        throw err;
    }
}

function selectBrAddress(addresses: readonly string[]): string {
    if (addresses.length === 0) {
        throw new Error("connectMeshcop: BR has no addresses");
    }

    const usable = new Array<string>();
    for (const addr of addresses) {
        if (!isLinkLocal(addr)) usable.push(addr);
    }
    if (usable.length === 0) {
        throw new Error("connectMeshcop: BR has only link-local addresses; scoped addresses not yet supported");
    }

    return rankAddress(usable)[0];
}

function isLinkLocal(addr: string): boolean {
    const lower = addr.toLowerCase();
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
        return true;
    }
    return false;
}

/**
 * Order: ULA IPv6 → other IPv6 → IPv4. ULA covers `fc00::/7` (`fc??`/`fd??`),
 * which is what the OpenThread / OTBR routing prefix lives in.
 */
function rankAddress(addresses: readonly string[]): string[] {
    const tier = (addr: string): number => {
        const lower = addr.toLowerCase();
        if (!lower.includes(":")) return 2;
        if (lower.startsWith("fc") || lower.startsWith("fd")) return 0;
        return 1;
    };

    return [...addresses].sort((a, b) => tier(a) - tier(b));
}

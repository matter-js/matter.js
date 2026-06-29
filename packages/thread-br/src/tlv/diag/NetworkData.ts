/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoded Thread Network Data (Network Diagnostic TLV type 7).
 *
 * Network Data is itself a nested TLV structure. Layout per Thread spec §5.13
 * and OpenThread `src/core/thread/network_data_tlvs.hpp`:
 *
 *   Each TLV: [type:1][length:1][value:length]
 *     - The type byte packs the stable flag in bit 0: typeByte = (type << 1) | stable.
 *     - Network Data TLVs do NOT use the MeshCoP 0xFF extended-length escape, so
 *       this stream needs its own walker rather than `BasicTlv.walk`.
 *
 *   Top-level TLV types: Has-Route(0), Prefix(1), Border-Router(2), 6LoWPAN-ID(3),
 *   Commissioning(4), Service(5), Server(6).
 *
 *   Prefix TLV value (`PrefixTlv`):
 *     [0]      uint8     Domain ID
 *     [1]      uint8     Prefix Length (bits)
 *     [2..]    bytes     Prefix, ceil(prefixLength/8) bytes
 *     [..]     TLVs      Sub-TLVs (Has-Route, Border-Router, 6LoWPAN-ID)
 *
 *   Has-Route TLV value: array of 3-byte entries (`HasRouteEntry`):
 *     [0..1]   uint16-be RLOC16
 *     [2]      uint8     flags (preference in bits 7..6)
 *
 *   Border-Router TLV value: array of 4-byte entries (`BorderRouterEntry`):
 *     [0..1]   uint16-be RLOC16
 *     [2..3]   uint16-be flags (P/S/D/C/R/O/N/DP and preference)
 *
 *   6LoWPAN-ID (Context) TLV value (`ContextTlv`):
 *     [0]      uint8     compress flag (bit 4) | Context ID (bits 3..0)
 *     [1]      uint8     Context Length (bits)
 *
 *   Service TLV value (`ServiceTlv`):
 *     [0]      uint8     T flag (bit 7) | reserved | Service ID (bits 3..0)
 *     if T == 0: [1..4] uint32-be Enterprise Number; else Enterprise Number is the
 *                Thread reserved value (0xFFFFFFFF semantically; encoded by T flag).
 *     [n]      uint8     Service Data Length
 *     [..]     bytes     Service Data
 *     [..]     TLVs      Server sub-TLVs
 *
 *   Server TLV value (`ServerTlv`):
 *     [0..1]   uint16-be RLOC16
 *     [2..]    bytes     Server Data
 *
 * Anything not understood is preserved as a raw `{ type, stable, value }` entry,
 * and `raw` always holds the full original bytes so no data is lost.
 */

export interface NetworkDataEntry {
    type: number;
    stable: boolean;
    value: Uint8Array;
}

export interface HasRouteEntry {
    rloc16: number;
    preference: number;
}

export interface BorderRouterEntry {
    rloc16: number;
    flags: number;
}

export interface NetworkDataPrefix {
    domainId: number;
    prefixLength: number;
    prefix: Uint8Array;
    hasRoutes: HasRouteEntry[];
    borderRouters: BorderRouterEntry[];
}

export interface NetworkDataServer {
    rloc16: number;
    serverData: Uint8Array;
}

export interface NetworkDataService {
    serviceId: number;
    threadEnterprise: boolean;
    enterpriseNumber?: number;
    serviceData: Uint8Array;
    servers: NetworkDataServer[];
}

export interface ThreadNetworkData {
    entries: NetworkDataEntry[];
    prefixes: NetworkDataPrefix[];
    services: NetworkDataService[];
    raw: Uint8Array;
}

const enum NetworkDataTlvType {
    HasRoute = 0,
    Prefix = 1,
    BorderRouter = 2,
    Context = 3,
    Commissioning = 4,
    Service = 5,
    Server = 6,
}

const HAS_ROUTE_ENTRY_BYTES = 3;
const BORDER_ROUTER_ENTRY_BYTES = 4;
const HAS_ROUTE_PREFERENCE_SHIFT = 6;
const SERVICE_THREAD_FLAG = 0x80;
const SERVICE_ID_MASK = 0x0f;

function walkTlvs(blob: Uint8Array): NetworkDataEntry[] {
    const out = new Array<NetworkDataEntry>();
    let offset = 0;
    while (offset < blob.length) {
        if (offset + 2 > blob.length) {
            throw new Error(`Truncated Network Data TLV header at offset ${offset}`);
        }
        const typeByte = blob[offset];
        const length = blob[offset + 1];
        const valueStart = offset + 2;
        const valueEnd = valueStart + length;
        if (valueEnd > blob.length) {
            throw new Error(
                `Truncated Network Data TLV value at offset ${offset} (type=${typeByte >> 1}, length=${length})`,
            );
        }
        out.push({ type: typeByte >> 1, stable: (typeByte & 0x1) !== 0, value: blob.slice(valueStart, valueEnd) });
        offset = valueEnd;
    }
    return out;
}

function parseHasRoutes(value: Uint8Array): HasRouteEntry[] {
    const out = new Array<HasRouteEntry>();
    for (let i = 0; i + HAS_ROUTE_ENTRY_BYTES <= value.length; i += HAS_ROUTE_ENTRY_BYTES) {
        out.push({
            rloc16: (value[i] << 8) | value[i + 1],
            preference: value[i + 2] >> HAS_ROUTE_PREFERENCE_SHIFT,
        });
    }
    return out;
}

function parseBorderRouters(value: Uint8Array): BorderRouterEntry[] {
    const out = new Array<BorderRouterEntry>();
    for (let i = 0; i + BORDER_ROUTER_ENTRY_BYTES <= value.length; i += BORDER_ROUTER_ENTRY_BYTES) {
        out.push({
            rloc16: (value[i] << 8) | value[i + 1],
            flags: (value[i + 2] << 8) | value[i + 3],
        });
    }
    return out;
}

function parsePrefix(value: Uint8Array): NetworkDataPrefix {
    const domainId = value[0];
    const prefixLength = value[1];
    const prefixBytes = Math.ceil(prefixLength / 8);
    const prefix = value.slice(2, 2 + prefixBytes);

    const hasRoutes = new Array<HasRouteEntry>();
    const borderRouters = new Array<BorderRouterEntry>();
    for (const sub of walkTlvs(value.subarray(2 + prefixBytes))) {
        if (sub.type === NetworkDataTlvType.HasRoute) {
            hasRoutes.push(...parseHasRoutes(sub.value));
        } else if (sub.type === NetworkDataTlvType.BorderRouter) {
            borderRouters.push(...parseBorderRouters(sub.value));
        }
    }
    return { domainId, prefixLength, prefix, hasRoutes, borderRouters };
}

function parseService(value: Uint8Array): NetworkDataService {
    const flags = value[0];
    const threadEnterprise = (flags & SERVICE_THREAD_FLAG) !== 0;
    const serviceId = flags & SERVICE_ID_MASK;

    let offset = 1;
    let enterpriseNumber: number | undefined;
    if (!threadEnterprise) {
        if (value.length < 5) {
            throw new Error(`Truncated Service TLV: ${value.length} bytes, need 5 for enterprise number`);
        }
        enterpriseNumber = ((value[1] << 24) | (value[2] << 16) | (value[3] << 8) | value[4]) >>> 0;
        offset = 5;
    }
    if (offset >= value.length) {
        throw new Error(`Truncated Service TLV: missing service data length at offset ${offset}`);
    }
    const serviceDataLength = value[offset];
    offset += 1;
    const serviceData = value.slice(offset, offset + serviceDataLength);
    offset += serviceDataLength;

    const servers = new Array<NetworkDataServer>();
    for (const sub of walkTlvs(value.subarray(offset))) {
        if (sub.type === NetworkDataTlvType.Server) {
            if (sub.value.length < 2) continue;
            servers.push({ rloc16: (sub.value[0] << 8) | sub.value[1], serverData: sub.value.slice(2) });
        }
    }
    return { serviceId, threadEnterprise, enterpriseNumber, serviceData, servers };
}

export namespace NetworkData {
    export function decode(value: Uint8Array): ThreadNetworkData {
        const raw = value.slice();

        let entries: NetworkDataEntry[];
        try {
            entries = walkTlvs(value);
        } catch {
            // A truncated top-level stream must not abort the whole node's diagnostic
            // decode; `raw` preserves the bytes for any consumer that wants them.
            return { entries: [], prefixes: [], services: [], raw };
        }

        const prefixes = new Array<NetworkDataPrefix>();
        const services = new Array<NetworkDataService>();
        for (const entry of entries) {
            // Structured sub-TLV parsing is best-effort: a malformed inner Prefix/Service
            // must not discard the top-level entry list or the always-present `raw`.
            try {
                if (entry.type === NetworkDataTlvType.Prefix) {
                    prefixes.push(parsePrefix(entry.value));
                } else if (entry.type === NetworkDataTlvType.Service) {
                    services.push(parseService(entry.value));
                }
            } catch {
                // Leave this entry as a raw `entries[]` item; `raw` preserves its bytes.
            }
        }
        return { entries, prefixes, services, raw };
    }
}

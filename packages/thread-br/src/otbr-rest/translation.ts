/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import type { DiagnosticResponse } from "../diagnostic/DiagnosticResponse.js";
import type { ChildTableEntry } from "../tlv/diag/ChildTable.js";
import type { Connectivity, ParentPriority } from "../tlv/diag/Connectivity.js";
import type { LeaderData } from "../tlv/diag/LeaderData.js";
import type { MacCounters } from "../tlv/diag/MacCounters.js";
import type { MleCounters } from "../tlv/diag/MleCounters.js";
import type { Mode } from "../tlv/diag/Mode.js";
import { NetworkData } from "../tlv/diag/NetworkData.js";
import type { Route64, Route64Entry } from "../tlv/diag/Route64.js";
import { OtbrRestError } from "./OtbrRestError.js";

const TIMEOUT_EXP_MIN = 4;
const IPV6_BYTES = 16;
const IPV6_GROUPS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : undefined;
}

function requireNumber(record: Record<string, unknown>, key: string, where: string): number {
    const v = asNumber(record[key]);
    if (v === undefined) throw new OtbrRestError("rest_protocol", `${where}: missing numeric ${key}`);
    return v;
}

function parseHexBytes(hex: string, where: string, expectedLen?: number): Uint8Array {
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new OtbrRestError("rest_protocol", `${where}: not hex`);
    }
    if (hex.length % 2 !== 0) {
        throw new OtbrRestError("rest_protocol", `${where}: odd hex length`);
    }
    if (expectedLen !== undefined && hex.length !== expectedLen * 2) {
        throw new OtbrRestError("rest_protocol", `${where}: expected ${expectedLen} bytes, got ${hex.length / 2}`);
    }
    return Bytes.of(Bytes.fromHex(hex));
}

function translateMode(input: Record<string, unknown>): Mode {
    return {
        rxOnWhenIdle: requireNumber(input, "rxOnWhenIdle", "mode") !== 0,
        fullThreadDevice: requireNumber(input, "deviceType", "mode") !== 0,
        fullNetworkData: requireNumber(input, "networkData", "mode") !== 0,
    };
}

function parentPriorityFromInt(raw: number): ParentPriority {
    if (raw > 0) return 1;
    if (raw < 0) return -1;
    return 0;
}

function translateConnectivity(input: Record<string, unknown>): Connectivity {
    return {
        parentPriority: parentPriorityFromInt(requireNumber(input, "parentPriority", "connectivity")),
        linkQuality3: requireNumber(input, "linkQuality3", "connectivity"),
        linkQuality2: requireNumber(input, "linkQuality2", "connectivity"),
        linkQuality1: requireNumber(input, "linkQuality1", "connectivity"),
        leaderCost: requireNumber(input, "leaderCost", "connectivity"),
        idSequence: requireNumber(input, "idSequence", "connectivity"),
        activeRouters: requireNumber(input, "activeRouters", "connectivity"),
        sedBufferSize: requireNumber(input, "sedBufferSize", "connectivity"),
        sedDatagramCount: requireNumber(input, "sedDatagramCount", "connectivity"),
    };
}

function translateRoute(input: Record<string, unknown>): Route64 {
    const idSequence = requireNumber(input, "idSequence", "route");
    const routeData = asArray(input["routeData"]);
    if (routeData === undefined) {
        throw new OtbrRestError("rest_protocol", "route: missing routeData array");
    }
    const entries = new Array<Route64Entry>();
    for (const raw of routeData) {
        const r = asRecord(raw);
        if (r === undefined) {
            throw new OtbrRestError("rest_protocol", "route.routeData: entry is not an object");
        }
        entries.push({
            routerId: requireNumber(r, "routeId", "route.routeData"),
            linkQualityOut: requireNumber(r, "linkQualityOut", "route.routeData"),
            linkQualityIn: requireNumber(r, "linkQualityIn", "route.routeData"),
            routeCost: requireNumber(r, "routeCost", "route.routeData"),
        });
    }
    return { idSequence, entries };
}

function translateLeaderData(input: Record<string, unknown>): LeaderData {
    return {
        partitionId: requireNumber(input, "partitionId", "leaderData"),
        weighting: requireNumber(input, "weighting", "leaderData"),
        dataVersion: requireNumber(input, "dataVersion", "leaderData"),
        stableDataVersion: requireNumber(input, "stableDataVersion", "leaderData"),
        leaderRouterId: requireNumber(input, "leaderRouterId", "leaderData"),
    };
}

function translateMacCounters(input: Record<string, unknown>): MacCounters {
    return {
        ifInUnknownProtos: requireNumber(input, "ifInUnknownProtos", "macCounters"),
        ifInErrors: requireNumber(input, "ifInErrors", "macCounters"),
        ifOutErrors: requireNumber(input, "ifOutErrors", "macCounters"),
        ifInUcastPkts: requireNumber(input, "ifInUcastPkts", "macCounters"),
        ifInBroadcastPkts: requireNumber(input, "ifInBroadcastPkts", "macCounters"),
        ifInDiscards: requireNumber(input, "ifInDiscards", "macCounters"),
        ifOutUcastPkts: requireNumber(input, "ifOutUcastPkts", "macCounters"),
        ifOutBroadcastPkts: requireNumber(input, "ifOutBroadcastPkts", "macCounters"),
        ifOutDiscards: requireNumber(input, "ifOutDiscards", "macCounters"),
    };
}

function requireBigInt(record: Record<string, unknown>, key: string, where: string): bigint {
    const v = record[key];
    if (typeof v === "bigint") return v;
    const n = asNumber(v);
    if (n === undefined) throw new OtbrRestError("rest_protocol", `${where}: missing numeric ${key}`);
    return BigInt(Math.trunc(n));
}

function translateMleCounters(input: Record<string, unknown>): MleCounters {
    return {
        disabledRole: requireNumber(input, "disabledRole", "mleCounters"),
        detachedRole: requireNumber(input, "detachedRole", "mleCounters"),
        childRole: requireNumber(input, "childRole", "mleCounters"),
        routerRole: requireNumber(input, "routerRole", "mleCounters"),
        leaderRole: requireNumber(input, "leaderRole", "mleCounters"),
        attachAttempts: requireNumber(input, "attachAttempts", "mleCounters"),
        partitionIdChanges: requireNumber(input, "partitionIdChanges", "mleCounters"),
        betterPartitionAttachAttempts: requireNumber(input, "betterPartitionAttachAttempts", "mleCounters"),
        parentChanges: requireNumber(input, "parentChanges", "mleCounters"),
        trackedTime: requireBigInt(input, "trackedTime", "mleCounters"),
        disabledTime: requireBigInt(input, "disabledTime", "mleCounters"),
        detachedTime: requireBigInt(input, "detachedTime", "mleCounters"),
        childTime: requireBigInt(input, "childTime", "mleCounters"),
        routerTime: requireBigInt(input, "routerTime", "mleCounters"),
        leaderTime: requireBigInt(input, "leaderTime", "mleCounters"),
    };
}

function translateChildTable(input: unknown[]): ChildTableEntry[] {
    const out = new Array<ChildTableEntry>();
    for (const raw of input) {
        const r = asRecord(raw);
        if (r === undefined) {
            throw new OtbrRestError("rest_protocol", "childTable: entry is not an object");
        }
        const modeRecord = asRecord(r["mode"]);
        if (modeRecord === undefined) {
            throw new OtbrRestError("rest_protocol", "childTable: entry missing mode");
        }
        const exp = requireNumber(r, "timeout", "childTable.timeout");
        const clampedExp = exp < TIMEOUT_EXP_MIN ? TIMEOUT_EXP_MIN : exp;
        out.push({
            timeoutExponent: exp,
            timeoutSeconds: 1 << (clampedExp - TIMEOUT_EXP_MIN),
            // OTBR /diagnostics omits the wire-form 2-bit incoming-link-quality field
            // for child entries; mirror OpenThread's default of 0.
            incomingLinkQuality: 0,
            childId: requireNumber(r, "childId", "childTable"),
            mode: translateMode(modeRecord),
        });
    }
    return out;
}

/**
 * Parse an IPv6 textual address into 16 bytes. Supports full forms and `::`
 * compression. Does not handle IPv4-mapped (`::ffff:1.2.3.4`) or zone IDs
 * (`%`); OTBR `IP6AddressList` never returns either.
 */
function parseIpv6(text: string): Uint8Array {
    if (text.includes("%")) {
        throw new OtbrRestError("rest_protocol", `ipv6: zone ID not supported in ${text}`);
    }
    const doubleColonIdx = text.indexOf("::");
    let leftPart: string;
    let rightPart: string;
    if (doubleColonIdx === -1) {
        leftPart = text;
        rightPart = "";
    } else {
        if (text.indexOf("::", doubleColonIdx + 2) !== -1) {
            throw new OtbrRestError("rest_protocol", `ipv6: multiple "::" in ${text}`);
        }
        leftPart = text.slice(0, doubleColonIdx);
        rightPart = text.slice(doubleColonIdx + 2);
    }
    const leftGroups = leftPart === "" ? [] : leftPart.split(":");
    const rightGroups = rightPart === "" ? [] : rightPart.split(":");

    if (doubleColonIdx === -1 && leftGroups.length !== IPV6_GROUPS) {
        throw new OtbrRestError("rest_protocol", `ipv6: expected ${IPV6_GROUPS} groups in ${text}`);
    }
    const fillCount = IPV6_GROUPS - leftGroups.length - rightGroups.length;
    if (fillCount < 0 || (doubleColonIdx !== -1 && fillCount === 0)) {
        throw new OtbrRestError("rest_protocol", `ipv6: too many groups in ${text}`);
    }

    const groups = new Array<number>();
    for (const g of leftGroups) groups.push(parseGroup(g, text));
    for (let i = 0; i < fillCount; i++) groups.push(0);
    for (const g of rightGroups) groups.push(parseGroup(g, text));

    const out = new Uint8Array(IPV6_BYTES);
    for (let i = 0; i < IPV6_GROUPS; i++) {
        out[i * 2] = (groups[i] >>> 8) & 0xff;
        out[i * 2 + 1] = groups[i] & 0xff;
    }
    return out;
}

function parseGroup(g: string, text: string): number {
    if (g.length === 0 || g.length > 4 || !/^[0-9a-fA-F]+$/.test(g)) {
        throw new OtbrRestError("rest_protocol", `ipv6: bad group "${g}" in ${text}`);
    }
    return parseInt(g, 16);
}

/**
 * Translate a single OTBR `/diagnostics` entry (already key-normalized to
 * camelCase) into a {@link DiagnosticResponse}. Skips fields the entry does
 * not include — REST returns whatever the BR last collected, which differs
 * per node and per OpenThread build.
 */
export function translateNodeJson(json: unknown): DiagnosticResponse {
    if (!isRecord(json)) {
        throw new OtbrRestError("rest_protocol", "translateNodeJson: input is not an object");
    }
    const result: DiagnosticResponse = { unknown: new Array<{ type: number; value: Uint8Array }>() };

    const extAddress = asString(json["extAddress"]);
    if (extAddress !== undefined) {
        result.extMacAddress = parseHexBytes(extAddress, "extAddress", 8);
    }

    const rloc16 = asNumber(json["rloc16"]);
    if (rloc16 !== undefined) result.rloc16 = rloc16;

    const mode = asRecord(json["mode"]);
    if (mode !== undefined) result.mode = translateMode(mode);

    const timeout = asNumber(json["timeout"]);
    if (timeout !== undefined) result.timeout = timeout;

    const connectivity = asRecord(json["connectivity"]);
    if (connectivity !== undefined) result.connectivity = translateConnectivity(connectivity);

    const route = asRecord(json["route"]);
    if (route !== undefined) result.route64 = translateRoute(route);

    const leaderData = asRecord(json["leaderData"]);
    if (leaderData !== undefined) result.leaderData = translateLeaderData(leaderData);

    const networkData = asString(json["networkData"]);
    if (networkData !== undefined) {
        result.networkData = NetworkData.decode(parseHexBytes(networkData, "networkData"));
    }

    const ip6Addresses = asArray(json["ip6AddressList"]);
    if (ip6Addresses !== undefined) {
        const list = new Array<Uint8Array>();
        for (const entry of ip6Addresses) {
            const text = asString(entry);
            if (text === undefined) {
                throw new OtbrRestError("rest_protocol", "ip6AddressList: entry is not a string");
            }
            list.push(parseIpv6(text));
        }
        result.ipv6Addresses = list;
    }

    const macCounters = asRecord(json["macCounters"]);
    if (macCounters !== undefined) result.macCounters = translateMacCounters(macCounters);

    const mleCounters = asRecord(json["mleCounters"]);
    if (mleCounters !== undefined) result.mleCounters = translateMleCounters(mleCounters);

    const childTable = asArray(json["childTable"]);
    if (childTable !== undefined) result.childTable = translateChildTable(childTable);

    const channelPages = asString(json["channelPages"]);
    if (channelPages !== undefined) {
        const bytes = parseHexBytes(channelPages, "channelPages");
        result.channelPages = Array.from(bytes);
    }

    const maxChildTimeout = asNumber(json["maxChildTimeout"]);
    if (maxChildTimeout !== undefined) result.maxChildTimeout = maxChildTimeout;

    const eui64 = asString(json["eui64"]);
    if (eui64 !== undefined) result.eui64 = parseHexBytes(eui64, "eui64", 8);

    const version = asNumber(json["version"]);
    if (version !== undefined) result.version = version;

    const vendorName = asString(json["vendorName"]);
    if (vendorName !== undefined) result.vendorName = vendorName;

    const vendorModel = asString(json["vendorModel"]);
    if (vendorModel !== undefined) result.vendorModel = vendorModel;

    const vendorSwVersion = asString(json["vendorSwVersion"]);
    if (vendorSwVersion !== undefined) result.vendorSwVersion = vendorSwVersion;

    const threadStackVersion = asString(json["threadStackVersion"]);
    if (threadStackVersion !== undefined) result.threadStackVersion = threadStackVersion;

    const vendorAppUrl = asString(json["vendorAppUrl"]);
    if (vendorAppUrl !== undefined) result.vendorAppUrl = vendorAppUrl;

    const batteryLevel = asNumber(json["batteryLevel"]);
    if (batteryLevel !== undefined) result.batteryLevel = batteryLevel;

    const supplyVoltage = asNumber(json["supplyVoltage"]);
    if (supplyVoltage !== undefined) result.supplyVoltage = supplyVoltage;

    return result;
}

export const __testables = { parseIpv6 };

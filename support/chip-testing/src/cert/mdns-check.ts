/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DnsRecordType,
    DnssdName,
    DnssdNames,
    Environment,
    ImplementationError,
    Millis,
    Time,
    Timestamp,
} from "@matter/main";
import { CommissionableMdnsScanner, MdnsService } from "@matter/main/protocol";
import type { CertDevice, CheckRecord } from "@matter/testing";

const DEFAULT_TIMEOUT_MS = 10_000;
const OPERATIONAL_POLL_INTERVAL = Millis(500);

export interface MdnsExpectations {
    /** Whether a live `_matter._tcp` SRV record exists for `options.operationalInstanceName`. */
    operationalRecords?: number;
    /** Whether `device`'s own discriminator is currently advertised under `_matterc._udp`. */
    commissionable?: boolean;
}

/** What the `commissionable` expectation needs from a {@link CertDevice}. */
export interface CommissionableIdentity {
    commissioning: { discriminator: number };
}

interface ExpectationResult {
    matched: boolean;
    detail: string;
}

/**
 * Polls mDNS for `device`'s network-visible state, resolving once every requested expectation in
 * `expectations` matches or `options.timeoutMs` elapses.
 *
 * `commissionable` is scoped to `device` via {@link CommissionableMdnsScanner} — the scanner
 * `ControllerBehavior`/`CommissioningController.discoverCommissionableDevices` construct the same way
 * (`new CommissionableMdnsScanner(environment.get(MdnsService).names)`) — keyed on `device.commissioning.discriminator`.
 *
 * `operationalRecords` needs `options.operationalInstanceName`: attributing an operational `_matter._tcp`
 * SRV record to a specific node needs its compressed fabric id and assigned node id, and {@link CertDevice}
 * exposes neither (only pre-commissioning `commissioning.discriminator`/`passcode`) — a network-wide scan
 * for "any operational SRV record" is not a usable proxy for "this device's" once other Matter traffic is on
 * the network (verified: a real interface saw dozens of unrelated operational instances). A commissioned
 * node's own {@link CertNodeApi.operationalMdnsInstanceName} (on `ControllerAdapter.node(ref)`) gives the
 * exact instance name to check instead; a step must obtain and pass it explicitly. A device commissioned onto
 * several fabrics advertises one instance per fabric, so `operationalInstanceName` also accepts an array —
 * `operationalRecords: n` then means exactly `n` of the given instance names currently carry a live SRV
 * record, not "any single one of them does".
 *
 * `operationalRecords: 0` asserts withdrawal, which only the whole window can prove: a cache that
 * merely hasn't heard a name yet is indistinguishable from a withdrawn one, so the check holds the
 * full `timeoutMs` (soliciting names it holds no live record for) and settles on what is live at
 * its end.
 *
 * Never throws for a mismatch — returns a `"fail"` {@link CheckRecord} instead, so a step decides whether
 * the mismatch aborts the step (by asserting on the result) or is itself the condition under test.
 */
export async function expectMdns(
    device: CommissionableIdentity,
    expectations: MdnsExpectations,
    options?: { timeoutMs?: number; operationalInstanceName?: string | string[] },
): Promise<CheckRecord> {
    if (expectations.commissionable === undefined && expectations.operationalRecords === undefined) {
        throw new ImplementationError("expectMdns requires at least one of commissionable/operationalRecords");
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const mdns = Environment.default.get(MdnsService);
    await mdns.construction;
    const names = mdns.names;

    const checks = new Array<Promise<ExpectationResult>>();
    if (expectations.commissionable !== undefined) {
        checks.push(checkCommissionable(names, device, expectations.commissionable, timeoutMs));
    }
    if (expectations.operationalRecords !== undefined) {
        const { operationalInstanceName } = options ?? {};
        if (operationalInstanceName === undefined) {
            throw new ImplementationError(
                "expectMdns requires options.operationalInstanceName to check operationalRecords — obtain it " +
                    "from ControllerAdapter.node(ref).operationalMdnsInstanceName() once the node is commissioned",
            );
        }
        const instanceNames = Array.isArray(operationalInstanceName)
            ? operationalInstanceName
            : [operationalInstanceName];
        if (instanceNames.length === 0) {
            throw new ImplementationError(
                "expectMdns requires at least one operationalInstanceName to check operationalRecords",
            );
        }
        checks.push(checkOperationalRecords(names, expectations.operationalRecords, instanceNames, timeoutMs));
    }

    const results = await Promise.all(checks);
    return {
        type: "network",
        verdict: results.every(result => result.matched) ? "pass" : "fail",
        detail: results.map(result => result.detail).join("; "),
    };
}

/**
 * Waits (up to `timeoutMs`) for `device`'s commissionable advertisement to match `expected`.
 *
 * Delegates to the scanner's own discovery loop, which primes from names already known before this call
 * and then actively queries `_matterc._udp` on the standard backoff schedule. Resolves as soon as a
 * matching announcement arrives — that's the earliest point the outcome is determined, whether the
 * announcement confirms `expected` or contradicts it — otherwise waits out the full window before
 * concluding the device was never observed.
 */
async function checkCommissionable(
    names: DnssdNames,
    device: CommissionableIdentity,
    expected: boolean,
    timeoutMs: number,
): Promise<ExpectationResult> {
    const identifier = { longDiscriminator: device.commissioning.discriminator };
    const scanner = new CommissionableMdnsScanner(names);
    try {
        let seen = false;
        let resolveEarly!: () => void;
        const earlySignal = new Promise<void>(resolve => (resolveEarly = resolve));

        await scanner.findCommissionableDevicesContinuously(
            identifier,
            () => {
                seen = true;
                resolveEarly();
            },
            Millis(timeoutMs),
            earlySignal,
        );

        return {
            matched: seen === expected,
            detail: `commissionable (discriminator ${identifier.longDiscriminator}): expected ${expected}, observed ${seen}`,
        };
    } finally {
        await scanner.close();
    }
}

/**
 * Polls (up to `timeoutMs`) how many of `instanceNames` currently carry a live SRV record, until that
 * count equals `expected`, re-soliciting each tick every name we hold no live SRV for, in case its
 * periodic re-announcement hasn't reached us yet. A single-name call (`instanceNames.length === 1`)
 * degenerates to "is this one instance's presence, as 0 or 1, what `expected` says" — the original
 * single-fabric check.
 *
 * `expected` live records settle the check as soon as all are observed — a live record answers the
 * question directly. Absence never does: an `expected: 0` call holds the whole window (a withdrawal's
 * goodbye may still be in flight, and a device that only answers when asked needs the solicitations)
 * and settles on what is live at its end.
 */
async function checkOperationalRecords(
    names: DnssdNames,
    expected: number,
    instanceNames: string[],
    timeoutMs: number,
): Promise<ExpectationResult> {
    const deadline = Timestamp(Time.nowUs + Millis(timeoutMs));

    for (;;) {
        // Re-resolved every tick: a name whose last record expired deletes itself from the cache,
        // taking its socket relevance registration with it — a reference held across the window
        // would go blind to a mid-window re-announcement.
        const resolved = instanceNames.map(instanceName => names.get(instanceName));
        const observed = resolved.filter(hasLiveSrv).length;
        const detail = `operationalRecords (${instanceNames.join(", ")}): expected ${expected}, observed ${observed}`;
        if (expected > 0 && observed === expected) {
            return { matched: true, detail };
        }
        if (Time.nowUs >= deadline) {
            return { matched: observed === expected, detail };
        }
        for (const name of resolved) {
            // Never solicit a name whose SRV is already live: a query carries the name's records as
            // known answers, which this very listener re-ingests as fresh — an absence check would
            // keep the record it is waiting out alive itself.
            if (hasLiveSrv(name)) {
                continue;
            }
            names.solicitor.solicit({ name, recordTypes: [DnsRecordType.SRV, DnsRecordType.PTR] });
        }
        await Time.sleep("mdns-check operational-records poll", OPERATIONAL_POLL_INTERVAL);
    }
}

function hasLiveSrv(name: DnssdName): boolean {
    for (const record of name.records) {
        if (record.recordType === DnsRecordType.SRV) {
            return true;
        }
    }
    return false;
}

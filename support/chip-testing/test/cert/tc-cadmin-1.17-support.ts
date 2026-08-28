/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentials } from "@matter/main/clusters";
import { PeerCommunicationError } from "@matter/main/protocol";
import { StatusResponseError, ValidationError } from "@matter/main/types";
import type { LogExpectPatterns } from "@matter/testing";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { NoCommissionedPeerError } from "../../src/cert/InProcessControllerAdapter.js";
import { MATTERJS_COMMISSIONED_FABRIC } from "./tc-support.js";

// TC-CADMIN-1.17's device-log patterns live beside the test case rather than inside it because a
// `TC-*.test.ts` registers a device-driven mocha test at import time, so the cert-framework spec set
// cannot import one to unit-test what it declares.

/** A completed commissioning: chip announces it, matter.js names the fabric it completed for. */
export const COMMISSIONING_COMPLETE: LogExpectPatterns = {
    chip: /Commissioning completed successfully/,
    matterjs: MATTERJS_COMMISSIONED_FABRIC,
};

/** An opened commissioning window: matter.js names it by the timer it arms for it. */
export const WINDOW_OPEN: LogExpectPatterns = {
    chip: /Commissioning window is now open/,
    matterjs: /AdministratorCommissioningServer Commissioning window timer started/,
};

/**
 * How step 8's post-removal write/read fails on a controller whose fabric the device removed, as
 * captured across all six CI legs. The in-process controller normally refuses locally: it reacts to
 * the device's Leave event by deleting the peer, so every later node operation reports
 * {@link NoCommissionedPeerError}. Leave processing is conditional on an active subscription, so a
 * controller that missed it instead attempts a connection the device no longer serves and surfaces a
 * {@link PeerCommunicationError} — the plan's own expected symptom ("TH_CR2 is no longer on the
 * network"). chip-tool reports {@link ChipToolCommandError} — its output cannot separate a failed
 * device interaction from every other command failure, so on those legs this only excludes a
 * controller that would not start or crashed — or a status the device answered with
 * ({@link StatusResponseError}). {@link ValidationError} is a {@link StatusResponseError} but is the
 * client's own encode-time rejection before anything goes on the wire, so it proves nothing here.
 * Anything else says nothing about the removal and must not pass the step.
 */
export function isPostRemovalRefusal(error: unknown): boolean {
    if (error instanceof ValidationError) {
        return false;
    }
    return (
        error instanceof NoCommissionedPeerError ||
        error instanceof PeerCommunicationError ||
        error instanceof ChipToolCommandError ||
        error instanceof StatusResponseError
    );
}

/**
 * Checks the NOCResponse a RemoveFabric invoke returned (§ 11.18.7.10): `statusCode` must be
 * `NodeOperationalCertStatus.Ok`, and a `fabricIndex` it carries must name the removed fabric.
 * Returns what disqualifies `response`, or undefined for a success response.
 */
export function removeFabricResponseFailure(response: unknown, fabricIndex: number): string | undefined {
    if (typeof response !== "object" || response === null || !("statusCode" in response)) {
        return `expected a NOCResponse with a statusCode, got ${describeValue(response)}`;
    }
    const { statusCode } = response;
    if (statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
        return `NOCResponse statusCode is ${describeValue(statusCode)}, not Ok`;
    }
    if ("fabricIndex" in response && response.fabricIndex !== undefined && response.fabricIndex !== fabricIndex) {
        return `NOCResponse names fabricIndex ${describeValue(response.fabricIndex)}, not the removed ${fabricIndex}`;
    }
    return undefined;
}

function describeValue(value: unknown): string {
    return (
        JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry)) ?? "undefined"
    );
}

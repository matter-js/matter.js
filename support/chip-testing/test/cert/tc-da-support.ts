/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice, CheckRecord } from "@matter/testing";
import { flavorFamily } from "@matter/testing";
import { COMMISSIONING_LOG_TIMEOUT } from "./tc-dd-support.js";
import { expectDeviceLog } from "./tc-support.js";

/** § 11.18.6.1: the AttestationNonce is 32 octets. */
const NONCE_LENGTH = 32;

/**
 * The TH's line for a received AttestationRequest. matter.js prints the nonce on it; chip prints it in the decoded
 * request a few lines before, see {@link chipNonce}.
 */
const ATTESTATION_REQUEST = {
    chip: /OpCreds: Received an AttestationRequest command/,
    matterjs: /ProtocolService Invoke « .*operationalCredentials\.attestationRequest .*attestationNonce: ([0-9a-f]*)/,
};

const CHIP_FIELD_START = /\b0x0 = \[\s*$/;
const CHIP_BYTES = /\[DMG\]\s+((?:0x[0-9a-f]{2},\s*)+)$/i;
const CHIP_FIELD_END = /\]\s+\((\d+) bytes\)/;

/** How far before chip's request line its decoded nonce field may start. */
const CHIP_DECODE_LINES = 40;

/** The nonce a TH logged, as hex, with the length the TH gives for it. */
export interface LoggedNonce {
    hex: string;
    length: number;
    line: number;
}

/** What the TH logged for one AttestationRequest. */
export interface ReceivedRequest {
    received: CheckRecord;

    /** The nonce the TH logged, if it logged one. */
    nonce?: LoggedNonce;
}

/** chip's decoded `CommandFields` entry 0x0 of the request ending before `requestLine`. */
function chipNonce(th: CertDevice, requestLine: number): LoggedNonce | undefined {
    let end: number | undefined;
    for (let index = requestLine - 1; index >= Math.max(0, requestLine - CHIP_DECODE_LINES); index--) {
        const text = th.log.at(index)?.text ?? "";
        if (end === undefined) {
            if (CHIP_FIELD_END.test(text)) {
                end = index;
            }
            continue;
        }
        if (CHIP_FIELD_START.test(text)) {
            const bytes = new Array<string>();
            for (let line = index + 1; line < end; line++) {
                const match = CHIP_BYTES.exec(th.log.at(line)?.text ?? "");
                if (match !== null) {
                    bytes.push(...(match[1].match(/0x([0-9a-f]{2})/gi) ?? []).map(byte => byte.slice(2)));
                }
            }
            const length = Number(CHIP_FIELD_END.exec(th.log.at(end)?.text ?? "")?.[1]);
            return { hex: bytes.join("").toLowerCase(), length, line: end };
        }
    }
    return undefined;
}

/** Reads the AttestationNonce of the first AttestationRequest `th` received at or after `from`. */
export async function readAttestationRequest(th: CertDevice, from: number): Promise<ReceivedRequest> {
    const { check: received } = await expectDeviceLog(
        th.log,
        th.flavor,
        ATTESTATION_REQUEST,
        from,
        COMMISSIONING_LOG_TIMEOUT,
    );
    const requestLine = received.logLine;
    if (received.verdict !== "pass" || requestLine === undefined) {
        return { received };
    }
    if (flavorFamily(th.flavor) === "matterjs") {
        const hex = ATTESTATION_REQUEST.matterjs.exec(th.log.at(requestLine)?.text ?? "")?.[1];
        return { received, nonce: hex === undefined ? undefined : { hex, length: hex.length / 2, line: requestLine } };
    }
    return { received, nonce: chipNonce(th, requestLine) };
}

/** The check that `nonce`, named `name` in the evidence, has the length § 11.18.6.1 requires. */
export function nonceLengthCheck(nonce: LoggedNonce, name: string): CheckRecord {
    return {
        type: "device-log",
        verdict: nonce.length === NONCE_LENGTH ? "pass" : "fail",
        detail: `${name} is ${nonce.length} bytes, ${NONCE_LENGTH} expected`,
        logLine: nonce.line,
    };
}

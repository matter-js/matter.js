/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertDevice, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest, flavorFamily } from "@matter/testing";
import { commissionByQr, COMMISSIONING_LOG_TIMEOUT, restoreCommissioningMode, thQrPayload } from "./tc-dd-support.js";
import type { RecordedCheck } from "./tc-support.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    expectDeviceLog,
    LOG_TIMEOUT,
    record,
    recordAll,
    runCleanups,
    theTh,
    withChecks,
} from "./tc-support.js";

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

/** The TH's line for the AttestationResponse it sent. */
const ATTESTATION_RESPONSE = {
    chip: /OpCreds: AttestationRequest successful/,
    matterjs: /ProtocolService Invoke » .*operationalCredentials\.attestationRequest .*attestationElements: [0-9a-f]+/,
};

const CHIP_FIELD_START = /\b0x0 = \[\s*$/;
const CHIP_BYTES = /\[DMG\]\s+((?:0x[0-9a-f]{2},\s*)+)$/i;
const CHIP_FIELD_END = /\]\s+\((\d+) bytes\)/;

/** How far before chip's request line its decoded nonce field may start. */
const CHIP_DECODE_LINES = 40;

/** The nonce a TH logged, as hex, with the length the TH gives for it. */
interface LoggedNonce {
    hex: string;
    length: number;
    line: number;
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

type Commissioning = "first" | "second";

/** What the TH logged for the AttestationRequest of one commissioning. */
interface ReceivedRequest {
    /** The request arrived (plan step 3 or 10). */
    received: CheckRecord;

    /** The nonce the TH logged, if it logged one (plan step 4 or 11). */
    nonce?: LoggedNonce;
}

/** Reads the AttestationNonce of the first AttestationRequest the TH received at or after `from`. */
async function readRequest(cx: CertStepContext, from: number): Promise<ReceivedRequest> {
    const th = theTh(cx);
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

const commissioned = new CommissionedRefs();
const marks = new Map<Commissioning, number>();
const completions = new Map<Commissioning, RecordedCheck[]>();
const requests = new Map<Commissioning, ReceivedRequest>();

async function commissionTh(cx: CertStepContext, which: Commissioning) {
    const th = theTh(cx);
    const payload = await thQrPayload(th);
    marks.set(which, await th.log.markSettled());
    await withChecks(cx, async checks => {
        await commissionByQr(cx, payload, commissioned, checks);
        completions.set(which, [...checks]);
    });
}

function requestOf(which: Commissioning) {
    const request = requests.get(which);
    if (request === undefined) {
        throw new InternalError(`The ${which} commissioning's AttestationRequest was not read`);
    }
    return request;
}

function nonceOf(which: Commissioning, name: string) {
    const { nonce, received } = requestOf(which);
    if (nonce === undefined) {
        throw new CertCheckFailedError(`The TH logged no ${name} for the request on line ${received.logLine}`);
    }
    return nonce;
}

/** Plan step 2 or 9: the DUT's nonce is 32 bytes.  Reads the request for the later steps. */
async function recordNonceLength(cx: CertStepContext, which: Commissioning, name: string) {
    const mark = marks.get(which);
    if (mark === undefined) {
        throw new InternalError(`The ${which} commissioning did not run`);
    }
    const request = await readRequest(cx, mark);
    requests.set(which, request);
    record(cx, request.received, "AttestationRequest received");
    const nonce = nonceOf(which, name);
    record(
        cx,
        {
            type: "device-log",
            verdict: nonce.length === NONCE_LENGTH ? "pass" : "fail",
            detail: `${name} is ${nonce.length} bytes, ${NONCE_LENGTH} expected`,
            logLine: nonce.line,
        },
        `${name} length`,
    );
}

/** Plan step 3 or 10: the TH received the AttestationRequest. */
async function recordRequest(cx: CertStepContext, which: Commissioning) {
    record(cx, requestOf(which).received, "AttestationRequest received");
}

/** Plan step 4 or 11: the TH logged the nonce. */
async function recordNonce(cx: CertStepContext, which: Commissioning, name: string) {
    const nonce = nonceOf(which, name);
    record(cx, { type: "device-log", verdict: "pass", detail: `${name} = ${nonce.hex}`, logLine: nonce.line }, name);
}

/** Plan step 5: the TH answered with an AttestationResponse. */
async function recordResponse(cx: CertStepContext, which: Commissioning) {
    const th = theTh(cx);
    const { check } = await expectDeviceLog(
        th.log,
        th.flavor,
        ATTESTATION_RESPONSE,
        nonceOf(which, "Nonce_1").line,
        LOG_TIMEOUT,
    );
    record(cx, check, "AttestationResponse sent");
}

certTest("TC-DA-1.3", {
    plan: "deviceattestation.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER"],
    app: "all-clusters",
})
    .step(1, "Start the commissioning process of TH1 on DUT", cx => commissionTh(cx, "first"))
    .step(2, "DUT generates 32-byte AttestationNonce", cx => recordNonceLength(cx, "first", "Nonce_1"))
    .step(3, "DUT sends AttestationRequest Command with AttestationNonce as field to the TH1.", cx =>
        recordRequest(cx, "first"),
    )
    .step(4, "TH1 records the AttestationNonce received in AttestationRequest as Nonce_1", cx =>
        recordNonce(cx, "first", "Nonce_1"),
    )
    .step(5, "TH1 responds with a well-formed AttestationResponse Command", cx => recordResponse(cx, "first"))
    .step(
        6,
        "Verify that DUT Completes the commissioning process successfully",
        async cx => {
            const checks = completions.get("first");
            if (checks === undefined) {
                throw new InternalError("Step 1 recorded no commissioning");
            }
            await recordAll(cx, checks);
        },
        { expected: "Verify that DUT Completes the commissioning process successfully" },
    )
    .step(7, "Factory Reset TH1 so that it is commissionable again", async cx => {
        if (!(await restoreCommissioningMode(cx, commissioned))) {
            throw new InternalError("TH1 was not commissioned before the factory reset");
        }
    })
    .step(8, "Start the commissioning process of TH1 on DUT again", cx => commissionTh(cx, "second"))
    .step(9, "DUT generates 32-byte AttestationNonce", cx => recordNonceLength(cx, "second", "Nonce_2"))
    .step(10, "DUT sends AttestationRequest Command with AttestationNonce as field to the TH1.", cx =>
        recordRequest(cx, "second"),
    )
    .step(11, "TH1 records the AttestationNonce received in AttestationRequest as Nonce_2", cx =>
        recordNonce(cx, "second", "Nonce_2"),
    )
    .step(
        12,
        "Verify that the Nonce_1 and Nonce_2 are different.",
        async cx => {
            const first = nonceOf("first", "Nonce_1");
            const second = nonceOf("second", "Nonce_2");
            record(
                cx,
                {
                    type: "device-log",
                    verdict: first.hex !== second.hex ? "pass" : "fail",
                    detail: `Nonce_1 = ${first.hex}, Nonce_2 = ${second.hex}`,
                    logLine: second.line,
                },
                "Nonce_1 and Nonce_2 differ",
            );
        },
        { expected: "Verify that the Nonce_1 and Nonce_2 are different." },
    )
    .finalize(cx => runCleanups(() => commissioned.decommissionAll(cx)));

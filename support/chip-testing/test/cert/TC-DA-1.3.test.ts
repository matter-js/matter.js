/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { ReceivedRequest } from "./tc-da-support.js";
import { nonceLengthCheck, readAttestationRequest } from "./tc-da-support.js";
import { commissionByQr, restoreCommissioningMode, thQrPayload } from "./tc-dd-support.js";
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

/** The TH's line for the AttestationResponse it sent. */
const ATTESTATION_RESPONSE = {
    chip: /OpCreds: AttestationRequest successful/,
    matterjs: /ProtocolService Invoke » .*operationalCredentials\.attestationRequest .*attestationElements: [0-9a-f]+/,
};

type Commissioning = "first" | "second";

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
    const request = await readAttestationRequest(theTh(cx), mark);
    requests.set(which, request);
    record(cx, request.received, "AttestationRequest received");
    record(cx, nonceLengthCheck(nonceOf(which, name), name), `${name} length`);
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

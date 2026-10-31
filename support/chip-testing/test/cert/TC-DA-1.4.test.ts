/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Seconds } from "@matter/main";
import { DeviceAttestationCheck } from "@matter/protocol";
import type { CertDevice, CertNodeRef, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest, CertLogTimeoutError, chip } from "@matter/testing";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReceivedRequest } from "./tc-da-support.js";
import { nonceLengthCheck, readAttestationRequest } from "./tc-da-support.js";
import { COMMISSIONING_LOG_TIMEOUT, commissionChecked, restoreCommissioningMode } from "./tc-dd-support.js";
import type { RecordedCheck } from "./tc-support.js";
import {
    attempt,
    CertCheckFailedError,
    CommissionedRefs,
    describeError,
    dutControllerLogFlavor,
    expectDeviceLog,
    LOG_TIMEOUT,
    record,
    runCleanups,
    settleWithin,
    theTh,
    withChecks,
} from "./tc-support.js";

/** Where the harness image carries CHIP's DAC providers for the DUT-commissioner attestation cases. */
const VECTORS = "/credentials/development/commissioner_dut";

/**
 * The plan's certificate sets in the plan's order, each with the product id the TH starts with and the attestation
 * check the DUT has to name when it refuses the set.
 *
 * The check is what proves the refusal is about the vector. CHIP's DAC provider keeps its default development
 * certificates when it cannot load a vector. With those, product id 32768 commissions, and product id 177 is refused
 * as {@link DeviceAttestationCheck.CertificationDeclarationFieldMismatch}, which no product id 177 vector expects.
 */
const CERTIFICATE_SETS: ReadonlyArray<readonly [vector: string, productId: number, refusal: DeviceAttestationCheck]> = [
    ["invalid_paa", 32768, DeviceAttestationCheck.PaaNotTrusted],
    ["struct_cd_authorized_paa_list_count0", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    [
        "struct_cd_authorized_paa_list_count10_invalid",
        32768,
        DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
    ],
    [
        "struct_cd_authorized_paa_list_count3_invalid",
        32768,
        DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
    ],
    ["struct_cd_cert_id_len_wrong", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_cert_id_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_cert_type_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_cert_type_wrong", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_cms_digest_algo_sha1", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_cms_econtent_type_msac", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_cms_sig_algo_ecdsa_with_sha1", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_cms_signature", 32768, DeviceAttestationCheck.CertificationDeclarationSignatureInvalid],
    ["struct_cd_cms_v2", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    [
        "struct_cd_dac_origin_vid_missing_pid_present",
        32768,
        DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
    ],
    [
        "struct_cd_dac_origin_vid_pid_present_pid_mismatch",
        32768,
        DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
    ],
    [
        "struct_cd_dac_origin_vid_pid_present_vid_mismatch",
        32768,
        DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
    ],
    [
        "struct_cd_dac_origin_vid_present_pid_missing",
        32768,
        DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
    ],
    ["struct_cd_device_type_id_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_format_version_2", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_format_version_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_pid_array_count0", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_pid_array_count01_mismatch", 32768, DeviceAttestationCheck.CertificationDeclarationFieldMismatch],
    ["struct_cd_pid_array_count100_mismatch", 32768, DeviceAttestationCheck.CertificationDeclarationFieldMismatch],
    ["struct_cd_pid_array_count10_mismatch", 32768, DeviceAttestationCheck.CertificationDeclarationFieldMismatch],
    ["struct_cd_pid_array_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_security_info_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_security_level_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_signer_info_digest_algo_sha1", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_signer_info_skid_invalid", 32768, DeviceAttestationCheck.CdSignerUnknown],
    ["struct_cd_signer_info_v2", 32768, DeviceAttestationCheck.CertificationDeclarationFormatInvalid],
    ["struct_cd_version_number_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_cd_vid_mismatch", 32768, DeviceAttestationCheck.CertificationDeclarationFieldMismatch],
    ["struct_cd_vid_missing", 32768, DeviceAttestationCheck.CertificationDeclarationUnparseable],
    ["struct_dac_cert_version_v2", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_akid_missing", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_ext_basic_ca_missing", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_ca_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_critical_missing", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_critical_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_missing", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_pathlen0", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_pathlen1", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_pathlen2", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_basic_pathlen_presence_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_key_usage_critical_missing", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_key_usage_critical_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_key_usage_crl_sign_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_key_usage_dig_sig_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_key_usage_key_cert_sign_wrong", 32768, DeviceAttestationCheck.DacFormatInvalid],
    ["struct_dac_ext_key_usage_missing", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_ext_skid_missing", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_sig_algo_ecdsa_with_sha1", 32768, DeviceAttestationCheck.CertificateChainInvalid],
    ["struct_dac_sig_curve_secp256k1", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_subject_pid_mismatch", 32768, DeviceAttestationCheck.CertificationDeclarationFieldMismatch],
    ["struct_dac_subject_vid_mismatch", 32768, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_dac_valid_in_future", 32768, DeviceAttestationCheck.CertificateExpired],
    ["struct_dac_valid_in_past", 32768, DeviceAttestationCheck.CertificateExpired],
    ["struct_dac_vidpid_fallback_encoding_06", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_vidpid_fallback_encoding_07", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_vidpid_fallback_encoding_08", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_vidpid_fallback_encoding_09", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_vidpid_fallback_encoding_10", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_vidpid_fallback_encoding_12", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_dac_vidpid_fallback_encoding_13", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_dac_vidpid_fallback_encoding_14", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_dac_vidpid_fallback_encoding_16", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_dac_vidpid_fallback_encoding_17", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_dac_vidpid_fallback_encoding_19", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_cert_version_v2", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_akid_missing", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_ext_basic_ca_missing", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_ca_wrong", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_critical_missing", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_critical_wrong", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_missing", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_pathlen1", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_pathlen2", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_basic_pathlen_presence_wrong", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_key_usage_critical_missing", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_key_usage_critical_wrong", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_key_usage_crl_sign_wrong", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_key_usage_key_cert_sign_wrong", 32768, DeviceAttestationCheck.PaiFormatInvalid],
    ["struct_pai_ext_key_usage_missing", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_ext_skid_missing", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_sig_algo_ecdsa_with_sha1", 32768, DeviceAttestationCheck.CertificateChainInvalid],
    ["struct_pai_sig_curve_secp256k1", 32768, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_subject_pid_mismatch", 32768, DeviceAttestationCheck.CertificationDeclarationFieldMismatch],
    ["struct_pai_subject_vid_mismatch", 32768, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_pai_valid_in_future", 32768, DeviceAttestationCheck.CertificateExpired],
    ["struct_pai_valid_in_past", 32768, DeviceAttestationCheck.CertificateExpired],
    ["struct_pai_vidpid_fallback_encoding_06", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_vidpid_fallback_encoding_07", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_vidpid_fallback_encoding_08", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_vidpid_fallback_encoding_09", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_vidpid_fallback_encoding_10", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_vidpid_fallback_encoding_12", 177, DeviceAttestationCheck.CertificateUnparseable],
    ["struct_pai_vidpid_fallback_encoding_13", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_pai_vidpid_fallback_encoding_14", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_pai_vidpid_fallback_encoding_16", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_pai_vidpid_fallback_encoding_17", 177, DeviceAttestationCheck.VendorIdMismatch],
    ["struct_pai_vidpid_fallback_encoding_19", 177, DeviceAttestationCheck.CertificateUnparseable],
];

/**
 * Vectors whose DAC key is not a P-256 key. chip's DAC provider loads the key as a P-256 key pair to sign the
 * AttestationResponse, which fails, so the TH answers the AttestationRequest with an error and the DUT never receives
 * attestation information to judge. The commissioning ending at that request, with the TH's own line for the failure,
 * is then the refusal.
 */
const TH_CANNOT_SIGN = new Set(["struct_dac_sig_curve_secp256k1"]);

/** chip's line once the restarted TH serves; its start() returns when the process is up, not when the app is. */
const SERVER_READY = /\[SVR\] Server initialization complete/;

/** chip's DAC provider logs this before the server starts when it falls back to its default certificates. */
const PROVIDER_NOT_LOADED = /Error (?:opening|parsing) json file/;

/** chip's line for an AttestationRequest it could not answer. */
const ATTESTATION_REQUEST_FAILED = /OpCreds: Failed AttestationRequest request/;

/** The prefix both matter.js controllers put before the findings they refuse a device for. */
const REFUSAL = "Device attestation refused: ";

/**
 * The finding a CD of certification_type 0 (development and test) produces, which is how the DUT reports a
 * commissionee that is not yet certified. In-process: "Accepting device attestation findings: info
 * CertificationTypeTest: …"; matterjs-server: "Attestation finding (info): CertificationTypeTest …".
 */
const NOT_CERTIFIED_FINDING = { matterjs: /attestation finding.*\bCertificationTypeTest\b/i };

/** A refusal ends at attestation, well within this. */
const COMMISSIONING_TIMEOUT = Seconds(60);

/** Longer than {@link COMMISSIONING_TIMEOUT}, so the controller gives up on its own before the step stops waiting. */
const SETTLE_TIMEOUT = Seconds(75);

/** How long a commissioning that outlived {@link SETTLE_TIMEOUT} gets to end before the vector loop stops. */
const LATE_SETTLE_TIMEOUT = Seconds(60);

const commissioned = new CommissionedRefs();
let firstCommissioning: { thFrom: number; dutFrom: number } | undefined;
let firstRequest: ReceivedRequest | undefined;

/** Plan step 1: the DUT commissions the TH with its default certificates, whose CD is of type development and test. */
async function commissionDefaultTh(cx: CertStepContext) {
    const th = theTh(cx);
    const thFrom = await th.log.markSettled();
    const dutFrom = await cx.controllers.dut.log.markSettled();
    await withChecks(cx, async checks => {
        const ref = await commissionChecked(
            cx.controllers.dut,
            { passcode: th.commissioning.passcode, discriminator: th.commissioning.discriminator },
            th,
            "DUT commissions the TH presenting its default certificates",
            checks,
        );
        commissioned.set("dut", ref);
        firstCommissioning = { thFrom, dutFrom };
    });
}

function commissioningOfStep1() {
    if (firstCommissioning === undefined) {
        throw new InternalError("Step 1 did not commission the TH");
    }
    return firstCommissioning;
}

/** Plan step 2: the TH logged a 32-byte AttestationNonce. Reads the request for step 3 too. */
async function recordNonceLength(cx: CertStepContext) {
    firstRequest = await readAttestationRequest(theTh(cx), commissioningOfStep1().thFrom);
    record(cx, firstRequest.received, "AttestationRequest received");
    const { nonce, received } = firstRequest;
    if (nonce === undefined) {
        throw new CertCheckFailedError(`The TH logged no AttestationNonce for the request on line ${received.logLine}`);
    }
    record(cx, nonceLengthCheck(nonce, "AttestationNonce"), "AttestationNonce length");
}

/** Plan step 3: the TH received the AttestationRequest. */
async function recordRequest(cx: CertStepContext) {
    if (firstRequest === undefined) {
        throw new InternalError("Step 2 did not read the AttestationRequest");
    }
    record(cx, firstRequest.received, "AttestationRequest received");
}

/** Plan step 4: the DUT reported the not yet certified commissionee through its attestation failure handling. */
async function recordNotCertified(cx: CertStepContext) {
    const { check } = await expectDeviceLog(
        cx.controllers.dut.log,
        dutControllerLogFlavor(cx),
        NOT_CERTIFIED_FINDING,
        commissioningOfStep1().dutFrom,
        LOG_TIMEOUT,
    );
    record(cx, check, "DUT reports the CD of type development and test as an attestation finding");
}

/**
 * Restarts the TH factory-new with `vector`'s certificates and checks that chip's DAC provider loaded them rather than
 * falling back to its defaults. The TH runs on the host, so the DAC provider is copied there out of the harness
 * container.
 */
async function startWith(th: CertDevice, dir: string, vector: string, productId: number): Promise<CheckRecord> {
    const path = join(dir, `${vector}.json`);
    await writeFile(path, await chip.container.read(`${VECTORS}/${vector}/test_case_vector.json`));
    const from = th.log.mark();
    await th.backchannel({
        name: "factoryResetWithAppArgs",
        appArgs: ["--dac_provider", path, "--product-id", String(productId)],
    });
    const ready = await th.log.expect(
        { chip: SERVER_READY },
        { flavor: th.flavor, from, timeoutMs: COMMISSIONING_LOG_TIMEOUT },
    );
    if (ready.verdict !== "pass") {
        throw new InternalError(`TH flavor ${th.flavor} has no server-ready line, but this case runs only on chip`);
    }
    const notLoaded = th.log
        .window(from, ready.matched.index - from)
        .find(line => !line.synthetic && PROVIDER_NOT_LOADED.test(line.text));
    return notLoaded === undefined
        ? {
              type: "device-log",
              verdict: "pass",
              detail: `TH started with the DAC provider of ${vector}; no provider error before the server was ready`,
              matched: ready.matched.text,
              logLine: ready.matched.index,
          }
        : {
              type: "device-log",
              verdict: "fail",
              detail: `TH fell back to its default certificates instead of those of ${vector}`,
              matched: notLoaded.text,
              logLine: notLoaded.index,
          };
}

/** The messages of `error` and of every error it was caused by or aggregates. */
function messagesOf(error: unknown): string[] {
    if (!(error instanceof Error)) {
        return [];
    }
    const nested = error instanceof AggregateError ? error.errors : [];
    return [error.message, ...messagesOf(error.cause), ...nested.flatMap(messagesOf)];
}

/** The TH's line for an AttestationRequest it could not answer, which may arrive after the DUT already gave up. */
async function unsignedRequestLine(th: CertDevice, from: number) {
    try {
        return await th.log.expectPattern(ATTESTATION_REQUEST_FAILED, { from, timeoutMs: LOG_TIMEOUT });
    } catch (e) {
        if (e instanceof CertLogTimeoutError) {
            return undefined;
        }
        throw e;
    }
}

/** The findings a matter.js controller named when it refused attestation, or undefined for any other failure. */
function refusalIn(error: unknown) {
    const message = messagesOf(error).find(text => text.includes(REFUSAL));
    return message?.slice(message.indexOf(REFUSAL) + REFUSAL.length);
}

/**
 * Has the DUT commission the TH presenting `vector` and returns the check that it refused for `expected`. A
 * commissioning that succeeds is undone, so the DUT does not keep a peer for a TH that the next vector resets.
 */
async function refuseVector(
    cx: CertStepContext,
    th: CertDevice,
    vector: string,
    expected: DeviceAttestationCheck,
    checks: RecordedCheck[],
): Promise<CheckRecord> {
    const dut = cx.controllers.dut;
    const from = await th.log.markSettled();
    const label = `TC-DA-1.4 commissioning with ${vector}`;
    const commissioning = dut.commission({
        passcode: th.commissioning.passcode,
        discriminator: th.commissioning.discriminator,
        giveUpAfterMs: COMMISSIONING_TIMEOUT,
        withoutSubscription: true,
    });
    const outcome = await settleWithin(label, commissioning, SETTLE_TIMEOUT);

    const remove = async (ref: CertNodeRef) => {
        const removed = await attempt(
            () => dut.node(ref).decommission(),
            () => `DUT removed the TH presenting ${vector}`,
        );
        checks.push({ what: `DUT removes the TH presenting ${vector}`, check: () => removed.check });
    };

    switch (outcome.kind) {
        case "resolved": {
            await remove(outcome.value);
            return {
                type: "response",
                verdict: "fail",
                detail: `DUT commissioned the TH presenting ${vector} as node ${outcome.value} after ${outcome.elapsed}`,
            };
        }

        case "timeout": {
            // The next vector restarts the TH, which a commissioning still running would talk to or onboard
            const late = await settleWithin(`${label} after its timeout`, commissioning, LATE_SETTLE_TIMEOUT);
            if (late.kind === "timeout") {
                throw new CertCheckFailedError(
                    `${label} neither ended nor gave up within ${Duration.format(SETTLE_TIMEOUT)} and a further ` +
                        `${late.elapsed}, so the remaining certificate sets cannot run on a TH it does not use`,
                );
            }
            if (late.kind === "resolved") {
                await remove(late.value);
            }
            return {
                type: "response",
                verdict: "fail",
                detail: `DUT neither commissioned nor refused the TH presenting ${vector} within ${outcome.elapsed}`,
            };
        }

        case "rejected": {
            const refusal = refusalIn(outcome.error);
            if (refusal !== undefined) {
                const named = refusal.includes(`${expected}: `);
                return {
                    type: "response",
                    verdict: named ? "pass" : "fail",
                    detail: named
                        ? `DUT refused the TH presenting ${vector} as ${expected}: ${refusal}`
                        : `DUT refused the TH presenting ${vector}, but not as ${expected}: ${refusal}`,
                };
            }
            const failure = describeError(outcome.error);
            if (TH_CANNOT_SIGN.has(vector)) {
                const unsigned = await unsignedRequestLine(th, from);
                if (unsigned !== undefined) {
                    return {
                        type: "response",
                        verdict: "pass",
                        detail:
                            `TH could not sign an AttestationResponse with the key of ${vector}, and the DUT ended ` +
                            `the commissioning at the AttestationRequest: ${failure}`,
                        matched: unsigned.text,
                        logLine: unsigned.index,
                    };
                }
            }
            return {
                type: "response",
                verdict: "fail",
                detail: `DUT failed to commission the TH presenting ${vector}, but not by refusing attestation: ${failure}`,
            };
        }
    }
}

/** Plan step 6. Every vector runs, so the evidence names each one the DUT did not refuse as it should. */
async function refuseEach(cx: CertStepContext) {
    const th = theTh(cx);
    const dir = await mkdtemp(join(tmpdir(), "tc-da-1-4-"));
    try {
        await withChecks(cx, async checks => {
            const unrefused = new Array<string>();
            for (const [vector, productId, expected] of CERTIFICATE_SETS) {
                const loaded = await startWith(th, dir, vector, productId);
                checks.push({ what: `TH presents the certificates of ${vector}`, check: () => loaded });
                const refused = await refuseVector(cx, th, vector, expected, checks);
                checks.push({ what: `DUT refuses ${vector} as ${expected}`, check: () => refused });
                if (loaded.verdict !== "pass" || refused.verdict !== "pass") {
                    unrefused.push(vector);
                }
            }
            if (unrefused.length) {
                throw new CertCheckFailedError(
                    `${unrefused.length} of ${CERTIFICATE_SETS.length} certificate sets were not refused for their ` +
                        `own defect: ${unrefused.join(", ")}`,
                );
            }
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

certTest("TC-DA-1.4", {
    plan: "deviceattestation.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER"],
    app: "all-clusters",
    attestation: true,

    // Only a chip app starts with a DAC provider, and the case hands it one as a host file, which only a chip-local
    // app can open
    flavors: ["chip-local"],
})
    .step(1, "Start the commissioning process of TH on DUT", commissionDefaultTh)
    .step(2, "DUT generates 32-byte AttestationNonce", recordNonceLength)
    .step(3, "DUT sends AttestationRequest Command with AttestationNonce as field to the TH.", recordRequest)
    .step(
        4,
        "TH responds to the DUT with an invalid AttestationResponse Command by setting the following error " +
            "condition: Commissionee is not yet certified",
        recordNotCertified,
        {
            expected:
                "Verify that the DUT indicates that the device is not genuine, or otherwise indicates a failure of " +
                "device attestation, within its error handling APIs or user interface.",
        },
    )
    .step(5, "Factory Reset TH so that it is commissionable again", async cx => {
        if (!(await restoreCommissioningMode(cx, commissioned))) {
            throw new InternalError("The TH was not commissioned before the factory reset");
        }
    })
    .step(
        6,
        "For each of the test cases in the Certificates for TC-DA-1.4 table, start the TH using the appropriate " +
            "certificate set, commission the TH using the DUT, then factory reset the TH.",
        refuseEach,
        {
            expected:
                "Verify that the DUT indicates that the device is not genuine, or otherwise indicates a failure of " +
                "device attestation, within its error handling APIs or user interface.",
        },
    )
    .finalize(cx => runCleanups(() => commissioned.decommissionAll(cx)));

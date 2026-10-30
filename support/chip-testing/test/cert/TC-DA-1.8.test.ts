/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, InternalError, Minutes, Seconds, Time } from "@matter/main";
import type { CertDevice, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest, chip } from "@matter/testing";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMISSIONING_LOG_TIMEOUT, commissionChecked } from "./tc-dd-support.js";
import type { RecordedCheck } from "./tc-support.js";
import { attempt, CertCheckFailedError, theTh, withChecks } from "./tc-support.js";

/** Where the harness image carries CHIP's DAC providers for the DUT-commissioner attestation cases. */
const VECTORS = "/credentials/development/commissioner_dut";

/** The plan's certificate sets, each with the product id its DAC names, in the plan's order. */
const CERTIFICATE_SETS: ReadonlyArray<readonly [vector: string, productId: number]> = [
    ["struct_cd_authorized_paa_list_count10_valid", 32768],
    ["struct_cd_authorized_paa_list_count1_valid", 32768],
    ["struct_cd_authorized_paa_list_count2_valid", 32768],
    ["struct_cd_authorized_paa_list_missing", 32768],
    ["struct_cd_cms_digest_algo_sha256", 32768],
    ["struct_cd_cms_econtent_type_pkcs7_data", 32768],
    ["struct_cd_cms_sig_algo_ecdsa_with_sha256", 32768],
    ["struct_cd_cms_v3", 32768],
    ["struct_cd_dac_origin_vid_pid_missing", 32768],
    ["struct_cd_dac_origin_vid_pid_present_match", 32768],
    ["struct_cd_format_version_1", 32768],
    ["struct_cd_origin_pid_vid_correct", 32768],
    ["struct_cd_pid_array_count01_valid", 32768],
    ["struct_cd_pid_array_count100_valid", 32768],
    ["struct_cd_pid_array_count10_valid", 32768],
    ["struct_cd_signer_info_skid_valid", 32768],
    ["struct_cd_version_number_match", 32768],
    ["struct_dac_cert_version_v3", 32768],
    ["struct_dac_ext_authority_info_access_present", 32768],
    ["struct_dac_ext_extended_key_usage_present", 32768],
    ["struct_dac_ext_subject_alt_name_present", 32768],
    ["struct_dac_sig_algo_ecdsa_with_sha256", 32768],
    ["struct_dac_sig_curve_prime256v1", 32768],
    ["struct_dac_vidpid_fallback_encoding_01", 177],
    ["struct_dac_vidpid_fallback_encoding_02", 177],
    ["struct_dac_vidpid_fallback_encoding_03", 177],
    ["struct_dac_vidpid_fallback_encoding_04", 177],
    ["struct_dac_vidpid_fallback_encoding_05", 177],
    ["struct_dac_vidpid_fallback_encoding_11", 177],
    ["struct_dac_vidpid_fallback_encoding_15", 177],
    ["struct_dac_vidpid_fallback_encoding_18", 1],
    ["struct_pai_cert_version_v3", 32768],
    ["struct_pai_ext_authority_info_access_present", 32768],
    ["struct_pai_ext_basic_pathlen0", 32768],
    ["struct_pai_ext_extended_key_usage_present", 32768],
    ["struct_pai_ext_key_usage_dig_sig_wrong", 32768],
    ["struct_pai_ext_subject_alt_name_present", 32768],
    ["struct_pai_sig_algo_ecdsa_with_sha256", 32768],
    ["struct_pai_sig_curve_prime256v1", 32768],
    ["struct_pai_vidpid_fallback_encoding_01", 177],
    ["struct_pai_vidpid_fallback_encoding_02", 177],
    ["struct_pai_vidpid_fallback_encoding_03", 177],
    ["struct_pai_vidpid_fallback_encoding_04", 177],
    ["struct_pai_vidpid_fallback_encoding_05", 177],
    ["struct_pai_vidpid_fallback_encoding_11", 177],
    ["struct_pai_vidpid_fallback_encoding_15", 177],
    ["struct_pai_vidpid_fallback_encoding_18", 1],
];

/** chip's line once the restarted TH serves; its start() returns when the process is up, not when the app is. */
const SERVER_READY = /\[SVR\] Server initialization complete/;

/** A commissioning the TH refuses or never answers ends well before this; one that succeeds takes seconds. */
const COMMISSIONING_TIMEOUT = Seconds(60);

/**
 * When no further certificate set is started. A commissioning that hangs past `giveUpAfterMs` can still take
 * minutes in CASE, so this leaves room for one inside the case's 30-minute limit and the evidence is still written.
 */
const ATTEMPT_BUDGET = Minutes(22);

/** `OperationalCredentials.CertificateChainRequest` CertificateType for the DAC. @see {@link MatterSpecification.v161.Core} § 11.18.6.3 */
const DAC_CERTIFICATE = 1;

/** The DAC a DAC provider presents, as hex. */
function dacOf(provider: string) {
    const parsed: unknown = JSON.parse(provider);
    if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("dac_cert" in parsed) ||
        typeof parsed.dac_cert !== "string"
    ) {
        throw new InternalError("DAC provider without a dac_cert");
    }
    return parsed.dac_cert.toLowerCase();
}

/**
 * Restarts the TH factory-new with `vector`'s certificates and returns the DAC it should present. The TH runs on the
 * host, so the DAC provider is copied there out of the harness container.
 */
async function startWith(th: CertDevice, dir: string, vector: string, productId: number) {
    const provider = await chip.container.read(`${VECTORS}/${vector}/test_case_vector.json`);
    const path = join(dir, `${vector}.json`);
    await writeFile(path, provider);
    const from = th.log.mark();
    await th.backchannel({
        name: "factoryResetWithAppArgs",
        appArgs: ["--dac_provider", path, "--product-id", String(productId)],
    });
    await th.log.expect({ chip: SERVER_READY }, { flavor: th.flavor, from, timeoutMs: COMMISSIONING_LOG_TIMEOUT });
    return dacOf(provider);
}

async function commissionEach(cx: CertStepContext) {
    const th = theTh(cx);
    const dir = await mkdtemp(join(tmpdir(), "tc-da-1-8-"));
    try {
        await withChecks(cx, async checks => {
            let failed = 0;
            const started = Time.nowUs;
            for (const [index, [vector, productId]] of CERTIFICATE_SETS.entries()) {
                if (Time.nowUs - started > ATTEMPT_BUDGET) {
                    const skipped = CERTIFICATE_SETS.slice(index).map(([name]) => name);
                    checks.push({
                        what: "Every certificate set attempted",
                        check: () => ({
                            type: "response",
                            verdict: "fail",
                            detail: `Out of time after ${Duration.format(ATTEMPT_BUDGET)}; not attempted: ${skipped.join(", ")}`,
                        }),
                    });
                    failed += skipped.length;
                    break;
                }
                const dac = await startWith(th, dir, vector, productId);
                if (!(await commissionVector(cx, th, vector, dac, checks))) {
                    failed++;
                }
            }
            if (failed) {
                throw new CertCheckFailedError(
                    `${failed} of ${CERTIFICATE_SETS.length} certificate sets did not commission`,
                );
            }
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/**
 * Commissions the TH presenting `vector`, checks that the TH presented that vector's DAC, then has the DUT remove the
 * TH again. Whether the commissioning succeeded.
 *
 * The DAC check matters: CHIP's DAC provider keeps its default development certificates when it cannot load a
 * vector, and those commission with the product id most vectors use.
 */
async function commissionVector(
    cx: CertStepContext,
    th: CertDevice,
    vector: string,
    dac: string,
    checks: RecordedCheck[],
) {
    const dut = cx.controllers.dut;
    let ref;
    try {
        ref = await commissionChecked(
            dut,
            {
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
                giveUpAfterMs: COMMISSIONING_TIMEOUT,
                withoutSubscription: true,
            },
            th,
            `DUT commissions the TH presenting ${vector}`,
            checks,
        );
    } catch (e) {
        if (e instanceof CertCheckFailedError) {
            return false;
        }
        throw e;
    }

    const presented = await attempt(
        () =>
            dut
                .node(ref)
                .invoke("OperationalCredentials", "certificateChainRequest", { certificateType: DAC_CERTIFICATE }, 0),
        response =>
            `TH presents ${presentedDac(response) === dac ? "the DAC of" : "a DAC other than that of"} ${vector}`,
    );
    const presentedCheck: CheckRecord = presented.ok
        ? { ...presented.check, verdict: presentedDac(presented.value) === dac ? "pass" : "fail" }
        : presented.check;
    checks.push({ what: `TH presents the DAC of ${vector}`, check: () => presentedCheck });

    // A peer left on the DUT keeps reconnecting while the later vectors run, so a failed removal fails the step
    const removed = await attempt(
        () => dut.node(ref).decommission(),
        () => `DUT removed the TH presenting ${vector}`,
    );
    checks.push({ what: `DUT removes the TH presenting ${vector}`, check: () => removed.check });
    return presentedCheck.verdict === "pass";
}

/** The certificate a CertificateChainResponse carries, as hex. */
function presentedDac(response: unknown) {
    if (typeof response !== "object" || response === null || !("certificate" in response)) {
        return undefined;
    }
    return Bytes.isBytes(response.certificate) ? Bytes.toHex(response.certificate) : undefined;
}

certTest("TC-DA-1.8", {
    plan: "deviceattestation.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER"],
    app: "all-clusters",
    attestation: true,

    // Only a chip app starts with a DAC provider, and the case hands it one as a host file, which only a chip-local
    // app can open
    flavors: ["chip-local"],
}).step(
    1,
    "For each of the test cases in the Certificates for TC-DA-1.8 table, start the TH using the appropriate " +
        "certificate set, commission the TH using the DUT, then factory reset the TH",
    commissionEach,
    { expected: "Verify that the TH is successfully commissioned for each test case" },
);

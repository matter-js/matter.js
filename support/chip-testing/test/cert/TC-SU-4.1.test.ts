/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type {
    AttributePathSpec,
    AttributeWriteStatus,
    CertNodeApi,
    CertStepContext,
    CheckRecord,
} from "@matter/testing";
import { certTest } from "@matter/testing";
import { OtaUpdateState, updateStateName } from "./tc-su-support.js";
import { CommissionedRefs, readOwnFabricIndex, recordAll, requireId } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th" | "th3">();

const REQUESTOR = Matter.clusters.require("OtaSoftwareUpdateRequestor");
const REQUESTOR_ID = requireId(REQUESTOR.id, "OtaSoftwareUpdateRequestor cluster");

const SUCCESS = 0;
const CONSTRAINT_ERROR = 0x87;

/** The plan's providers. None of them runs: the steps only write and read entries naming them. */
const TH2_NODE_ID = 1;
const TH3_NODE_ID = 3;
const TH4_NODE_ID = 4;
const PROVIDER_ENDPOINT = 0;

/** How long fabric 1 keeps the window open that adds the DUT to fabric 2. */
const COMMISSIONING_WINDOW_SECONDS = 180;

function attributeId(name: string) {
    return requireId(REQUESTOR.attributes.require(name).id, `OtaSoftwareUpdateRequestor.${name}`);
}

/**
 * The endpoint carrying the DUT's requestor, which step 0 finds: matter.js's requestor and chip's
 * `ota-requestor-app` carry the cluster on different ones.
 */
let requestorEndpoint: number | undefined;

function attributePath(name: string): AttributePathSpec {
    if (requestorEndpoint === undefined) {
        throw new InternalError("The requestor endpoint was not found in step 0");
    }
    return { endpoint: requestorEndpoint, cluster: REQUESTOR_ID, attribute: attributeId(name) };
}

const fabricIndexes = new Map<"th" | "th3", number>();

function fabricIndexOf(role: "th" | "th3") {
    const index = fabricIndexes.get(role);
    if (index === undefined) {
        throw new InternalError(`No fabric index recorded for ${role}`);
    }
    return index;
}

function provider(nodeId: number, role: "th" | "th3") {
    return { providerNodeId: nodeId, endpoint: PROVIDER_ENDPOINT, fabricIndex: fabricIndexOf(role) };
}

function node(cx: CertStepContext, role: "th" | "th3"): CertNodeApi {
    return cx.controllers[role].node(commissioned.require(role, `the DUT on ${role}'s fabric`));
}

/** Writes `DefaultOTAProviders` on `role`'s fabric and returns the status of each written path. */
async function writeProviders(cx: CertStepContext, role: "th" | "th3", providers: unknown[]) {
    return node(cx, role).writeAttributes([{ path: attributePath("defaultOtaProviders"), value: providers }]);
}

/**
 * A list write is an empty REPLACE and one ADD per entry, and the DUT answers each with its own status (Matter Core,
 * Interaction Model, Write Response Action). The write works when every one is SUCCESS, and is refused when one carries `refusal`.
 */
function writeCheck(statuses: AttributeWriteStatus[], what: string, refusal?: number): CheckRecord {
    const found = statuses.map(({ status }) => status);
    const ok =
        found.length > 0 &&
        (refusal === undefined ? found.every(status => status === SUCCESS) : found.includes(refusal));
    return {
        type: "response",
        verdict: ok ? "pass" : "fail",
        detail:
            `${what}: statuses [${found.map(hex).join(", ")}], expected ` +
            (refusal === undefined ? `all ${hex(SUCCESS)}` : `one to be ${hex(refusal)}`),
    };
}

function hex(status: number) {
    return `0x${status.toString(16)}`;
}

/** Reads `DefaultOTAProviders` as `role`'s fabric sees it and compares the provider node ids. */
async function providersCheck(cx: CertStepContext, role: "th" | "th3", expected: number[]): Promise<CheckRecord> {
    const value = await node(cx, role).readAttribute(attributePath("defaultOtaProviders"));
    if (!Array.isArray(value)) {
        return { type: "response", verdict: "fail", detail: `DefaultOTAProviders read as ${JSON.stringify(value)}` };
    }
    const fabricIndex = fabricIndexOf(role);
    const found = value.map(entry =>
        typeof entry === "object" && entry !== null && "providerNodeId" in entry && "fabricIndex" in entry
            ? { nodeId: Number(entry.providerNodeId), fabricIndex: entry.fabricIndex }
            : { nodeId: NaN, fabricIndex: undefined },
    );
    const ok =
        found.length === expected.length &&
        found.every(({ nodeId, fabricIndex: index }, i) => nodeId === expected[i] && index === fabricIndex);
    return {
        type: "response",
        verdict: ok ? "pass" : "fail",
        detail:
            `fabric ${fabricIndex} (${role}) DefaultOTAProviders: provider nodes ` +
            `[${found.map(({ nodeId }) => nodeId).join(", ")}], expected [${expected.join(", ")}]`,
    };
}

function providersEntry(cx: CertStepContext, role: "th" | "th3", expected: number[], what: string) {
    return { what, check: () => providersCheck(cx, role, expected) };
}

certTest("TC-SU-4.1", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.OTA.Requestor"],
    app: "ota-requestor",
    controllers: { th: "helper", th3: "helper" },
    devices: { dut: "ota-requestor" },
})
    .step(
        "0",
        "Commissioning, already done",
        async cx => {
            const th = cx.controllers.th;
            const dut = cx.devices.dut;

            const thRef = await th.commission({
                passcode: dut.commissioning.passcode,
                discriminator: dut.commissioning.discriminator,
            });
            commissioned.set("th", thRef);
            fabricIndexes.set("th", await readOwnFabricIndex(th.node(thRef)));

            const requestors = await th
                .node(thRef)
                .readAttributes([{ cluster: REQUESTOR_ID, attribute: attributeId("updateState") }]);
            if (requestors.length !== 1) {
                throw new InternalError(
                    `Expected one endpoint with an OTA requestor, found ${requestors.map(({ endpoint }) => endpoint).join(", ") || "none"}`,
                );
            }
            requestorEndpoint = requestors[0].endpoint;

            const { manualPairingCode } = await th
                .node(thRef)
                .openCommissioningWindow({ timeout: COMMISSIONING_WINDOW_SECONDS, enhanced: true });
            if (manualPairingCode === undefined) {
                throw new InternalError("openCommissioningWindow({enhanced: true}) returned no manualPairingCode");
            }
            const th3 = cx.controllers.th3;
            const th3Ref = await th3.commission({ manualPairingCode });
            commissioned.set("th3", th3Ref);
            fabricIndexes.set("th3", await readOwnFabricIndex(th3.node(th3Ref)));

            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail:
                    `DUT on fabric ${fabricIndexOf("th")} (TH) and fabric ${fabricIndexOf("th3")} (TH3), ` +
                    `requestor on endpoint ${requestorEndpoint}`,
            });
        },
        { expected: "The DUT is commissioned to the TH's fabric and, through a window the TH opens, to TH3's." },
    )
    .step(
        1,
        "TH sends a write request for the DefaultOTAProviders Attribute on the first fabric to the DUT. TH2 is set as the default Provider for the fabric.",
        async cx => {
            const statuses = await writeProviders(cx, "th", [provider(TH2_NODE_ID, "th")]);
            await recordAll(cx, [{ what: "write TH2", check: () => writeCheck(statuses, "write [TH2]") }]);
        },
        {
            expected:
                "Verify that the write operation for the attribute works and DUT does not respond with any errors.",
        },
    )
    .step(
        2,
        "TH sends a read request to read the DefaultOTAProviders Attribute on the first fabric to the DUT.",
        cx => recordAll(cx, [providersEntry(cx, "th", [TH2_NODE_ID], "fabric 1 holds TH2")]),
        { expected: "Verify that the attribute value is set to TH2 as the default OTA provider for the fabric." },
    )
    .step(
        3,
        "TH sends a write request for the DefaultOTAProviders Attribute on the second fabric to the DUT. TH3 is set as the default Provider for the fabric.",
        async cx => {
            const statuses = await writeProviders(cx, "th3", [provider(TH3_NODE_ID, "th3")]);
            await recordAll(cx, [{ what: "write TH3", check: () => writeCheck(statuses, "write [TH3]") }]);
        },
        {
            expected:
                "Verify that the write operation for the attribute works and DUT does not respond with any errors.",
        },
    )
    .step(
        4,
        "TH sends a read request to read the DefaultOTAProviders Attribute on the first and second fabric to the DUT.",
        cx =>
            recordAll(cx, [
                providersEntry(cx, "th", [TH2_NODE_ID], "fabric 1 holds TH2"),
                providersEntry(cx, "th3", [TH3_NODE_ID], "fabric 2 holds TH3"),
            ]),
        {
            expected:
                "Verify that the attribute value is set to TH2 as the default OTA provider for the first fabric and TH3 for the second fabric.",
        },
    )
    .step(
        5,
        "TH sends a write request for the DefaultOTAProviders Attribute on the first fabric to the DUT. TH4 is the first Provider location and TH2 is the second Provider location in the same write request on the first fabric. TH sends a read request to read the DefaultOTAProviders Attribute on the first and second fabric to the DUT.",
        async cx => {
            const statuses = await writeProviders(cx, "th", [provider(TH4_NODE_ID, "th"), provider(TH2_NODE_ID, "th")]);
            await recordAll(cx, [
                {
                    what: "write refused",
                    check: () => writeCheck(statuses, "write [TH4, TH2]", CONSTRAINT_ERROR),
                },
                providersEntry(cx, "th", [TH4_NODE_ID], "fabric 1 holds TH4"),
                providersEntry(cx, "th3", [TH3_NODE_ID], "fabric 2 holds TH3"),
            ]);
        },
        {
            expected:
                "Verify that the write operation fails with CONSTRAINT_ERROR status code 0x87. Verify that the attribute value is set to TH3 as the default OTA provider for the second fabric and TH4 for the first fabric.",
        },
    )
    .step(
        6,
        "TH sends a write request for the DefaultOTAProviders Attribute with an empty provider list on the second fabric to the DUT. TH sends a read request to read the DefaultOTAProviders Attribute on the first and second fabric to the DUT.",
        async cx => {
            const statuses = await writeProviders(cx, "th3", []);
            await recordAll(cx, [
                { what: "write empty", check: () => writeCheck(statuses, "write [] on fabric 2") },
                providersEntry(cx, "th", [TH4_NODE_ID], "fabric 1 holds TH4"),
                providersEntry(cx, "th3", [], "fabric 2 holds none"),
            ]);
        },
        {
            expected:
                "Verify that the write operation for the attribute works and DUT does not respond with any errors. Verify that the attribute value is set to TH4 as the default OTA provider for the first fabric and none for the second fabric.",
        },
    )
    .step(
        7,
        "TH sends a read request to read the UpdatePossible attribute from the DUT.",
        async cx => {
            const value = await node(cx, "th").readAttribute(attributePath("updatePossible"));
            await recordAll(cx, [
                {
                    what: "UpdatePossible is true",
                    check: () => ({
                        type: "response",
                        verdict: value === true ? "pass" : "fail",
                        detail: `UpdatePossible read as ${JSON.stringify(value)}`,
                    }),
                },
            ]);
        },
        { expected: "Verify that the attribute value is set to True when there is an update possible." },
    )
    .step(
        8,
        "TH sends a read request to read the UpdateState Attribute from the DUT.",
        async cx => {
            const value = await node(cx, "th").readAttribute(attributePath("updateState"));
            await recordAll(cx, [
                {
                    what: "UpdateState is a defined value",
                    check: () => ({
                        type: "response",
                        verdict: Object.values<unknown>(OtaUpdateState).includes(value) ? "pass" : "fail",
                        detail: `UpdateState read as ${updateStateName(value)}`,
                    }),
                },
            ]);
        },
        {
            expected:
                "Verify that the attribute value is set to one of the following values. Unknown, Idle, Querying, DelayedOnQuery, Downloading, Applying, DelayedOnApply, RollingBack, DelayedOnUserConsent.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, Bytes, Crypto, Environment, InternalError, isObject } from "@matter/main";
import { OperationalCredentials } from "@matter/main/clusters";
import { Certificate, Noc, TlvCertSigningRequest } from "@matter/main/protocol";
import {
    TlvByteString,
    TlvField,
    TlvInvokeRequest,
    TlvInvokeResponse,
    TlvObject,
    TlvOptionalField,
    TlvUInt16,
    TlvUInt64,
} from "@matter/main/types";
import type { TlvStream } from "@matter/main/types";
import { Matter } from "@matter/model";
import type { CertDevice, CertNodeRef, CertStepContext, CheckRecord, LogExpectPatterns } from "@matter/testing";
import { certTest, flavorFamily } from "@matter/testing";
import { readFabrics, removeFabricResponseFailure } from "./tc-cadmin-support.js";
import { commissionChecked, COMMISSIONING_LOG_TIMEOUT } from "./tc-dd-support.js";
import {
    attempt,
    CertCheckFailedError,
    CommissionedRefs,
    describeError,
    describeValue,
    expectAttributePathIB,
    expectDeviceLog,
    LOG_TIMEOUT,
    record,
    removeFabricSucceeded,
    requireId,
    runCleanups,
    theTh,
    withChecks,
} from "./tc-support.js";

const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const OPERATIONAL_CREDENTIALS_ID = requireId(OPERATIONAL_CREDENTIALS.id, "OperationalCredentials cluster");

function commandId(name: string) {
    return requireId(OPERATIONAL_CREDENTIALS.commands.require(name).id, `OperationalCredentials.${name}`);
}

function attributeId(name: string) {
    return requireId(OPERATIONAL_CREDENTIALS.attributes.require(name).id, `OperationalCredentials.${name}`);
}

const CSR_RESPONSE_ID = commandId("csrResponse");
const ADD_NOC_ID = commandId("addNoc");
const UPDATE_NOC_ID = commandId("updateNoc");

const ROOT_ENDPOINT = 0;

/** § 11.18.4.5: RootPublicKey is a 65-octet uncompressed P-256 point. */
const ROOT_PUBLIC_KEY_LENGTH = 65;

/** § 11.18.4.5: Label is at most 32 bytes. */
const MAX_LABEL_BYTES = 32;

/** What step 12 sets as the fabric label. */
const FABRIC_LABEL = "matter.js cert";

/**
 * The TH announcing, as it comes back from its factory reset, that it holds no fabric. matter.js says so; chip opens
 * its commissioning window at start only when its fabric table is empty, so it advertises as commissionable.
 */
const HOLDS_NO_FABRIC = {
    chip: /mDNS service published: _matterc\._udp/,
    matterjs: /Commissioning \S+ is uncommissioned/,
};

/** A TH's line for receiving `command`; matter.js prints the request with its fields. */
function received(command: string, chip: RegExp): LogExpectPatterns {
    return { chip, matterjs: new RegExp(`ProtocolService Invoke « .*operationalCredentials\\.${command}\\b`) };
}

const ATTESTATION_REQUEST = received("attestationRequest", /OpCreds: Received an AttestationRequest command/);
const CERTIFICATE_CHAIN_REQUEST = received(
    "certificateChainRequest",
    /OpCreds: Certificate Chain request received for (?:DAC|PAI)/,
);
const CSR_REQUEST = received("csrRequest", /OpCreds: Received a CSRRequest command/);
const ADD_TRUSTED_ROOT = received(
    "addTrustedRootCertificate",
    /OpCreds: Received an AddTrustedRootCertificate command/,
);
const ADD_NOC = received("addNoc", /OpCreds: Received an AddNOC command/);
const UPDATE_NOC = received("updateNoc", /OpCreds: Received an UpdateNOC command/);
const UPDATE_FABRIC_LABEL = received("updateFabricLabel", /OpCreds: Received an UpdateFabricLabel command/);

/** A TH's line for answering `command` with an OK NOCResponse. */
function answeredOk(command: string, chip: RegExp): LogExpectPatterns {
    return {
        chip,
        matterjs: new RegExp(`ProtocolService Invoke » .*operationalCredentials\\.${command}\\b.*statusCode: 0(?!\\d)`),
    };
}

const UPDATE_NOC_OK = answeredOk("updateNoc", /OpCreds: UpdateNOC successful\./);

/** The CSRResponse the TH sent: chip's success line, matter.js's response line carrying the fields. */
const CSR_RESPONSE = {
    chip: /OpCreds: CSRRequest successful\./,
    matterjs: /ProtocolService Invoke » .*operationalCredentials\.csrRequest\b.*nocsrElements: [0-9a-f]+/,
};

function removeFabricReceived(fabricIndex: number): LogExpectPatterns {
    return {
        chip: new RegExp(`OpCreds: Received a RemoveFabric Command for FabricIndex 0x${fabricIndex.toString(16)}\\b`),
        matterjs: new RegExp(
            `ProtocolService Invoke « .*operationalCredentials\\.removeFabric\\b.*fabricIndex: ${fabricIndex}(?!\\d)`,
        ),
    };
}

/**
 * chip's trace decoder (`--trace_decode 1`) writes a header line per message, then `Decrypted Payload (N bytes) =`
 * `{` and `data = <hex>`: the interaction model payload as lowercase hex, for inbound and outbound messages alike
 * (`examples/common/tracing/TraceDecoder.cpp`). A payload of an invoke on this cluster stays well under the 1708
 * characters a log line can hold.
 */
const CHIP_INVOKE_REQUEST_IN = /\[DMG\] << from .*\/ InvokeCommandRequest \(0x08\) \//;
const CHIP_INVOKE_RESPONSE_OUT = /\[DMG\] >> to .*\/ InvokeCommandResponse \(0x09\) \//;
const CHIP_PAYLOAD_SIZE = /\[DMG\]\s+Decrypted Payload \((\d+) bytes\) =/;
const CHIP_PAYLOAD_DATA = /\[DMG\]\s+data = ([0-9a-fA-F]+)\s*$/;

/** Lines chip writes between `Decrypted Payload … =` and its `data =` line. */
const CHIP_PAYLOAD_DATA_WINDOW = 3;

/** How many lines after a message header chip's payload lines may start. */
const CHIP_TRACE_WINDOW = 40;

/**
 * How many lines before a command handler's own line the header of the request may be. chip decodes the request
 * twice in between, in its trace and in the interaction model's own dump.
 */
const CHIP_HANDLER_WINDOW = 300;

/** The fields of a CSRResponse (§ 11.18.6.6). */
const TlvCsrResponseFields = TlvObject({
    nocsrElements: TlvField(0, TlvByteString),
    attestationSignature: TlvField(1, TlvByteString),
});

/** The fields of an AddNOC (§ 11.18.6.8); UpdateNOC (§ 11.18.6.9) shares the first two. */
const TlvNocFields = TlvObject({
    nocValue: TlvField(0, TlvByteString),
    icacValue: TlvOptionalField(1, TlvByteString),
    ipkValue: TlvOptionalField(2, TlvByteString),
    caseAdminSubject: TlvOptionalField(3, TlvUInt64),
    adminVendorId: TlvOptionalField(4, TlvUInt16),
});

type NocFields = ReturnType<typeof TlvNocFields.decode>;

/** A value read out of the TH's log, with the check that says where it came from or why it could not be read. */
interface LoggedValue<T> {
    check: CheckRecord;
    value?: T;
}

/** The payload chip logged for the message whose header is on `headerLine`. */
function chipPayloadAfter(th: CertDevice, headerLine: number): Bytes | undefined {
    for (let index = headerLine + 1; index <= headerLine + CHIP_TRACE_WINDOW; index++) {
        const size = CHIP_PAYLOAD_SIZE.exec(th.log.at(index)?.text ?? "");
        if (size === null) {
            continue;
        }
        for (let dataLine = index + 1; dataLine <= index + CHIP_PAYLOAD_DATA_WINDOW; dataLine++) {
            const hex = CHIP_PAYLOAD_DATA.exec(th.log.at(dataLine)?.text ?? "")?.[1];
            if (hex !== undefined) {
                return hex.length === Number(size[1]) * 2 ? Bytes.fromHex(hex.toLowerCase()) : undefined;
            }
        }
        return undefined;
    }
    return undefined;
}

/** The fields of the first OperationalCredentials `command` in an InvokeRequest payload. */
function requestFields(payload: Bytes, command: number): TlvStream | undefined {
    return TlvInvokeRequest.decode(payload).invokeRequests.find(
        ({ commandPath }) => commandPath.clusterId === OPERATIONAL_CREDENTIALS_ID && commandPath.commandId === command,
    )?.commandFields;
}

/** The fields of the first OperationalCredentials `command` in an InvokeResponse payload. */
function responseFields(payload: Bytes, command: number): TlvStream | undefined {
    return TlvInvokeResponse.decode(payload).invokeResponses.find(
        response =>
            response.command?.commandPath.clusterId === OPERATIONAL_CREDENTIALS_ID &&
            response.command.commandPath.commandId === command,
    )?.command?.commandFields;
}

/**
 * Reads `fields` of the request chip handled on `handlerLine`: the latest inbound InvokeRequest before that line,
 * which chip's trace logs before the handler runs.
 */
function chipRequestBefore<T>(
    th: CertDevice,
    handlerLine: number,
    command: number,
    decode: (fields: TlvStream) => T,
): LoggedValue<T> {
    for (let index = handlerLine - 1; index >= Math.max(0, handlerLine - CHIP_HANDLER_WINDOW); index--) {
        if (!CHIP_INVOKE_REQUEST_IN.test(th.log.at(index)?.text ?? "")) {
            continue;
        }
        return decodeChipPayload(th, index, payload => requestFields(payload, command), decode);
    }
    return {
        check: {
            type: "device-log",
            verdict: "fail",
            detail: `No inbound InvokeCommandRequest header within ${CHIP_HANDLER_WINDOW} lines before line ${handlerLine}`,
            logLine: handlerLine,
        },
    };
}

function decodeChipPayload<T>(
    th: CertDevice,
    headerLine: number,
    fieldsOf: (payload: Bytes) => TlvStream | undefined,
    decode: (fields: TlvStream) => T,
): LoggedValue<T> {
    const failed = (detail: string): LoggedValue<T> => ({
        check: { type: "device-log", verdict: "fail", detail, logLine: headerLine },
    });
    const payload = chipPayloadAfter(th, headerLine);
    if (payload === undefined) {
        return failed(`The message on line ${headerLine} has no complete "data =" payload line`);
    }
    try {
        const fields = fieldsOf(payload);
        if (fields === undefined) {
            return failed(`The message on line ${headerLine} carries no such command: ${Bytes.toHex(payload)}`);
        }
        return {
            check: { type: "device-log", verdict: "pass", matched: th.log.at(headerLine)?.text, logLine: headerLine },
            value: decode(fields),
        };
    } catch (error) {
        return failed(`The payload on line ${headerLine} does not decode: ${describeError(error)}`);
    }
}

/** A field matter.js printed on `text` as `<name>: <value>`. */
function matterjsField(text: string, name: string): string | undefined {
    return new RegExp(`\\b${name}: (\\S+)`).exec(text)?.[1];
}

function matterjsBytes(text: string, name: string): Bytes | undefined {
    const hex = matterjsField(text, name);
    return hex === undefined || !/^(?:[0-9a-f]{2})+$/.test(hex) ? undefined : Bytes.fromHex(hex);
}

/** The NOC fields matter.js printed on its `Invoke «` line for an AddNOC or UpdateNOC. */
function matterjsNocFields(check: CheckRecord): LoggedValue<NocFields> {
    const text = check.matched ?? "";
    const nocValue = matterjsBytes(text, "nocValue");
    if (nocValue === undefined) {
        return { check: { ...check, verdict: "fail", detail: "The TH's line prints no nocValue" } };
    }
    const caseAdminSubject = matterjsField(text, "caseAdminSubject");
    const adminVendorId = matterjsField(text, "adminVendorId");
    return {
        check,
        value: {
            nocValue,
            icacValue: matterjsBytes(text, "icacValue"),
            ipkValue: matterjsBytes(text, "ipkValue"),
            caseAdminSubject: caseAdminSubject === undefined ? undefined : BigInt(caseAdminSubject),
            adminVendorId: adminVendorId === undefined ? undefined : Number(adminVendorId),
        },
    };
}

/** Waits for the TH to log receiving an AddNOC or UpdateNOC at or after `from` and reads its fields. */
async function readNocRequest(
    th: CertDevice,
    patterns: LogExpectPatterns,
    command: number,
    from: number,
): Promise<LoggedValue<NocFields>> {
    const { check } = await expectDeviceLog(th.log, th.flavor, patterns, from, COMMISSIONING_LOG_TIMEOUT);
    if (check.verdict !== "pass" || check.logLine === undefined) {
        return { check };
    }
    if (flavorFamily(th.flavor) === "matterjs") {
        return matterjsNocFields(check);
    }
    return chipRequestBefore(th, check.logLine, command, fields => TlvNocFields.decodeTlv(fields));
}

type CsrResponseFields = ReturnType<typeof TlvCsrResponseFields.decode>;

/** Waits for the TH to log its CSRResponse at or after `from` and reads its fields. */
async function readCsrResponse(th: CertDevice, from: number): Promise<LoggedValue<CsrResponseFields>> {
    const { check } = await expectDeviceLog(th.log, th.flavor, CSR_RESPONSE, from, COMMISSIONING_LOG_TIMEOUT);
    if (check.verdict !== "pass" || check.logLine === undefined) {
        return { check };
    }
    if (flavorFamily(th.flavor) === "matterjs") {
        const text = check.matched ?? "";
        const nocsrElements = matterjsBytes(text, "nocsrElements");
        const attestationSignature = matterjsBytes(text, "attestationSignature");
        if (nocsrElements === undefined || attestationSignature === undefined) {
            return { check: { ...check, verdict: "fail", detail: "The TH's line lacks a CSRResponse field" } };
        }
        return { check, value: { nocsrElements, attestationSignature } };
    }

    const header = await expectDeviceLog(
        th.log,
        th.flavor,
        { chip: CHIP_INVOKE_RESPONSE_OUT },
        check.logLine + 1,
        LOG_TIMEOUT,
    );
    const headerLine = header.check.logLine;
    if (header.check.verdict !== "pass" || headerLine === undefined) {
        return { check: header.check };
    }
    // Waited for, so the payload lines after the header are in the buffer when it is read
    const data = await expectDeviceLog(th.log, th.flavor, { chip: CHIP_PAYLOAD_DATA }, headerLine + 1, LOG_TIMEOUT);
    if (data.check.verdict !== "pass") {
        return { check: data.check };
    }
    return decodeChipPayload(
        th,
        headerLine,
        payload => responseFields(payload, CSR_RESPONSE_ID),
        fields => TlvCsrResponseFields.decodeTlv(fields),
    );
}

const commissioned = new CommissionedRefs();

/** Where the TH log of step 2's commissioning starts. */
let commissioningFrom: number | undefined;

let csrResponse: CsrResponseFields | undefined;
let addNoc: NocFields | undefined;

/** The DUT's fabric as step 8 read it. */
let fabric: Awaited<ReturnType<typeof readFabrics>>[number] | undefined;

function commissioningMark() {
    if (commissioningFrom === undefined) {
        throw new CertCheckFailedError("Step 2's commissioning did not start, so its messages cannot be checked");
    }
    return commissioningFrom;
}

function requireRead<T>(value: T | undefined, what: string): T {
    if (value === undefined) {
        throw new CertCheckFailedError(`${what} was not read by its earlier step`);
    }
    return value;
}

/** Records that the TH logged `patterns` during step 2's commissioning. */
async function recordCommissioningMessage(cx: CertStepContext, patterns: LogExpectPatterns, what: string) {
    const th = theTh(cx);
    const { check } = await expectDeviceLog(
        th.log,
        th.flavor,
        patterns,
        commissioningMark(),
        COMMISSIONING_LOG_TIMEOUT,
    );
    record(cx, check, what);
}

function nocSubject(noc: Bytes) {
    const { subject, ellipticCurvePublicKey } = Noc.fromTlv(noc).cert;
    return { nodeId: BigInt(subject.nodeId), fabricId: BigInt(subject.fabricId), publicKey: ellipticCurvePublicKey };
}

function describeBytes(value: Bytes | undefined) {
    return value === undefined ? "absent" : Bytes.toHex(value);
}

function matches(pass: boolean, detail: string): CheckRecord {
    return { type: "response", verdict: pass ? "pass" : "fail", detail };
}

/** The DUT reads `attribute` of the TH's Operational Credentials cluster; records the value and the TH's log of it. */
function readsAttribute(attribute: string) {
    return commissioned.withRef("dut", async (cx, ref) => {
        const th = theTh(cx);
        const path = {
            endpoint: ROOT_ENDPOINT,
            cluster: OPERATIONAL_CREDENTIALS_ID,
            attribute: attributeId(attribute),
        };
        const from = await th.log.markSettled();
        const read = await attempt(
            () => cx.controllers.dut.node(ref).readAttribute(path),
            value => `${attribute} = ${describeValue(value)}`,
        );
        const logged = await expectAttributePathIB(th.log, th.flavor, path, from, LOG_TIMEOUT);
        await withChecks(cx, async checks => {
            checks.push({ what: `the DUT's read of ${attribute}`, check: () => read.check });
            checks.push({ what: `the TH received the read of ${attribute}`, check: () => logged });
        });
    });
}

/** Why `response` is no OK NOCResponse for `fabricIndex`, or `undefined` where it is one. */
function nocResponseFailure(response: unknown, fabricIndex: number): string | undefined {
    if (!isObject(response) || response.statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
        return `expected a NOCResponse with statusCode Ok, got ${describeValue(response)}`;
    }
    if (response.fabricIndex !== undefined && response.fabricIndex !== fabricIndex) {
        return `NOCResponse names fabricIndex ${describeValue(response.fabricIndex)}, not ${fabricIndex}`;
    }
    return undefined;
}

/**
 * Has the DUT invoke an OperationalCredentials command answered by a NOCResponse.  Returns the response, or the
 * failed check when the invoke failed, without throwing, so the step still takes its TH log checks.
 */
async function invokeNocCommand(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    args: object,
): Promise<{ response?: unknown; failure?: CheckRecord }> {
    const invoked = await attempt(
        () => cx.controllers.dut.node(ref).invoke("OperationalCredentials", command, args, ROOT_ENDPOINT),
        response => `${command} answered ${describeValue(response)}`,
    );
    return invoked.ok ? { response: invoked.value } : { failure: invoked.check };
}

certTest("TC-OPCREDS-3.3", {
    plan: "node_operational_credentials.adoc",
    pics: ["OPCREDS.C"],
    app: "all-clusters",
})
    .step(1, "Factory Reset TH (to ensure NOC list is empty at the beginning of the following steps)", async cx => {
        const th = theTh(cx);
        const from = await th.log.markSettled();
        await withChecks(cx, async checks => {
            const reset = await attempt(
                () => th.backchannel({ name: "factoryReset" }),
                () => "The TH reset to factory defaults",
            );
            checks.push({ what: "Factory reset", check: () => reset.check });
            if (!reset.ok) {
                return;
            }
            const announced = await expectDeviceLog(
                th.log,
                th.flavor,
                HOLDS_NO_FABRIC,
                from,
                COMMISSIONING_LOG_TIMEOUT,
            );
            checks.push({ what: "The TH announced it holds no fabric", check: () => announced.check });
        });
    })
    .step(2, "Start the commissioning process of TH with DUT", async cx => {
        const th = theTh(cx);
        commissioningFrom = await th.log.markSettled();
        await withChecks(cx, async checks => {
            commissioned.set(
                "dut",
                await commissionChecked(
                    cx.controllers.dut,
                    { passcode: th.commissioning.passcode, discriminator: th.commissioning.discriminator },
                    th,
                    "DUT commissions TH",
                    checks,
                ),
            );
        });
    })
    .step(3, "Verify that TH receives AttestationRequest Command from DUT", cx =>
        recordCommissioningMessage(cx, ATTESTATION_REQUEST, "the TH received AttestationRequest"),
    )
    .step(4, "Verify that TH receives CertificateChainRequest Command from DUT", cx =>
        recordCommissioningMessage(cx, CERTIFICATE_CHAIN_REQUEST, "the TH received CertificateChainRequest"),
    )
    .step(
        "5a",
        "Verify that the TH receives CSRRequest command from DUT",
        cx => recordCommissioningMessage(cx, CSR_REQUEST, "the TH received CSRRequest"),
        { pics: "OPCREDS.C.C04.Tx" },
    )
    .step(
        "5b",
        "Extract the CSRResponse values for future use from TH: NOCSRElements, which contains the Node Operational " +
            "PublicKey from CSR, and AttestationSignature",
        async cx => {
            const { check, value } = await readCsrResponse(theTh(cx), commissioningMark());
            record(
                cx,
                value === undefined
                    ? check
                    : {
                          ...check,
                          detail:
                              `NOCSRElements = ${Bytes.toHex(value.nocsrElements)}, ` +
                              `AttestationSignature = ${Bytes.toHex(value.attestationSignature)}`,
                      },
                "the TH's CSRResponse",
            );
            csrResponse = value;
        },
    )
    .step(
        6,
        "Verify that TH receives AddTrustedRootCertificate command from DUT",
        cx => recordCommissioningMessage(cx, ADD_TRUSTED_ROOT, "the TH received AddTrustedRootCertificate"),
        { pics: "OPCREDS.C.C0b.Tx" },
    )
    .step(
        "7a",
        "Verify that TH receives AddNOC Command from DUT",
        cx => recordCommissioningMessage(cx, ADD_NOC, "the TH received AddNOC"),
        { pics: "OPCREDS.C.C06.Tx" },
    )
    .step(
        "7b",
        "TH saves the following values as: NOCValue as nocvalue1, ICACValue as icacvalue1, IpkValue as ipkvalue1, " +
            "CaseAdminSubject as caseadmin1, AdminVendorId as adminvendorid1",
        async cx => {
            const { check, value } = await readNocRequest(theTh(cx), ADD_NOC, ADD_NOC_ID, commissioningMark());
            const missing =
                value === undefined
                    ? undefined
                    : (["ipkValue", "caseAdminSubject", "adminVendorId"] as const).filter(
                          name => value[name] === undefined,
                      );
            record(
                cx,
                value === undefined || missing === undefined
                    ? check
                    : {
                          ...check,
                          verdict: missing.length === 0 ? check.verdict : "fail",
                          detail:
                              `nocvalue1 = ${Bytes.toHex(value.nocValue)}, icacvalue1 = ${describeBytes(value.icacValue)}, ` +
                              `ipkvalue1 = ${describeBytes(value.ipkValue)}, caseadmin1 = ${value.caseAdminSubject}, ` +
                              `adminvendorid1 = ${value.adminVendorId}` +
                              (missing.length === 0 ? "" : `; missing ${missing.join(", ")}`),
                      },
                "the AddNOC fields the TH received",
            );
            addNoc = value;
        },
    )
    .step(
        8,
        "Extract the following FabricDescriptorStruct values from TH: RootPublicKey, VendorID, FabricID, NodeID, Label",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = theTh(cx);
            const path = {
                endpoint: ROOT_ENDPOINT,
                cluster: OPERATIONAL_CREDENTIALS_ID,
                attribute: attributeId("fabrics"),
            };
            const from = await th.log.markSettled();
            const read = await attempt(
                () => readFabrics(cx.controllers.dut.node(ref)),
                fabrics => `Fabrics = ${describeValue(fabrics)}`,
            );
            const logged = await expectAttributePathIB(th.log, th.flavor, path, from, LOG_TIMEOUT);
            await withChecks(cx, async checks => {
                checks.push({ what: "the DUT's read of Fabrics", check: () => read.check });
                checks.push({ what: "the TH received the read of Fabrics", check: () => logged });
                if (!read.ok) {
                    return;
                }
                // Step 1 reset the TH, so the DUT's fabric is the only one
                const [entry, ...others] = read.value;
                checks.push({
                    what: "the TH holds the DUT's fabric alone",
                    check: () =>
                        matches(
                            entry !== undefined && others.length === 0,
                            `The TH holds ${read.value.length} fabrics`,
                        ),
                });
                fabric = entry;
            });
        }),
    )
    .step(
        9,
        "Verify the FabricDescriptorStruct values against the AddNOC command",
        async cx => {
            const { rootPublicKey, nodeId, vendorId, fabricId, label } = requireRead(
                fabric,
                "The FabricDescriptorStruct",
            );
            const { nocValue, adminVendorId } = requireRead(addNoc, "The AddNOC fields");
            let subject: ReturnType<typeof nocSubject>;
            try {
                subject = nocSubject(nocValue);
            } catch (error) {
                record(cx, matches(false, `NOCValue is no Matter certificate: ${asError(error).message}`), "NOCValue");
                return;
            }
            const labelBytes = Bytes.fromString(label).byteLength;
            await withChecks(cx, async checks => {
                checks.push({
                    what: "RootPublicKey size",
                    check: () =>
                        matches(
                            rootPublicKey.byteLength === ROOT_PUBLIC_KEY_LENGTH,
                            `RootPublicKey is ${rootPublicKey.byteLength} bytes, ${ROOT_PUBLIC_KEY_LENGTH} expected`,
                        ),
                });
                checks.push({
                    what: "NodeID",
                    check: () =>
                        matches(
                            BigInt(nodeId) === subject.nodeId,
                            `NodeID = ${nodeId}, the AddNOC NOC names node ${subject.nodeId}`,
                        ),
                });
                checks.push({
                    what: "VendorID",
                    check: () =>
                        matches(
                            vendorId === adminVendorId,
                            `VendorID = ${vendorId}, AddNOC sent AdminVendorId ${adminVendorId}`,
                        ),
                });
                checks.push({
                    what: "FabricID",
                    check: () =>
                        matches(
                            BigInt(fabricId) === subject.fabricId,
                            `FabricID = ${fabricId}, the AddNOC NOC names fabric ${subject.fabricId}`,
                        ),
                });
                checks.push({
                    what: "Label size",
                    check: () => matches(labelBytes <= MAX_LABEL_BYTES, `Label "${label}" is ${labelBytes} bytes`),
                });
            });
        },
        {
            expected:
                "The size of RootPublicKey is within 65 octstr; NodeID is the chip-node-id in the NOC sent with AddNOC; " +
                "VendorID is the AdminVendorID sent with AddNOC; FabricID is the matter-fabric-id of the operational " +
                "certificate; Label is at most 32 bytes",
        },
    )
    .step(
        10,
        "Verify that the public Key extracted NOCValue of the AddNOC matches the Node Operational Public Key " +
            "extracted from CSRResponse",
        async cx => {
            const { nocsrElements } = requireRead(csrResponse, "The CSRResponse");
            const { nocValue } = requireRead(addNoc, "The AddNOC fields");
            let csrKey: Bytes;
            let nocKey: Bytes;
            try {
                const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
                csrKey = await Certificate.getPublicKeyFromCsr(Environment.default.get(Crypto), certSigningRequest);
                nocKey = nocSubject(nocValue).publicKey;
            } catch (error) {
                record(
                    cx,
                    matches(false, `The CSR or NOCValue does not decode or verify: ${asError(error).message}`),
                    "the NOC's public key is the CSR's",
                );
                return;
            }
            record(
                cx,
                matches(
                    Bytes.areEqual(csrKey, nocKey),
                    `CSR public key = ${Bytes.toHex(csrKey)}, NOCValue public key = ${Bytes.toHex(nocKey)}`,
                ),
                "the NOC's public key is the CSR's",
            );
        },
    )
    .step(
        11,
        "Trigger the DUT to send UpdateNOC to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = theTh(cx);
            const node = cx.controllers.dut.node(ref);
            if (node.updateOperationalCertificate === undefined) {
                throw new InternalError(
                    "The DUT controller offers no operational certificate update but declares no noc-update gap",
                );
            }
            const update = node.updateOperationalCertificate.bind(node);
            const from = await th.log.markSettled();
            const updated = await attempt(
                () => update(),
                () => "The DUT updated the TH's operational certificate",
            );
            const request = await readNocRequest(th, UPDATE_NOC, UPDATE_NOC_ID, from);
            const answered = await expectDeviceLog(th.log, th.flavor, UPDATE_NOC_OK, from, LOG_TIMEOUT);
            await withChecks(cx, async checks => {
                checks.push({ what: "the DUT's certificate update", check: () => updated.check });
                checks.push({ what: "the TH received UpdateNOC", check: () => request.check });
                checks.push({ what: "the TH answered UpdateNOC with OK", check: () => answered.check });
                const updatedNoc = request.value?.nocValue;
                if (updatedNoc === undefined || addNoc === undefined) {
                    return;
                }
                const before = nocSubject(addNoc.nocValue);
                const after = nocSubject(updatedNoc);
                checks.push({
                    what: "the new NOC keeps the node and fabric and has a new key",
                    check: () =>
                        matches(
                            after.nodeId === before.nodeId &&
                                after.fabricId === before.fabricId &&
                                !Bytes.areEqual(after.publicKey, before.publicKey),
                            `UpdateNOC NOC: node ${after.nodeId}, fabric ${after.fabricId}, key ` +
                                `${Bytes.toHex(after.publicKey)}; AddNOC NOC: node ${before.nodeId}, fabric ` +
                                `${before.fabricId}, key ${Bytes.toHex(before.publicKey)}`,
                        ),
                });
            });
        }),
        {
            pics: "OPCREDS.C.C07.Tx",
            controllerCapabilities: ["noc-update"],
            expected: "Verify that TH receives UpdateNOC Command from DUT successfully.",
        },
    )
    .step(
        12,
        "Trigger the DUT to send UpdateFabricLabel to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = theTh(cx);
            const { fabricIndex } = requireRead(fabric, "The fabric");
            const from = await th.log.markSettled();
            await withChecks(cx, async checks => {
                const { response, failure: invokeFailure } = await invokeNocCommand(cx, ref, "updateFabricLabel", {
                    label: FABRIC_LABEL,
                });
                const failure = invokeFailure === undefined ? nocResponseFailure(response, fabricIndex) : undefined;
                checks.push({
                    what: "UpdateFabricLabel response",
                    check: () =>
                        invokeFailure ??
                        matches(failure === undefined, failure ?? `NOCResponse ${describeValue(response)}`),
                });
                const logged = await expectDeviceLog(th.log, th.flavor, UPDATE_FABRIC_LABEL, from, LOG_TIMEOUT);
                checks.push({ what: "the TH received UpdateFabricLabel", check: () => logged.check });
            });
        }),
        {
            pics: "OPCREDS.C.C09.Tx",
            expected: "Verify that TH receives UpdateFabricLabel Command from DUT successfully.",
        },
    )
    .step(13, "Trigger the DUT to Read SupportedFabrics from TH", readsAttribute("supportedFabrics"), {
        pics: "OPCREDS.C.A0002",
        expected: "Verify that TH receives read SupportedFabrics attribute from DUT successfully",
    })
    .step(14, "Trigger the DUT to read CommissionedFabrics attribute from TH", readsAttribute("commissionedFabrics"), {
        pics: "OPCREDS.C.A0003",
        expected: "Verify that TH receives read CommissionedFabrics attribute from DUT successfully.",
    })
    .step(
        15,
        "Trigger the DUT to read TrustedRootCertificates attribute from TH",
        readsAttribute("trustedRootCertificates"),
        {
            pics: "OPCREDS.C.A0004",
            expected: "Verify that TH receives read TrustedRootCertificates from DUT successfully.",
        },
    )
    .step(16, "Trigger the DUT to read CurrentFabricIndex attribute from TH", readsAttribute("currentFabricIndex"), {
        pics: "OPCREDS.C.A0005",
        expected: "Verify that TH receives read CurrentFabricIndex from DUT successfully.",
    })
    .step(
        17,
        "Trigger the DUT to send RemoveFabric command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = theTh(cx);
            const { fabricIndex } = requireRead(fabric, "The FabricDescriptorStruct");
            const from = await th.log.markSettled();
            await withChecks(cx, async checks => {
                const { response, failure: invokeFailure } = await invokeNocCommand(cx, ref, "removeFabric", {
                    fabricIndex,
                });
                const failure =
                    invokeFailure === undefined ? removeFabricResponseFailure(response, fabricIndex) : undefined;
                checks.push({
                    what: "RemoveFabric response",
                    check: () =>
                        invokeFailure ??
                        matches(failure === undefined, failure ?? `NOCResponse statusCode Ok for ${fabricIndex}`),
                });
                const receivedLog = await expectDeviceLog(
                    th.log,
                    th.flavor,
                    removeFabricReceived(fabricIndex),
                    from,
                    LOG_TIMEOUT,
                );
                checks.push({ what: "the TH received RemoveFabric for the fabric", check: () => receivedLog.check });
                const removed = await expectDeviceLog(
                    th.log,
                    th.flavor,
                    removeFabricSucceeded(fabricIndex),
                    from,
                    LOG_TIMEOUT,
                );
                checks.push({ what: "the TH removed the fabric", check: () => removed.check });
                if (failure === undefined && removed.check.verdict === "pass") {
                    commissioned.clear("dut");
                }
            });
        }),
        {
            pics: "OPCREDS.C.C0a.Tx",
            expected: "Verify that TH receives RemoveFabric Command for the FabricID saved from FabricDescriptor",
        },
    )
    .finalize(cx => {
        commissioningFrom = csrResponse = addNoc = fabric = undefined;
        return runCleanups(() => commissioned.decommissionAll(cx));
    });

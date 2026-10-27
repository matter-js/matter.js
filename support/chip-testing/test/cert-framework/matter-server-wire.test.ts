/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, UnexpectedDataError } from "@matter/general";
import { expect } from "chai";
import {
    decodeAttributeResult,
    decodeCommandResponse,
    clusterKeyOf,
    decodeInteractionReport,
    encodeAttributeValue,
    encodeCommandPayload,
    MatterServerWireError,
    type WireValueResult,
} from "../../src/matter-server/matter-server-wire.js";

// Wire samples were generated with matterjs-server commit 1c40d7a3 (packages/ws-controller/src/server/Converters.ts):
// read samples by `convertMatterToWebSocketTagBased` + `toBigIntAwareJson` from the matter.js value each expectation
// names, invoke and write samples checked by feeding them to `convertCommandDataToMatter` and
// `convertWebSocketTagBasedToMatter`. Each expectation is what `InProcessControllerAdapter.readAttribute` returns for
// the same device TLV.
//
// Command response samples were generated with the same commit by `convertMatterToWebSocketNameBased` +
// `toBigIntAwareJson`, as `#convertCommandDataToWebSocket` calls them, from the matter.js value each expectation names.
// That converter writes a field under its wire name and, where the two differ, under its property name as well.

/** Each result of a decoded attribute map, keyed by its path in the wire format. */
function resultsOf(wire: Record<string, unknown>): Map<string, WireValueResult> {
    return new Map(
        decodeAttributeResult(wire).map(({ endpoint, cluster, attribute, result }) => [
            `${endpoint}/${cluster}/${attribute}`,
            result,
        ]),
    );
}

function decodeOne(path: string, wire: unknown) {
    const decoded = resultsOf({ [path]: wire });
    expect([...decoded.keys()]).deep.equals([path]);
    const entry = decoded.get(path);
    if (entry?.kind !== "value") {
        expect.fail(`${path} failed to decode: ${entry?.error.message}`);
    }
    return entry.value;
}

function show(wire: unknown) {
    return JSON.stringify(wire, (_key, value: unknown) => (typeof value === "bigint" ? `${value}n` : value));
}

function errorOf(path: string, wire: unknown) {
    const entry = resultsOf({ [path]: wire }).get(path);
    if (entry?.kind !== "error") {
        expect.fail(`${path} decoded to ${String(entry?.value)} instead of failing`);
    }
    expect(entry.error).instanceOf(MatterServerWireError);
    return entry.error.message;
}

describe("matter-server wire codec", () => {
    describe("decodeAttributeResult", () => {
        it("decodes a struct by field tag", () => {
            // BasicInformation.ProductAppearance
            expect(decodeOne("0/40/20", { "0": 2, "1": 5 })).deep.equals({ finish: 2, primaryColor: 5 });
        });

        it("decodes a list of structs", () => {
            // Descriptor.DeviceTypeList
            expect(
                decodeOne("1/29/0", [
                    { "0": 256, "1": 3 },
                    { "0": 22, "1": 1 },
                ]),
            ).deep.equals([
                { deviceType: 256, revision: 3 },
                { deviceType: 22, revision: 1 },
            ]);
        });

        it("decodes a cluster's featureMap into its named feature flags", () => {
            // OnOff.FeatureMap
            expect(decodeOne("1/6/65532", 1)).deep.equals({
                lighting: true,
                deadFrontBehavior: false,
                offOnly: false,
            });
        });

        it("decodes a nullable null", () => {
            // LevelControl.CurrentLevel
            expect(decodeOne("1/8/0", null)).equals(null);
        });

        it("decodes a value outside the model's constraints rather than refusing it", () => {
            // LevelControl.CurrentLevel is constrained to minLevel..maxLevel (at most 254)
            expect(decodeOne("1/8/0", 255)).equals(255);
        });

        it("decodes an octet string from base64", () => {
            // OperationalCredentials.TrustedRootCertificates
            expect(decodeOne("0/62/4", ["AQL/"])).deep.equals([Bytes.fromHex("0102ff")]);
        });

        it("decodes the fields of a struct by their own type", () => {
            // OperationalCredentials.NOCs
            expect(decodeOne("0/62/0", [{ "1": "AQL/", "2": null, "254": 1 }])).deep.equals([
                { noc: Bytes.fromHex("0102ff"), icac: null, fabricIndex: 1 },
            ]);
        });

        it("decodes an int64 above the safe range as bigint", () => {
            // ThreadNetworkDiagnostics.ExtendedPanId
            expect(decodeOne("0/53/4", 1234605616436508552n)).equals(1234605616436508552n);
        });

        it("decodes a 64-bit value as the TLV decoder would: bigint beyond 32 bits, number within", () => {
            expect(decodeOne("0/53/4", 5000000000)).equals(5000000000n);
            expect(decodeOne("0/53/4", 7)).equals(7);
        });

        it("decodes a subject id as bigint even when the wire carries a small number", () => {
            // AccessControl.Acl
            expect(decodeOne("0/31/0", [{ "1": 5, "2": 2, "3": [112233], "4": null, "254": 1 }])).deep.equals([
                { privilege: 5, authMode: 2, subjects: [112233n], targets: null, fabricIndex: 1 },
            ]);
        });

        it("decodes another fabric's entry of a non-fabric-filtered read, which carries only its fabric index", () => {
            expect(
                decodeOne("0/31/0", [{ "1": 5, "2": 2, "3": [112233], "4": null, "254": 1 }, { "254": 2 }]),
            ).deep.equals([
                { privilege: 5, authMode: 2, subjects: [112233n], targets: null, fabricIndex: 1 },
                { fabricIndex: 2 },
            ]);
        });

        it("decodes epoch-us from Matter epoch to Unix epoch", () => {
            // TimeSynchronization.UtcTime
            expect(decodeOne("0/56/0", 760000000000000)).equals(1706684800000000n);
        });

        it("decodes epoch-s from Matter epoch to Unix epoch", () => {
            // SmokeCoAlarm.ExpiryDate
            expect(decodeOne("1/92/12", 700000000)).equals(1646684800);
        });

        it("decodes the global attributes of a cluster the model does not know", () => {
            expect(decodeOne("1/64512/65533", 3)).equals(3);
            expect(decodeOne("1/64512/65531", [0, 65532])).deep.equals([0, 65532]);

            // The server sends the FeatureMap object unpacked, as it holds no cluster to pack it by
            expect(decodeOne("1/64512/65532", {})).deep.equals({});
        });

        it("decodes every path of a multi-path result, with its path as numbers", () => {
            expect(decodeAttributeResult({ "1/8/0": null, "0/40/20": { "0": 2, "1": 5 } })).deep.equals([
                { endpoint: 1, cluster: 8, attribute: 0, result: { kind: "value", value: null } },
                {
                    endpoint: 0,
                    cluster: 40,
                    attribute: 20,
                    result: { kind: "value", value: { finish: 2, primaryColor: 5 } },
                },
            ]);
        });

        it("reports a path it cannot decode without failing the others", () => {
            const decoded = resultsOf({ "0/40/20": "not a struct", "1/8/0": 7 });
            expect(decoded.get("0/40/20")?.kind).equals("error");
            expect(decoded.get("1/8/0")).deep.equals({ kind: "value", value: 7 });
        });

        it("refuses a result whose path is not endpoint/cluster/attribute", () => {
            expect(() => decodeAttributeResult({ "1/8": 3 })).throws(UnexpectedDataError, /1\/8/);
        });

        it("decodes a tag-keyed structure of a cluster the model does not know as in-process", () => {
            // CHIP's FaultInjection cluster, which neither model defines
            expect(decodeOne("1/4294048774/0", 3)).equals(3);
            expect(
                decodeOne("1/4294048774/37", { "1": 5, "2": true, "3": { "0": 7n }, "4": [{ "0": null }] }),
            ).deep.equals({ "1": 5, "2": true, "3": { "0": 7n }, "4": [{ "0": null }] });
        });

        it("decodes a UnitTesting attribute the server models by its declared model", () => {
            expect(decodeOne("1/4294048773/25", "AQI=")).deep.equals(Bytes.fromHex("0102"));
            expect(decodeOne("1/4294048773/42", ["AQI="])).deep.equals([Bytes.fromHex("0102")]);
            expect(decodeOne("1/4294048773/23", 1.5)).equals(1.5);
        });

        it("decodes a string in an unmodeled value, at any depth, as the text the server sent", () => {
            for (const wire of ["AQI=", { "1": "a" }, [{ "0": { "2": "b" } }]]) {
                expect(decodeOne("1/4294048774/37", wire), show(wire)).deep.equals(wire);
            }
        });

        it("decodes an attribute the model does not know as in-process", () => {
            expect(decodeOne("1/6/61440", [{ "0": 1n }, null])).deep.equals([{ "0": 1n }, null]);
        });

        it("decodes an attribute whose model has no type as an unmodeled one", () => {
            // EventList carries no type in the model
            expect(decodeOne("1/64512/65530", [1, 2])).deep.equals([1, 2]);
        });

        it("refuses an unmodeled structure whose field is no tag number, at any depth", () => {
            expect(errorOf("1/64512/0", { name: 1 })).matches(/"name", which is no tag number/);
            expect(errorOf("1/64512/0", { "1": { name: 1 } })).matches(/"name", which is no tag number/);
            expect(errorOf("1/64512/0", [{ "0": 1 }, { name: 1 }])).matches(/"name", which is no tag number/);
        });

        it("lets an error that is not about the value escape instead of reporting it for the path", () => {
            // Throws on the first read only, so a report of the value would still render it
            let reads = 0;
            const wire = {
                get "0"(): number {
                    if (reads++ === 0) {
                        throw new TypeError("not a data error");
                    }
                    return 2;
                },
            };
            expect(() => decodeAttributeResult({ "0/40/20": wire })).throws(TypeError, "not a data error");
        });

        it("leaves out a struct field whose tag the model does not know, as a TLV decode does", () => {
            expect(decodeOne("0/40/20", { "0": 2, "1": 5, "9": 1 })).deep.equals({ finish: 2, primaryColor: 5 });
        });

        it("refuses a modeled struct field keyed by anything but a tag number", () => {
            expect(errorOf("0/40/20", { "0": 2, "1": 5, finish: 2 })).matches(/0\/40\/20/);
        });

        it("refuses a value of the wrong shape, naming the shape rather than an encoder failure", () => {
            const cases: [path: string, wire: unknown][] = [
                ["0/40/20", "not a struct"],
                ["1/29/0", { "0": 256 }],
                ["1/6/65532", "1"],
                ["1/6/65532", -1],
                ["0/62/4", [42]],
                ["0/62/4", ["not base64!"]],
                ["0/56/0", -1],
                ["0/56/0", 1.5],
                ["1/92/12", -1],
                ["1/8/0", 1.5],
                ["1/8/0", -1],
                ["1/92/12", 1.5],
                ["0/53/4", 2n ** 70n],
                ["1/513/0", 2n ** 63n],
                ["0/40/20", { "0": -1, "1": 5 }],
                ["0/56/0", "760000000000000"],
                ["1/92/12", "700000000"],
                ["0/40/5", 42],
                ["0/40/20", { "0": null, "1": 5 }],
            ];
            for (const [path, wire] of cases) {
                const entry = resultsOf({ [path]: wire }).get(path);
                if (entry?.kind !== "error") {
                    expect.fail(`${path} ${show(wire)} decoded instead of failing`);
                }
                expect(entry.error.message, path).matches(new RegExp(path.replaceAll("/", "\\/")));
                expect(entry.error.cause, `${path} ${show(wire)}`).instanceOf(MatterServerWireError);
            }
        });
    });

    describe("encodeCommandPayload", () => {
        it("encodes a struct field with octet string and epoch-us members by name", () => {
            // The server's `convertCommandDataToMatter` turns this back into the matter.js request it was built from
            expect(
                encodeCommandPayload(0x3f, "KeySetWrite", {
                    groupKeySet: {
                        groupKeySetId: 1,
                        groupKeySecurityPolicy: 0,
                        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                        epochStartTime0: 946684802220000n,
                        epochKey1: null,
                        epochStartTime1: null,
                        epochKey2: null,
                        epochStartTime2: null,
                    },
                }),
            ).deep.equals({
                groupKeySet: {
                    groupKeySetId: 1,
                    groupKeySecurityPolicy: 0,
                    epochKey0: "0NHS09TV1tfY2drb3N3e3w==",
                    epochStartTime0: 2220000n,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                },
            });
        });

        it("encodes epoch-s from Unix epoch to Matter epoch", () => {
            expect(
                encodeCommandPayload(0x101, "SetYearDaySchedule", {
                    yearDayIndex: 1,
                    userIndex: 1,
                    localStartTime: 1646684800,
                    localEndTime: 1646688400,
                }),
            ).deep.equals({ yearDayIndex: 1, userIndex: 1, localStartTime: 700000000, localEndTime: 700003600 });
        });

        it("passes a bitmap object through, which the server hands to matter.js unchanged", () => {
            expect(
                encodeCommandPayload(6, "OnWithTimedOff", {
                    onOffControl: { acceptOnlyWhenOn: true },
                    onTime: 10,
                    offWaitTime: 20,
                }),
            ).deep.equals({ onOffControl: { acceptOnlyWhenOn: true }, onTime: 10, offWaitTime: 20 });
        });

        it("keeps a field the command does not define, which matter.js ignores as an in-process invoke does", () => {
            expect(
                encodeCommandPayload(6, "OffWithEffect", { effectIdentifier: 0, effectVariant: 0, extra: 1 }),
            ).deep.equals({ effectIdentifier: 0, effectVariant: 0, extra: 1 });
        });

        it("refuses a command the cluster does not have", () => {
            expect(() => encodeCommandPayload(6, "NoSuchCommand", {})).throws(ImplementationError, /NoSuchCommand/);
        });

        it("refuses a cluster the model does not know", () => {
            expect(() => encodeCommandPayload(0xfc00, "Anything", {})).throws(ImplementationError, /64512/);
        });
    });

    describe("encodeAttributeValue", () => {
        it("encodes a list of structs by field tag", () => {
            // The server's `convertWebSocketTagBasedToMatter` resolves a write's struct fields by tag
            expect(
                encodeAttributeValue(0x1f, 0, [
                    { privilege: 5, authMode: 2, subjects: [112233n], targets: null, fabricIndex: 1 },
                ]),
            ).deep.equals([{ "1": 5, "2": 2, "3": [112233n], "4": null, "254": 1 }]);
        });

        it("encodes an octet string as base64", () => {
            expect(encodeAttributeValue(0x3e, 4, [Bytes.fromHex("0102ff")])).deep.equals(["AQL/"]);
        });

        it("encodes epoch-us from Unix epoch to Matter epoch", () => {
            expect(encodeAttributeValue(0x38, 0, 1706684800000000n)).equals(760000000000000n);
        });

        it("passes a bitmap object and a plain value through", () => {
            expect(encodeAttributeValue(8, 0xf, { executeIfOff: true, coupleColorTempToLevel: false })).deep.equals({
                executeIfOff: true,
                coupleColorTempToLevel: false,
            });
            expect(encodeAttributeValue(0x28, 5, "kitchen")).equals("kitchen");
            expect(encodeAttributeValue(8, 0x11, null)).equals(null);
        });

        it("refuses an attribute the model does not know", () => {
            expect(() => encodeAttributeValue(6, 0xf000, 1)).throws(ImplementationError, /61440/);
        });
    });
    describe("decodeCommandResponse", () => {
        it("decodes a nested struct and drops the wire-name duplicate of a field", () => {
            // GroupKeyManagement.KeySetReadResponse
            const wire = {
                groupKeySet: {
                    groupKeySetID: 1,
                    groupKeySetId: 1,
                    groupKeySecurityPolicy: 0,
                    epochKey0: null,
                    epochStartTime0: 844315200000000,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                },
            };
            expect(decodeCommandResponse(0x3f, "KeySetRead", wire)).deep.equals({
                groupKeySet: {
                    groupKeySetId: 1,
                    groupKeySecurityPolicy: 0,
                    epochKey0: null,
                    epochStartTime0: 1791000000000000n,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                },
            });
        });

        it("decodes octet strings and drops an overridden wire name's duplicate", () => {
            // OperationalCredentials.CSRResponse
            expect(
                decodeCommandResponse(0x3e, "CsrRequest", {
                    NOCSRElements: "FTAB",
                    nocsrElements: "FTAB",
                    attestationSignature: "qrs=",
                }),
            ).deep.equals({ nocsrElements: Bytes.fromHex("153001"), attestationSignature: Bytes.fromHex("aabb") });
        });

        it("decodes a bitmap into its named flags", () => {
            // DoorLock.GetWeekDayScheduleResponse
            expect(
                decodeCommandResponse(0x101, "GetWeekDaySchedule", {
                    weekDayIndex: 1,
                    userIndex: 2,
                    status: 0,
                    daysMask: 5,
                    startHour: 8,
                    startMinute: 30,
                    endHour: 17,
                    endMinute: 0,
                }),
            ).deep.equals({
                weekDayIndex: 1,
                userIndex: 2,
                status: 0,
                daysMask: {
                    sunday: true,
                    monday: false,
                    tuesday: true,
                    wednesday: false,
                    thursday: false,
                    friday: false,
                    saturday: false,
                },
                startHour: 8,
                startMinute: 30,
                endHour: 17,
                endMinute: 0,
            });
        });

        it("decodes a plain response", () => {
            // GeneralCommissioning.ArmFailSafeResponse
            expect(decodeCommandResponse(0x30, "ArmFailSafe", { errorCode: 0, debugText: "" })).deep.equals({
                errorCode: 0,
                debugText: "",
            });
        });

        it("answers undefined for null, which the server sends for a status-only answer", () => {
            expect(decodeCommandResponse(6, "Toggle", null)).equals(undefined);
            expect(decodeCommandResponse(0x30, "ArmFailSafe", null)).equals(undefined);
        });

        it("refuses data for a command that has no response", () => {
            expect(() => decodeCommandResponse(6, "Toggle", {})).throws(MatterServerWireError, /Toggle/);
        });

        it("refuses a response missing a mandatory field, which the server sends as {} for a command it does not know", () => {
            expect(() => decodeCommandResponse(0x30, "ArmFailSafe", {})).throws(MatterServerWireError, /errorCode/);
        });

        it("refuses a field shaped against its model", () => {
            expect(() => decodeCommandResponse(0x30, "ArmFailSafe", { errorCode: "zero", debugText: "" })).throws(
                MatterServerWireError,
                /ArmFailSafe/,
            );
        });

        it("refuses a command the cluster does not have", () => {
            expect(() => decodeCommandResponse(6, "NoSuchCommand", null)).throws(ImplementationError, /NoSuchCommand/);
        });
    });

    // Event samples have the `node_event` shape `convertEventToWebSocket` builds on matterjs-server branch
    // feat/cert-dut-controller, its data by `convertMatterToWebSocketNameBased` as for a command response.
    describe("decodeInteractionReport", () => {
        function event(
            endpoint: number,
            cluster: number,
            eventId: number,
            eventNumber: number | bigint,
            data: unknown,
        ) {
            return {
                node_id: 5,
                endpoint_id: endpoint,
                cluster_id: cluster,
                event_id: eventId,
                event_number: eventNumber,
                priority: 1,
                timestamp: 1704067200000,
                timestamp_type: 1,
                data,
            };
        }

        it("decodes attributes, events and the statuses of both", () => {
            const report = decodeInteractionReport({
                attributes: { "1/6/0": true },
                events: [event(1, 0x3b, 1, 121, { newPosition: 1 })],
                attribute_status: { "1/6/9999": { status: 0x86 }, "1/1234/0": { status: 0xc3 } },
                event_status: { "1/69/5": { status: 0xc7, cluster_status: 2 } },
            });

            expect(report.attributes).deep.equals([
                { endpoint: 1, cluster: 6, attribute: 0, result: { kind: "value", value: true } },
            ]);
            expect(report.events).deep.equals([
                {
                    endpoint: 1,
                    cluster: 0x3b,
                    event: 1,
                    eventNumber: 121n,
                    result: { kind: "value", value: { newPosition: 1 } },
                },
            ]);
            expect([...report.attributeStatus]).deep.equals([
                ["1/6/9999", { status: 0x86 }],
                ["1/1234/0", { status: 0xc3 }],
            ]);
            expect([...report.eventStatus]).deep.equals([["1/69/5", { status: 0xc7, clusterStatus: 2 }]]);
        });

        it("reads absent status maps as no statuses", () => {
            const report = decodeInteractionReport({ attributes: {}, events: [] });

            expect(report.attributeStatus.size).equals(0);
            expect(report.eventStatus.size).equals(0);
            expect(report.dataVersions.size).equals(0);
        });

        it("decodes the data version of each cluster, keyed by endpoint and cluster", () => {
            const report = decodeInteractionReport({
                attributes: { "1/6/0": true, "0/40/5": "kitchen" },
                events: [],
                data_versions: { "1/6": 0, "0/40": 0xffffffff },
            });

            expect([...report.dataVersions]).deep.equals([
                [clusterKeyOf(1, 6), 0],
                [clusterKeyOf(0, 40), 0xffffffff],
            ]);
        });

        it("decodes event data by name through the event's own model", () => {
            const [{ result }] = decodeInteractionReport({
                attributes: {},
                events: [
                    event(0, 0x2a, 0, 2n ** 60n, {
                        previousState: 1,
                        newState: 4,
                        reason: 1,
                        targetSoftwareVersion: null,
                    }),
                ],
            }).events;

            expect(result).deep.equals({
                kind: "value",
                value: { previousState: 1, newState: 4, reason: 1, targetSoftwareVersion: null },
            });
        });

        it("answers undefined for an event without data, as an in-process read does", () => {
            for (const data of [null, {}]) {
                const [{ result }] = decodeInteractionReport({
                    attributes: {},
                    events: [event(0, 0x28, 1, 7, data)],
                }).events;

                expect(result, show(data)).deep.equals({ kind: "value", value: undefined });
            }
        });

        it("decodes the tag-keyed data of an event outside the model as in-process", () => {
            const { events } = decodeInteractionReport({
                attributes: {},
                events: [event(1, 0xfff1fc05, 1, 3, { "1": 5, "2": [{ "0": 6 }] }), event(1, 0xfff1fc05, 2, 4, null)],
            });

            expect(events.map(({ result }) => result)).deep.equals([
                { kind: "value", value: { "1": 5, "2": [{ "0": 6 }] } },
                { kind: "value", value: undefined },
            ]);
        });

        it("reports event data outside the model that is not tag-keyed without failing the others", () => {
            const { events } = decodeInteractionReport({
                attributes: {},
                events: [event(1, 0xfff1fc05, 1, 3, { arg1: 1 }), event(0, 0x28, 0, 4, { softwareVersion: 2 })],
            });

            expect(events[0].result.kind).equals("error");
            expect(events[1].result).deep.equals({ kind: "value", value: { softwareVersion: 2 } });
        });

        it("reports event data that does not fit its model", () => {
            const [{ result }] = decodeInteractionReport({
                attributes: {},
                events: [event(0, 0x28, 0, 4, { softwareVersion: "two" })],
            }).events;

            if (result.kind !== "error") {
                expect.fail("expected a decode error");
            }
            expect(result.error).instanceOf(MatterServerWireError);
            expect(result.error.message).contains("0/40/0");
        });

        it("refuses a report that does not have the documented shape", () => {
            for (const wire of [
                null,
                { attributes: {} },
                { events: [] },
                { attributes: {}, events: [{ endpoint_id: 1, cluster_id: 6, event_id: 0 }] },
                { attributes: {}, events: [], attribute_status: [] },
                { attributes: {}, events: [], event_status: { "1/2/3": { status: "busy" } } },
                { attributes: {}, events: [], event_status: { "1/2/3": { status: 1, cluster_status: "x" } } },
                { attributes: {}, events: [], data_versions: null },
                { attributes: {}, events: [], data_versions: [] },
                { attributes: {}, events: [], data_versions: { "1/6/0": 1 } },
                { attributes: {}, events: [], data_versions: { "1": 1 } },
                { attributes: {}, events: [], data_versions: { "*/6": 1 } },
                { attributes: {}, events: [], data_versions: { "01/6": 1 } },
                { attributes: {}, events: [], data_versions: { " 1/6": 1 } },
                { attributes: {}, events: [], data_versions: { "1/6": "1" } },
                { attributes: {}, events: [], data_versions: { "1/6": -1 } },
                { attributes: {}, events: [], data_versions: { "1/6": 1.5 } },
                { attributes: {}, events: [], data_versions: { "1/6": 2 ** 32 } },
                { attributes: {}, events: [], data_versions: { "1/6": null } },
            ]) {
                expect(() => decodeInteractionReport(wire), show(wire)).throws(UnexpectedDataError);
            }
        });
    });
});

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Bytes } from "@matter/general";
import { AccessLevel, AttributeElement, AttributeModel } from "@matter/model";
import { AttributeWriteResponse, CommandInvokeResponse, Fabric, Invoke, InvokeResult, Write } from "@matter/protocol";
import { AttributeId, FabricIndex, NodeId, Status, TlvOfModel } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { AtomicWriteHandler } from "../../../src/behaviors/thermostat/AtomicWriteHandler.js";
import { MockServerNode } from "../../node/mock-server-node.js";
import { newPreset } from "./preset-helpers.js";

const PresetsServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets");
const PresetsThermostat = ThermostatDevice.with(PresetsServer);

/** Overrides Presets in its schema without restating the atomic quality, so the attribute inherits it. */
class InheritedPresetsServer extends PresetsServer {
    static override readonly schema = PresetsServer.schema.extend({
        children: [AttributeElement({ id: Thermostat.attributes.presets.id, name: "Presets", conformance: "PRES" })],
    });
}

/** No peer write stages Schedules yet, so these tests stage it through the handler directly */
const PresetsAndSchedulesServer = ThermostatServer.with(
    "Heating",
    "Cooling",
    "AutoMode",
    "Presets",
    "MatterScheduleConfiguration",
);
const PresetsAndSchedulesThermostat = ThermostatDevice.with(PresetsAndSchedulesServer);

const PRESETS_ATTRIBUTE = Thermostat.attributes.presets.id;
const SCHEDULES_ATTRIBUTE = Thermostat.attributes.schedules.id;
const NON_ATOMIC_ATTRIBUTE = Thermostat.attributes.occupiedHeatingSetpoint.id;
// Non-atomic and write-protected at Manage level, so an Operate-only peer is denied write access to it
const NON_ATOMIC_MANAGE_ATTRIBUTE = Thermostat.attributes.systemMode.id;

const atomicResponseModel = Thermostat.commands.atomicRequest.schema.responseModel;
if (atomicResponseModel === undefined) {
    throw new Error("Thermostat atomicRequest command has no response model");
}
const atomicResponseSchema = TlvOfModel(atomicResponseModel);

function beginWrite(endpoint: Endpoint, attributeRequests: number[]) {
    return Invoke(
        Invoke.ConcreteCommandRequest({
            endpoint,
            cluster: Thermostat,
            command: "atomicRequest",
            fields: {
                requestType: Thermostat.RequestType.BeginWrite,
                attributeRequests,
                timeout: 5000,
            },
        }),
    );
}

function commitWrite(endpoint: Endpoint, attributeRequests: number[]) {
    return Invoke(
        Invoke.ConcreteCommandRequest({
            endpoint,
            cluster: Thermostat,
            command: "atomicRequest",
            fields: { requestType: Thermostat.RequestType.CommitWrite, attributeRequests },
        }),
    );
}

/** Stages a value the way a peer's write inside the atomic write does */
async function stageAs(node: MockServerNode, fabric: Fabric, endpoint: Endpoint, attribute: number, value: unknown) {
    const exchange = await node.createExchange({ fabric, peerNodeId: NodeId(1) });
    await node.online({ exchange, accessLevel: AccessLevel.Manage }, ({ context }) => {
        node.env
            .get(AtomicWriteHandler)
            .writeAttribute(context, endpoint, PresetsAndSchedulesServer, AttributeId(attribute), value);
    });
}

function schedule(transitionTime: number): Thermostat.Schedule {
    return {
        scheduleHandle: null,
        systemMode: Thermostat.SystemMode.Heat,
        transitions: [{ dayOfWeek: { monday: true }, transitionTime, heatingSetpoint: 2000 }],
        builtIn: null,
    };
}

async function invokeAs(
    node: MockServerNode,
    fabric: Fabric,
    request: ReturnType<typeof Invoke>,
    peerNodeId = NodeId(1),
) {
    const exchange = await node.createExchange({ fabric, peerNodeId });
    return node.online({ command: true, exchange, accessLevel: AccessLevel.Manage }, async ({ context }) => {
        const response = new CommandInvokeResponse(node.protocol, context);
        const chunks = new Array<InvokeResult.Data>();
        for await (const chunk of response.process(request)) {
            chunks.push(...chunk);
        }
        return chunks;
    });
}

function decodeAtomicResponse(chunks: InvokeResult.Data[]) {
    const response = chunks.find(chunk => chunk.kind === "cmd-response");
    if (response?.kind !== "cmd-response") {
        throw new Error("No AtomicResponse in command result");
    }
    return atomicResponseSchema.decodeTlv(response.data);
}

async function writePresetsAs(node: MockServerNode, fabric: Fabric, peerNodeId: NodeId) {
    const exchange = await node.createExchange({ fabric, peerNodeId });
    const request = {
        suppressResponse: false,
        ...Write(
            Write.Attribute({
                endpoint: node.endpoints.for(1),
                cluster: Thermostat,
                attributes: "presets",
                value: [],
            }),
        ),
    } as Write;
    return node.online({ exchange, accessLevel: AccessLevel.Manage }, async ({ context }) => {
        const response = new AttributeWriteResponse(node.protocol, context);
        return response.process(request);
    });
}

const thermostatConfig = {
    controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
    systemMode: Thermostat.SystemMode.Auto,
    occupiedHeatingSetpoint: 2000,
    occupiedCoolingSetpoint: 2600,
    minSetpointDeadBand: 25,
    numberOfPresets: 5,
    presetTypes: [
        {
            presetScenario: Thermostat.PresetScenario.Occupied,
            numberOfPresets: 5,
            presetTypeFeatures: {},
        },
    ],
    activePresetHandle: null,
    presets: [],
};

async function createNode(
    privilege = AccessControl.AccessControlEntryPrivilege.Administer,
    type: typeof PresetsThermostat = PresetsThermostat,
) {
    return createNodeFor(new Endpoint(type, { number: 1, thermostat: thermostatConfig }), privilege);
}

/** A thermostat whose Presets and Schedules can be staged in one atomic write; its one preset is built in */
function createPresetsAndSchedulesNode() {
    return createNodeFor(
        new Endpoint(PresetsAndSchedulesThermostat, {
            number: 1,
            thermostat: {
                ...thermostatConfig,
                presetTypes: [
                    ...thermostatConfig.presetTypes,
                    {
                        presetScenario: Thermostat.PresetScenario.Unoccupied,
                        numberOfPresets: 1,
                        presetTypeFeatures: {},
                    },
                ],
                presets: [newPreset({ presetHandle: Bytes.fromHex("01"), builtIn: true })],
                scheduleTypes: [
                    {
                        systemMode: Thermostat.SystemMode.Heat,
                        numberOfSchedules: 2,
                        scheduleTypeFeatures: { supportsSetpoints: true },
                    },
                ],
                numberOfSchedules: 2,
                numberOfScheduleTransitions: 2,
                numberOfScheduleTransitionPerDay: null,
                activeScheduleHandle: null,
                schedules: [],
            },
        }),
    );
}

async function createNodeFor(device: Endpoint, privilege = AccessControl.AccessControlEntryPrivilege.Administer) {
    const node = await MockServerNode.createOnline(undefined, { device });
    const fabric = await node.addFabric();
    await node.set({
        accessControl: {
            acl: [
                {
                    authMode: AccessControl.AccessControlEntryAuthMode.Case,
                    fabricIndex: FabricIndex(fabric.fabricIndex),
                    privilege,
                    subjects: [NodeId(1), NodeId(2)],
                    targets: null,
                },
            ],
        },
    });
    return { node, fabric, device };
}

describe("AtomicWriteHandler", () => {
    it("rejects a second BeginWrite on the same cluster/endpoint with INVALID_IN_STATE (§7.15.6.4.1)", async () => {
        const { node, fabric, device } = await createNode();

        const first = await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE]));
        expect(first.some(c => c.kind === "cmd-response")).true;

        const second = await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE]));
        expect(second).deep.equals([
            {
                kind: "cmd-status",
                path: { clusterId: Thermostat.id, commandId: Thermostat.commands.atomicRequest.id, endpointId: 1 },
                status: Status.InvalidInState,
                clusterStatus: undefined,
                commandRef: undefined,
            },
        ]);

        await node.close();
    });

    it("discards an abandoned atomic write when the timeout expires (§7.15.6.4.1 step 3.5.3)", async () => {
        const { node, fabric, device } = await createNode();

        const first = await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE]));
        expect(first.some(c => c.kind === "cmd-response")).true;

        await MockTime.advance(5001);

        // The state was discarded on timeout, so a fresh BeginWrite succeeds instead of failing with INVALID_IN_STATE
        const second = await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE]));
        expect(second.some(c => c.kind === "cmd-response")).true;

        await node.close();
    });

    it("accepts an attribute whose atomic quality is inherited from the element it overrides", async () => {
        const presets = InheritedPresetsServer.schema.get(AttributeModel, "Presets");
        expect(presets?.quality.atomic).undefined;

        const { node, fabric, device } = await createNode(undefined, ThermostatDevice.with(InheritedPresetsServer));

        const chunks = await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE]));

        expect(decodeAtomicResponse(chunks)).deep.include({
            statusCode: Status.Success,
            attributeStatus: [{ attributeId: PRESETS_ATTRIBUTE, statusCode: Status.Success }],
        });

        await node.close();
    });

    it("returns INVALID_COMMAND for a non-atomic attribute in BeginWrite (§7.15.6.4.1 step 3.1.2)", async () => {
        const { node, fabric, device } = await createNode();

        const chunks = await invokeAs(node, fabric, beginWrite(device, [NON_ATOMIC_ATTRIBUTE]));

        expect(decodeAtomicResponse(chunks)).deep.equals({
            statusCode: Status.Failure,
            attributeStatus: [{ attributeId: NON_ATOMIC_ATTRIBUTE, statusCode: Status.InvalidCommand }],
        });

        await node.close();
    });

    it("returns UNSUPPORTED_ACCESS ahead of INVALID_COMMAND for an inaccessible non-atomic attribute (§7.15.6.4.1 step 3.1.1)", async () => {
        const { node, fabric, device } = await createNode(AccessControl.AccessControlEntryPrivilege.Operate);

        const chunks = await invokeAs(node, fabric, beginWrite(device, [NON_ATOMIC_MANAGE_ATTRIBUTE]));

        expect(decodeAtomicResponse(chunks)).deep.equals({
            statusCode: Status.Failure,
            attributeStatus: [{ attributeId: NON_ATOMIC_MANAGE_ATTRIBUTE, statusCode: Status.UnsupportedAccess }],
        });

        await node.close();
    });

    // §7.15.3 mandates INVALID_IN_STATE, but CHIP and TC_TSTAT_4_2 step 15 expect BUSY when another peer holds the
    // atomic write; we match CHIP for certification (see the spec-enhancement tracking the §7.15.3 rewording)
    it("rejects a write to an attribute held by a different peer with BUSY", async () => {
        const { node, fabric, device } = await createNode();

        const first = await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE]), NodeId(1));
        expect(first.some(c => c.kind === "cmd-response")).true;

        const write = await writePresetsAs(node, fabric, NodeId(2));
        expect(write).deep.equals([
            {
                kind: "attr-status",
                path: { attributeId: PRESETS_ATTRIBUTE, clusterId: Thermostat.id, endpointId: 1, listIndex: undefined },
                status: Status.Busy,
                clusterStatus: undefined,
            },
        ]);

        await node.close();
    });

    describe("CommitWrite of more than one attribute (§7.15.6.4.2)", () => {
        it("applies every pending write when all of them succeed", async () => {
            const { node, fabric, device } = await createPresetsAndSchedulesNode();
            const attributes = [PRESETS_ATTRIBUTE, SCHEDULES_ATTRIBUTE];

            await invokeAs(node, fabric, beginWrite(device, attributes));
            await stageAs(node, fabric, device, PRESETS_ATTRIBUTE, [
                ...device.stateOf(PresetsAndSchedulesServer).presets,
                newPreset({ presetScenario: Thermostat.PresetScenario.Unoccupied }),
            ]);
            await stageAs(node, fabric, device, SCHEDULES_ATTRIBUTE, [schedule(360)]);

            expect(decodeAtomicResponse(await invokeAs(node, fabric, commitWrite(device, attributes)))).deep.equals({
                statusCode: Status.Success,
                attributeStatus: [
                    { attributeId: PRESETS_ATTRIBUTE, statusCode: Status.Success },
                    { attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.Success },
                ],
            });

            const state = device.stateOf(PresetsAndSchedulesServer);
            expect(state.persistedPresets?.length).equals(2);
            const added = state.persistedPresets?.[1];
            expect(added?.presetHandle?.byteLength).equals(16);
            expect(added?.builtIn).equals(false);
            expect(state.schedules.map(({ transitions }) => transitions[0].transitionTime)).deep.equals([360]);

            await node.close();
        });

        it("reports an attribute the peer did not write as SUCCESS, in the CommitWrite request's order", async () => {
            const { node, fabric, device } = await createPresetsAndSchedulesNode();
            const attributes = [SCHEDULES_ATTRIBUTE, PRESETS_ATTRIBUTE];

            await invokeAs(node, fabric, beginWrite(device, [PRESETS_ATTRIBUTE, SCHEDULES_ATTRIBUTE]));
            await stageAs(node, fabric, device, SCHEDULES_ATTRIBUTE, [schedule(360)]);

            expect(decodeAtomicResponse(await invokeAs(node, fabric, commitWrite(device, attributes)))).deep.equals({
                statusCode: Status.Success,
                attributeStatus: [
                    { attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.Success },
                    { attributeId: PRESETS_ATTRIBUTE, statusCode: Status.Success },
                ],
            });

            const state = device.stateOf(PresetsAndSchedulesServer);
            expect(state.persistedPresets?.length).equals(1);
            expect(state.schedules.length).equals(1);

            await node.close();
        });

        it("validates an attribute once the other pending attributes are staged", async () => {
            const { node, fabric, device } = await createPresetsAndSchedulesNode();
            const attributes = [PRESETS_ATTRIBUTE, SCHEDULES_ATTRIBUTE];

            const schedulesSeen = new Array<number>();
            device.eventsOf(PresetsAndSchedulesServer).presets$AtomicChanged.on((_value, _oldValue, context) => {
                schedulesSeen.push(device.agentFor(context).get(PresetsAndSchedulesServer).state.schedules.length);
            });

            await invokeAs(node, fabric, beginWrite(device, attributes));
            await stageAs(node, fabric, device, PRESETS_ATTRIBUTE, [
                ...device.stateOf(PresetsAndSchedulesServer).presets,
                newPreset({ presetScenario: Thermostat.PresetScenario.Unoccupied }),
            ]);
            await stageAs(node, fabric, device, SCHEDULES_ATTRIBUTE, [schedule(360)]);
            await invokeAs(node, fabric, commitWrite(device, attributes));

            expect(schedulesSeen).deep.equals([1]);

            await node.close();
        });

        it("discards a valid Schedules write when the Presets write fails", async () => {
            const { node, fabric, device } = await createPresetsAndSchedulesNode();
            const attributes = [PRESETS_ATTRIBUTE, SCHEDULES_ATTRIBUTE];

            await invokeAs(node, fabric, beginWrite(device, attributes));

            // Removing the built-in preset is refused on CommitWrite, not when staged
            await stageAs(node, fabric, device, PRESETS_ATTRIBUTE, []);
            await stageAs(node, fabric, device, SCHEDULES_ATTRIBUTE, [schedule(360)]);

            expect(decodeAtomicResponse(await invokeAs(node, fabric, commitWrite(device, attributes)))).deep.equals({
                statusCode: Status.Failure,
                attributeStatus: [
                    { attributeId: PRESETS_ATTRIBUTE, statusCode: Status.ConstraintError },
                    { attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.Success },
                ],
            });

            const state = device.stateOf(PresetsAndSchedulesServer);
            expect(state.persistedPresets?.length).equals(1);
            expect(state.schedules).deep.equals([]);

            await node.close();
        });

        it("discards a valid Presets write when the Schedules write fails", async () => {
            const { node, fabric, device } = await createPresetsAndSchedulesNode();
            const attributes = [PRESETS_ATTRIBUTE, SCHEDULES_ATTRIBUTE];

            await invokeAs(node, fabric, beginWrite(device, attributes));
            await stageAs(node, fabric, device, PRESETS_ATTRIBUTE, [
                ...device.stateOf(PresetsAndSchedulesServer).presets,
                newPreset({ presetScenario: Thermostat.PresetScenario.Unoccupied }),
            ]);

            // TransitionTime is limited to 1439, the last minute of the day
            await stageAs(node, fabric, device, SCHEDULES_ATTRIBUTE, [schedule(1440)]);

            expect(decodeAtomicResponse(await invokeAs(node, fabric, commitWrite(device, attributes)))).deep.equals({
                statusCode: Status.Failure,
                attributeStatus: [
                    { attributeId: PRESETS_ATTRIBUTE, statusCode: Status.Success },
                    { attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.ConstraintError },
                ],
            });

            const state = device.stateOf(PresetsAndSchedulesServer);
            expect(state.persistedPresets?.length).equals(1);
            expect(state.schedules).deep.equals([]);

            await node.close();
        });
    });
});

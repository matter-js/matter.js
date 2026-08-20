/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { AccessLevel } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import { AttributeWriteResponse, CommandInvokeResponse, Fabric, Invoke, InvokeResult, Write } from "@matter/protocol";
import { FabricIndex, NodeId, Status, TlvOfModel } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Thermostat } from "@matter/types/clusters/thermostat";

const PresetsThermostat = ThermostatDevice.with(ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets"));

const PRESETS_ATTRIBUTE = Thermostat.attributes.presets.id;
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

async function createNode(privilege = AccessControl.AccessControlEntryPrivilege.Administer) {
    const device = new Endpoint(PresetsThermostat, {
        number: 1,
        thermostat: {
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
        },
    });
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
});

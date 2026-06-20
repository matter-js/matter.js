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
import { CommandInvokeResponse, Fabric, Invoke, InvokeResult } from "@matter/protocol";
import { FabricIndex, NodeId, Status } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Thermostat } from "@matter/types/clusters/thermostat";

const PresetsThermostat = ThermostatDevice.with(ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets"));

const PRESETS_ATTRIBUTE = Thermostat.attributes.presets.id;

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

async function invokeAs(node: MockServerNode, fabric: Fabric, request: ReturnType<typeof Invoke>) {
    const exchange = await node.createExchange({ fabric, peerNodeId: NodeId(1) });
    return node.online({ command: true, exchange, accessLevel: AccessLevel.Manage }, async ({ context }) => {
        const response = new CommandInvokeResponse(node.protocol, context);
        const chunks = new Array<InvokeResult.Data>();
        for await (const chunk of response.process(request)) {
            chunks.push(...chunk);
        }
        return chunks;
    });
}

describe("AtomicWriteHandler", () => {
    it("rejects a second BeginWrite on the same cluster/endpoint with INVALID_IN_STATE (§7.15.6.4.1)", async () => {
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
                        privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                        subjects: [NodeId(1)],
                        targets: null,
                    },
                ],
            },
        });

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
});

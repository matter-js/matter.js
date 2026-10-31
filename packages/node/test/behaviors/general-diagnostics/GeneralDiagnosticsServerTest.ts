/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { MockServerNode } from "@matter/node/testing";
import { GeneralDiagnostics } from "@matter/types/clusters/general-diagnostics";

const FaultServer = GeneralDiagnosticsServer.enable({
    events: { hardwareFaultChange: true, radioFaultChange: true, networkFaultChange: true },
});

const FaultRoot = MockServerNode.RootEndpoint.with(FaultServer);

describe("GeneralDiagnosticsServer", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    describe("faults", () => {
        async function createFaultDevice() {
            const node = await MockServerNode.createOnline(FaultRoot, {
                generalDiagnostics: { activeHardwareFaults: [], activeRadioFaults: [], activeNetworkFaults: [] },
            });
            const emitted = new Array<{ event: string; current: number[]; previous: number[] }>();
            const record =
                (event: string) =>
                ({ current, previous }: { current: number[]; previous: number[] }) => {
                    emitted.push({ event, current, previous });
                };
            const events = node.eventsOf(FaultServer);
            events.hardwareFaultChange.on(record("hardware"));
            events.radioFaultChange.on(record("radio"));
            events.networkFaultChange.on(record("network"));
            return { node, emitted };
        }

        const { HardwareFault, RadioFault, NetworkFault } = GeneralDiagnostics;

        // § 11.12.8.1: "The HardwareFaultChange Event SHALL indicate a change in the set of hardware faults currently
        // detected by the Node."
        it("registers and clears hardware faults with one event per change", async () => {
            const { node, emitted } = await createFaultDevice();
            await using _node = node;

            await node.act(agent => agent.get(FaultServer).registerHardwareFault(HardwareFault.Radio));
            await node.act(agent => agent.get(FaultServer).registerHardwareFault(HardwareFault.Sensor));
            await node.act(agent => agent.get(FaultServer).clearHardwareFault(HardwareFault.Radio));

            expect(node.stateOf(FaultServer).activeHardwareFaults).deep.equals([HardwareFault.Sensor]);
            expect(emitted).deep.equals([
                { event: "hardware", current: [HardwareFault.Radio], previous: [] },
                {
                    event: "hardware",
                    current: [HardwareFault.Radio, HardwareFault.Sensor],
                    previous: [HardwareFault.Radio],
                },
                {
                    event: "hardware",
                    current: [HardwareFault.Sensor],
                    previous: [HardwareFault.Radio, HardwareFault.Sensor],
                },
            ]);
        });

        it("registers and clears radio faults with one event per change", async () => {
            const { node, emitted } = await createFaultDevice();
            await using _node = node;

            await node.act(agent => agent.get(FaultServer).registerRadioFault(RadioFault.WiFiFault));
            await node.act(agent => agent.get(FaultServer).clearRadioFault(RadioFault.WiFiFault));

            expect(node.stateOf(FaultServer).activeRadioFaults).deep.equals([]);
            expect(emitted).deep.equals([
                { event: "radio", current: [RadioFault.WiFiFault], previous: [] },
                { event: "radio", current: [], previous: [RadioFault.WiFiFault] },
            ]);
        });

        it("registers and clears network faults with one event per change", async () => {
            const { node, emitted } = await createFaultDevice();
            await using _node = node;

            await node.act(agent => agent.get(FaultServer).registerNetworkFault(NetworkFault.NetworkJammed));
            await node.act(agent => agent.get(FaultServer).clearNetworkFault(NetworkFault.NetworkJammed));

            expect(node.stateOf(FaultServer).activeNetworkFaults).deep.equals([]);
            expect(emitted).deep.equals([
                { event: "network", current: [NetworkFault.NetworkJammed], previous: [] },
                { event: "network", current: [], previous: [NetworkFault.NetworkJammed] },
            ]);
        });

        // § 11.12.6.6: "This list SHALL NOT contain more than one instance of a specific HardwareFaultEnum value."
        it("emits nothing when an active fault is registered again", async () => {
            const { node, emitted } = await createFaultDevice();
            await using _node = node;

            await node.act(agent => {
                const server = agent.get(FaultServer);
                server.registerHardwareFault(HardwareFault.Radio);
                server.registerHardwareFault(HardwareFault.Sensor);
                server.registerRadioFault(RadioFault.WiFiFault);
                server.registerRadioFault(RadioFault.ThreadFault);
                server.registerNetworkFault(NetworkFault.NetworkJammed);
                server.registerNetworkFault(NetworkFault.ConnectionFailed);
            });
            emitted.length = 0;

            await node.act(agent => agent.get(FaultServer).registerHardwareFault(HardwareFault.Radio));
            await node.act(agent => agent.get(FaultServer).registerRadioFault(RadioFault.WiFiFault));
            await node.act(agent => agent.get(FaultServer).registerNetworkFault(NetworkFault.NetworkJammed));

            const state = node.stateOf(FaultServer);
            expect(state.activeHardwareFaults).deep.equals([HardwareFault.Radio, HardwareFault.Sensor]);
            expect(state.activeRadioFaults).deep.equals([RadioFault.WiFiFault, RadioFault.ThreadFault]);
            expect(state.activeNetworkFaults).deep.equals([NetworkFault.NetworkJammed, NetworkFault.ConnectionFailed]);
            expect(emitted).deep.equals([]);
        });

        it("emits nothing when an absent fault is cleared", async () => {
            const { node, emitted } = await createFaultDevice();
            await using _node = node;

            await node.act(agent => {
                const server = agent.get(FaultServer);
                server.clearHardwareFault(HardwareFault.Radio);
                server.clearRadioFault(RadioFault.WiFiFault);
                server.clearNetworkFault(NetworkFault.NetworkJammed);
            });

            expect(emitted).deep.equals([]);
        });
    });
});

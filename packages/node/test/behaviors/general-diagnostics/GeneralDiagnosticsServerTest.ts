/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { TimeSynchronizationServer } from "#behaviors/time-synchronization";
import { Bytes, Time, Timestamp } from "@matter/general";
import { AccessLevel } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import { CommandInvokeResponse, Invoke, InvokeResult } from "@matter/protocol";
import { TlvField, TlvNullable, TlvObject, TlvUInt64 } from "@matter/types";
import { GeneralDiagnostics } from "@matter/types/clusters/general-diagnostics";

const ENABLE_KEY = Bytes.fromHex("0102030405060708090a0b0c0d0e0f10");
const SUPPORTED_TRIGGER = 0x1234n;

const TlvTimeSnapshotResponse = TlvObject({
    systemTimeMs: TlvField(0, TlvUInt64),
    posixTimeMs: TlvField(1, TlvNullable(TlvUInt64)),
});

const triggered = new Array<number | bigint>();

class TriggerServer extends GeneralDiagnosticsServer {
    protected override triggerTestEvent(eventTrigger: number | bigint) {
        if (BigInt(eventTrigger) !== SUPPORTED_TRIGGER) {
            super.triggerTestEvent(eventTrigger);
        }
        triggered.push(eventTrigger);
    }
}

const TriggerRoot = MockServerNode.RootEndpoint.with(TriggerServer);

const FaultServer = GeneralDiagnosticsServer.enable({
    events: { hardwareFaultChange: true, radioFaultChange: true, networkFaultChange: true },
});

const FaultRoot = MockServerNode.RootEndpoint.with(FaultServer);

async function createDevice(
    generalDiagnostics: Partial<GeneralDiagnosticsServer.State> = { deviceTestEnableKey: ENABLE_KEY },
) {
    return await MockServerNode.createOnline(TriggerRoot, { generalDiagnostics });
}

type Device = MockServerNode<MockServerNode.RootEndpoint>;

/**
 * Invokes one command through the interaction layer with Manage privilege.  Client-side validation is skipped so
 * fields out of their constraints reach the device.
 */
async function invoke(node: Device, command: Invoke.CommandRequest) {
    const fabric = await node.addFabric();
    const exchange = await node.createExchange({ fabric });
    const request = { ...Invoke({ skipValidation: true, commands: [command] }), suppressResponse: false };
    const chunks = await MockTime.resolve(
        node.online({ command: true, exchange, accessLevel: AccessLevel.Manage }, async ({ context }) => {
            const response = new CommandInvokeResponse(node.protocol, context);
            const chunks = new Array<InvokeResult.Data>();
            for await (const chunk of response.process(request)) {
                chunks.push(...chunk);
            }
            return chunks;
        }),
    );
    expect(chunks.length).equals(1);
    return chunks[0];
}

async function timeSnapshot(node: Device) {
    const result = await invoke(
        node,
        Invoke.ConcreteCommandRequest({ endpoint: node, cluster: GeneralDiagnostics, command: "timeSnapshot" }),
    );
    if (result.kind !== "cmd-response") {
        expect.fail(`expected a TimeSnapshotResponse, got status ${result.status}`);
    }
    return TlvTimeSnapshotResponse.decodeTlv(result.data);
}

describe("GeneralDiagnosticsServer", () => {
    beforeEach(() => {
        MockTime.reset();
        triggered.length = 0;
    });

    describe("TimeSnapshot", () => {
        // § 11.12.7.3.2: "This value SHALL only be null when any the following are true: The node doesn't support
        // the Time Synchronization cluster. The node's Time Synchronization cluster instance's UTCTime attribute is
        // null."
        it("answers a null PosixTimeMs without Time Synchronization", async () => {
            await using node = await createDevice();
            expect((await timeSnapshot(node)).posixTimeMs).equals(null);
        });

        it("answers a null PosixTimeMs when UTCTime is null", async () => {
            await using node = await MockServerNode.createOnline(TriggerRoot.with(TimeSynchronizationServer));
            expect((await timeSnapshot(node)).posixTimeMs).equals(null);
        });

        it("answers a PosixTimeMs when UTCTime is set", async () => {
            await using node = await MockServerNode.createOnline(TriggerRoot.with(TimeSynchronizationServer), {
                timeSynchronization: { utcTime: Time.nowMs * 1000 },
            });
            expect((await timeSnapshot(node)).posixTimeMs).equals(Time.nowMs);
        });

        // § 11.12.6.3: UpTime "SHALL be based on the same System Time source as those used to fulfill any usage of
        // the systime-us and systime-ms data types within the server"
        it("reports SystemTimeMs on the same base as UpTime when the host has been up far longer", async () => {
            const startup = Time.startup.systemMs;
            Time.startup.systemMs = Timestamp(Time.nowMs - 10 * 24 * 60 * 60_000);
            try {
                await using node = await createDevice();
                await MockTime.advance(90_000);

                const { systemTimeMs } = await timeSnapshot(node);
                const upTimeMs = Number(node.stateOf(TriggerServer).upTime) * 1000;
                expect(Math.abs(Number(systemTimeMs) - upTimeMs)).lessThan(1000);
            } finally {
                Time.startup.systemMs = startup;
            }
        });
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

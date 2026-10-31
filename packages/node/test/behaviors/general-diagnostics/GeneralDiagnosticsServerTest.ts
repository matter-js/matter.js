/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { TimeSynchronizationServer } from "#behaviors/time-synchronization";
import { Bytes, ImplementationError, Time, Timestamp } from "@matter/general";
import { AccessLevel } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import { CommandInvokeResponse, Invoke, InvokeResult } from "@matter/protocol";
import { Status, TlvByteString, TlvField, TlvNullable, TlvObject, TlvUInt64 } from "@matter/types";
import { GeneralDiagnostics } from "@matter/types/clusters/general-diagnostics";

const ENABLE_KEY = Bytes.fromHex("0102030405060708090a0b0c0d0e0f10");
const ZERO_KEY = new Uint8Array(16);
const OTHER_KEY = Bytes.fromHex("1102030405060708090a0b0c0d0e0f10");
const SUPPORTED_TRIGGER = 0x1234n;

const TlvPayloadTestResponse = TlvObject({ payload: TlvField(0, TlvByteString) });
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

async function testEventTrigger(node: Device, enableKey: Bytes, eventTrigger = SUPPORTED_TRIGGER) {
    const result = await invoke(
        node,
        Invoke.ConcreteCommandRequest({
            endpoint: node,
            cluster: GeneralDiagnostics,
            command: "testEventTrigger",
            fields: { enableKey, eventTrigger },
        }),
    );
    if (result.kind !== "cmd-status") {
        expect.fail("expected a status for TestEventTrigger");
    }
    return result.status;
}

async function payloadTestRequest(node: Device, enableKey: Bytes, count = 10, value = 0xab) {
    const result = await invoke(
        node,
        Invoke.ConcreteCommandRequest({
            endpoint: node,
            cluster: GeneralDiagnostics,
            command: "payloadTestRequest",
            fields: { enableKey, value, count },
        }),
    );
    if (result.kind === "cmd-status") {
        return { status: result.status, payload: undefined };
    }
    return { status: Status.Success, payload: TlvPayloadTestResponse.decodeTlv(result.data).payload };
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

/**
 * All errors below `error`, following `cause` and the `errors` of aggregate errors.
 */
function* errorTree(error: unknown): Generator<Error> {
    if (!(error instanceof Error)) {
        return;
    }
    yield error;
    yield* errorTree(error.cause);
    if (error instanceof AggregateError) {
        for (const inner of error.errors) {
            yield* errorTree(inner);
        }
    }
}

/**
 * The messages of all errors that made the node fail to start, or undefined if it started.
 */
async function startupErrors(generalDiagnostics: Partial<GeneralDiagnosticsServer.State>) {
    try {
        await using _node = await MockServerNode.createOnline(TriggerRoot, { generalDiagnostics });
    } catch (error) {
        return [...errorTree(error)]
            .filter(error => error instanceof ImplementationError)
            .map(({ message }) => message)
            .join("\n");
    }
}

async function setEnableKey(node: Device, deviceTestEnableKey: Bytes) {
    await node.act(agent => {
        agent.get(TriggerServer).state.deviceTestEnableKey = deviceTestEnableKey;
    });
}

describe("GeneralDiagnosticsServer", () => {
    beforeEach(() => {
        MockTime.reset();
        triggered.length = 0;
    });

    describe("TestEventTrigger", () => {
        // § 11.12.7.1.1: "if the EnableKey field is received with all zeroes, this command SHALL FAIL with a response
        // status of CONSTRAINT_ERROR"
        it("rejects an all-zero key", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, ZERO_KEY)).equals(Status.ConstraintError);
            expect(triggered).deep.equals([]);
        });

        it("rejects an all-zero key after the configured key was cleared", async () => {
            await using node = await createDevice();
            await setEnableKey(node, ZERO_KEY);
            expect(await testEventTrigger(node, ZERO_KEY)).equals(Status.ConstraintError);
            expect(triggered).deep.equals([]);
        });

        it("rejects an all-zero key on a device without a key", async () => {
            await using node = await createDevice({});
            expect(await testEventTrigger(node, ZERO_KEY)).equals(Status.ConstraintError);
        });

        // § 11.12.7.1.1: "this command SHALL respond with a response status of CONSTRAINT_ERROR if the EnableKey field
        // does not match the a-priori value configured on the device"
        it("rejects a mismatched key", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, OTHER_KEY)).equals(Status.ConstraintError);
            expect(triggered).deep.equals([]);
        });

        it("rejects any key on a device without a key", async () => {
            await using node = await createDevice({});
            expect(await testEventTrigger(node, ENABLE_KEY)).equals(Status.ConstraintError);
        });

        it("rejects a key shorter than 16 bytes on the wire", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, Bytes.of(ENABLE_KEY).slice(0, 8))).equals(Status.ConstraintError);
        });

        it("rejects a key longer than 16 bytes on the wire", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, Bytes.concat(ENABLE_KEY, new Uint8Array([1])))).equals(
                Status.ConstraintError,
            );
        });

        // § 11.12.7.1.2: "If the value of EventTrigger received is not supported by the receiving Node, this command
        // SHALL fail with a status code of INVALID_COMMAND."
        it("answers INVALID_COMMAND to an unsupported trigger with a matching key", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, ENABLE_KEY, 0x5678n)).equals(Status.InvalidCommand);
        });

        it("answers INVALID_COMMAND to any trigger on the default implementation", async () => {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                generalDiagnostics: { deviceTestEnableKey: ENABLE_KEY },
            });
            expect(await testEventTrigger(node, ENABLE_KEY)).equals(Status.InvalidCommand);
        });

        // § 11.12.7.1.2: "if the EnableKey value matches the configured internal value for a particular Node, and the
        // EventTrigger value matches a supported test event trigger value, the command SHALL succeed and execute the
        // expected trigger action"
        it("executes a supported trigger with a matching key", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, ENABLE_KEY)).equals(Status.Success);
            expect(triggered).deep.equals([SUPPORTED_TRIGGER]);
        });
    });

    // § 11.12.6.9: "When this attribute is true, the Node has been configured with one or more test event triggers by
    // virtue of the internally programmed EnableKey value ... being set to a non-zero value."
    describe("TestEventTriggersEnabled", () => {
        it("is false without a key", async () => {
            await using node = await createDevice({});
            expect(node.stateOf(TriggerServer).testEventTriggersEnabled).equals(false);
        });

        it("is true when only a non-zero key is configured", async () => {
            await using node = await createDevice();
            expect(node.stateOf(TriggerServer).testEventTriggersEnabled).equals(true);
        });

        it("is true when a non-zero key is configured and the attribute is set false", async () => {
            await using node = await createDevice({ deviceTestEnableKey: ENABLE_KEY, testEventTriggersEnabled: false });
            expect(node.stateOf(TriggerServer).testEventTriggersEnabled).equals(true);
        });

        it("refuses to start when set true without a key", async () => {
            expect(await startupErrors({ testEventTriggersEnabled: true })).match(/no deviceTestEnableKey is set/);
        });

        // § 11.12.7.4: "This command SHALL respond with a response status of CONSTRAINT_ERROR if either: ... The
        // TestEventTriggersEnabled field is currently false."
        it("keeps both test commands disabled when the key is set after initialization", async () => {
            await using node = await createDevice({});
            await setEnableKey(node, ENABLE_KEY);

            expect(node.stateOf(TriggerServer).testEventTriggersEnabled).equals(false);
            expect(await testEventTrigger(node, ENABLE_KEY)).equals(Status.ConstraintError);
            expect((await payloadTestRequest(node, ENABLE_KEY)).status).equals(Status.ConstraintError);
            expect(triggered).deep.equals([]);
        });

        // § 11.12.7.4: "This command SHALL use the same EnableKey behavior as the TestEventTrigger command"
        it("lets both test commands accept a matching key when only the key is configured", async () => {
            await using node = await createDevice();
            expect(await testEventTrigger(node, ENABLE_KEY)).equals(Status.Success);
            expect((await payloadTestRequest(node, ENABLE_KEY)).status).equals(Status.Success);
        });
    });

    describe("PayloadTestRequest", () => {
        // § 11.12.7.4: "This command SHALL respond with a response status of CONSTRAINT_ERROR if either: The EnableKey
        // field does not match the a-priori value configured on the device. The TestEventTriggersEnabled field is
        // currently false."
        it("rejects any key when test event triggers are disabled", async () => {
            await using node = await createDevice({});
            expect((await payloadTestRequest(node, ENABLE_KEY)).status).equals(Status.ConstraintError);
            expect((await payloadTestRequest(node, ZERO_KEY)).status).equals(Status.ConstraintError);
        });

        it("rejects a mismatched key", async () => {
            await using node = await createDevice();
            expect((await payloadTestRequest(node, OTHER_KEY)).status).equals(Status.ConstraintError);
        });

        it("rejects an all-zero key", async () => {
            await using node = await createDevice();
            expect((await payloadTestRequest(node, ZERO_KEY)).status).equals(Status.ConstraintError);
        });

        // § 11.12.7.4: Count has the constraint "max 2048"
        it("rejects a count above 2048", async () => {
            await using node = await createDevice();
            expect((await payloadTestRequest(node, ENABLE_KEY, 2049)).status).equals(Status.ConstraintError);
        });

        // § 11.12.7.4: "the server SHALL respond with a PayloadTestResponse command with a Payload field value
        // containing Count instances of the Value byte"
        it("answers with Count instances of the Value byte", async () => {
            await using node = await createDevice();
            const { status, payload } = await payloadTestRequest(node, ENABLE_KEY, 10, 0xab);
            expect(status).equals(Status.Success);
            expect(payload).deep.equals(new Uint8Array(10).fill(0xab));
        });

        it("answers with an empty payload for a count of zero", async () => {
            await using node = await createDevice();
            const { status, payload } = await payloadTestRequest(node, ENABLE_KEY, 0);
            expect(status).equals(Status.Success);
            expect(payload).deep.equals(new Uint8Array(0));
        });

        // § 11.12.7.4: "If the response is too large to send, the server SHALL fail the command and respond with a
        // response status of RESOURCE_EXHAUSTED."
        it("answers RESOURCE_EXHAUSTED when the response does not fit the exchange", async () => {
            await using node = await createDevice();
            expect((await payloadTestRequest(node, ENABLE_KEY, 2048)).status).equals(Status.ResourceExhausted);
        });
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

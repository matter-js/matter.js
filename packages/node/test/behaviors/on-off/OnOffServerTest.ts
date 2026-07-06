/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { MaybePromise } from "@matter/general";
import { ClusterId, CommandId, EndpointNumber, Status, TlvInvokeResponseData, TypeFromSchema } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";

const HOLD = 0xffff;
const LightingOnOff = OnOffServer.with("Lighting");

describe("OnOffServer", () => {
    it("accepts extensions of off-only commands", () => {
        // This is a type-only test
        class MyOnOffServer extends OnOffServer {
            override on() {}
        }

        const x = {} as MyOnOffServer;

        x satisfies { on(): MaybePromise };
    });

    it("properly supports async observers", async () => {
        const server = await MockServerNode.createOnline();
        const part = server.parts.get(1);

        const observedValues = Array<boolean>();

        part!.eventsOf(OnOffServer).onOff$Changed.on(async value => {
            observedValues.push(value);
        });

        for (let i = 0; i < 2; i++) {
            await part!.act(async agent => {
                const onOff = agent.get(OnOffServer);
                await onOff.toggle();
            });
        }

        await server.close();

        await MockTime.yield3();

        expect(observedValues).deep.equals([true, false]);
    });

    describe("OnWithTimedOff", () => {
        before(MockTime.enable);

        it("holds OnTime indefinitely when set to 0xFFFF", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            // OffWaitTime is non-zero so a naive timer-start gate would still arm the timer
            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: HOLD, offWaitTime: 10 }),
            );

            expect(endpoint.state.onOff.onOff).equals(true);
            expect(endpoint.state.onOff.onTime).equals(HOLD);
            // OnTime is held (not 0), so the timed-off OffWaitTime must be retained, not cleared
            expect(endpoint.state.onOff.offWaitTime).equals(10);

            for (let i = 0; i < 3; i++) {
                await MockTime.advance(100);
            }

            // OnTime must not be decremented and the device must stay on
            expect(endpoint.state.onOff.onTime).equals(HOLD);
            expect(endpoint.state.onOff.onOff).equals(true);

            await node.close();
        });

        it("holds OffWaitTime indefinitely when set to 0xFFFF", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            // Enter TIMED_ON with OffWaitTime held, then turn off
            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 5, offWaitTime: HOLD }),
            );
            await endpoint.act(agent => agent.get(LightingOnOff).off());

            expect(endpoint.state.onOff.onOff).equals(false);
            expect(endpoint.state.onOff.offWaitTime).equals(HOLD);

            for (let i = 0; i < 3; i++) {
                await MockTime.advance(100);
            }

            // OffWaitTime must not be decremented and the device must stay off
            expect(endpoint.state.onOff.offWaitTime).equals(HOLD);
            expect(endpoint.state.onOff.onOff).equals(false);

            await node.close();
        });

        it("runs the delayed-off countdown after a held device is turned off", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            // Hold on indefinitely with a finite OffWaitTime guard
            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: HOLD, offWaitTime: 50 }),
            );
            expect(endpoint.state.onOff.onOff).equals(true);
            expect(endpoint.state.onOff.offWaitTime).equals(50);

            const expired = new Promise<void>(resolve =>
                endpoint.events.onOff.offWaitTime$Changed.on(value => {
                    if (value === 0) {
                        resolve();
                    }
                }),
            );

            // Explicit off must enter the delayed-off guard period and count OffWaitTime down
            await endpoint.act(agent => agent.get(LightingOnOff).off());
            expect(endpoint.state.onOff.onOff).equals(false);

            await MockTime.resolve(expired, { stepMs: 10 });
            expect(endpoint.state.onOff.offWaitTime).equals(0);
            expect(endpoint.state.onOff.onOff).equals(false);

            await node.close();
        });

        it("stops a running timed-on timer when raised to 0xFFFF (no leaked wakeup)", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            // Start a finite timed-on countdown so the periodic timer is running
            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 5, offWaitTime: 10 }),
            );
            expect(MockTime.timerCountFor("Timed on")).equals(1);

            // Raising OnTime to the hold value must stop the timer rather than leave it spinning
            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: HOLD, offWaitTime: 10 }),
            );

            expect(endpoint.state.onOff.onTime).equals(HOLD);
            expect(endpoint.state.onOff.onOff).equals(true);
            expect(MockTime.timerCountFor("Timed on")).equals(0);

            await node.close();
        });

        it("stops the timed-on timer if OnTime is written to 0xFFFF while it runs", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 5, offWaitTime: 10 }),
            );
            expect(MockTime.timerCountFor("Timed on")).equals(1);

            // OnTime is a writable attribute; raising it to the hold value must not leave the timer spinning
            await endpoint.act(agent => {
                agent.get(LightingOnOff).state.onTime = HOLD;
            });
            await MockTime.advance(100);
            await MockTime.yield3();

            expect(MockTime.timerCountFor("Timed on")).equals(0);
            expect(endpoint.state.onOff.onTime).equals(HOLD);
            expect(endpoint.state.onOff.onOff).equals(true);

            await node.close();
        });

        it("stops the delayed-off timer if OffWaitTime is written to 0xFFFF while it runs", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 5, offWaitTime: 20 }),
            );
            await endpoint.act(agent => agent.get(LightingOnOff).off());
            expect(MockTime.timerCountFor("Delayed off")).equals(1);

            await endpoint.act(agent => {
                agent.get(LightingOnOff).state.offWaitTime = HOLD;
            });
            await MockTime.advance(100);
            await MockTime.yield3();

            expect(MockTime.timerCountFor("Delayed off")).equals(0);
            expect(endpoint.state.onOff.offWaitTime).equals(HOLD);
            expect(endpoint.state.onOff.onOff).equals(false);

            await node.close();
        });

        it("decrements OnTime to auto-off when not 0xFFFF", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            const offAgain = new Promise<void>(resolve =>
                endpoint.events.onOff.onOff$Changed.on(value => {
                    if (!value) {
                        resolve();
                    }
                }),
            );

            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 3, offWaitTime: 0 }),
            );

            expect(endpoint.state.onOff.onOff).equals(true);

            await MockTime.resolve(offAgain, { stepMs: 10 });

            expect(endpoint.state.onOff.onTime).equals(0);
            expect(endpoint.state.onOff.onOff).equals(false);

            await node.close();
        });

        it("stays off and only lowers OffWaitTime when OffWaitTime>0 and off", async () => {
            MockTime.reset();
            // Device is off with OffWaitTime>0 but no delayed-off timer running (e.g. written directly)
            const { node, endpoint } = await setupLight({ onOff: false, offWaitTime: 100 });

            const expired = new Promise<void>(resolve =>
                endpoint.events.onOff.offWaitTime$Changed.on(value => {
                    if (value === 0) {
                        resolve();
                    }
                }),
            );

            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 5, offWaitTime: 50 }),
            );

            // Spec: keep OFF, set OffWaitTime to the minimum of current and requested
            expect(endpoint.state.onOff.onOff).equals(false);
            expect(endpoint.state.onOff.offWaitTime).equals(50);

            // The delayed-off countdown must run and the device must stay off throughout
            await MockTime.resolve(expired, { stepMs: 10 });
            expect(endpoint.state.onOff.onOff).equals(false);

            await node.close();
        });

        it("does not start a countdown when OffWaitTime is written while plain off", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight({ onOff: false });

            // Spec §1.5.6.5: writing OffWaitTime only has effect in the Delayed Off state; a write from a plain
            // off state must not initiate a countdown
            await endpoint.act(agent => {
                agent.get(LightingOnOff).state.offWaitTime = 30;
            });
            expect(MockTime.timerCountFor("Delayed off")).equals(0);

            for (let i = 0; i < 3; i++) {
                await MockTime.advance(100);
            }
            expect(endpoint.state.onOff.offWaitTime).equals(30);
            expect(endpoint.state.onOff.onOff).equals(false);

            await node.close();
        });

        it("stays on and stops the timer when OnTime is written to 0 during a countdown", async () => {
            MockTime.reset();
            const { node, endpoint } = await setupLight();

            await endpoint.act(agent =>
                agent.get(LightingOnOff).onWithTimedOff({ onOffControl: {}, onTime: 5, offWaitTime: 0 }),
            );
            expect(MockTime.timerCountFor("Timed on")).equals(1);

            // Writing OnTime to 0 ends the timed-on phase but leaves the device on (CHIP UpdateTimer-on-write)
            await endpoint.act(agent => {
                agent.get(LightingOnOff).state.onTime = 0;
            });
            expect(MockTime.timerCountFor("Timed on")).equals(0);

            for (let i = 0; i < 3; i++) {
                await MockTime.advance(100);
            }
            expect(endpoint.state.onOff.onOff).equals(true);
            expect(endpoint.state.onOff.onTime).equals(0);

            await node.close();
        });
    });

    describe("OffOnly", () => {
        it("rejects On and Toggle with UNSUPPORTED_COMMAND while Off succeeds", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OffOnlyDevice });
            const fabric = await node.addFabric();

            expect(await invokeStatus(node, fabric, OnOff.commands.on.id)).equals(Status.UnsupportedCommand);
            expect(await invokeStatus(node, fabric, OnOff.commands.toggle.id)).equals(Status.UnsupportedCommand);
            expect(await invokeStatus(node, fabric, OnOff.commands.off.id)).equals(Status.Success);

            await node.close();
        });
    });
});

const OffOnlyDevice = MutableEndpoint({
    name: "OffOnlyOnOff",
    deviceType: 0xfff1_fc20,
    deviceRevision: 1,
}).with(OnOffServer.with("OffOnly"));

async function setupLight(initial?: { onOff?: boolean; onTime?: number; offWaitTime?: number }) {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });
    const endpoint = await node.add(OnOffLightDevice, {
        onOff: { onOff: false, ...initial },
    });
    return { node, endpoint };
}

async function invokeStatus(
    node: MockServerNode,
    fabric: Awaited<ReturnType<MockServerNode["addFabric"]>>,
    commandId: number,
) {
    let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
    await interaction.invoke(
        node,
        fabric,
        {
            commandPath: {
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(OnOff.id),
                commandId: CommandId(commandId),
            },
        },
        response => {
            sent = response;
        },
    );
    return sent?.status?.status?.status;
}

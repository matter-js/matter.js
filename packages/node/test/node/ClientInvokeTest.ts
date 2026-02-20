/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { OnOffCluster } from "#clusters/on-off";
import { Minutes } from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { ClientInteraction, Invoke } from "#protocol";
import { EndpointNumber } from "#types";
import { MockSite } from "./mock-site.js";

describe("ClientInvoke", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.forceMacrotasks = true;
    });

    it("executes commands via the batcher", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Get initial state
        const initialState = device.parts.get(1)!.stateOf(OnOffServer).onOff;

        // Execute a command via the batcher
        await MockTime.resolve(cmds.toggle());

        // State should be toggled
        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(!initialState);
    });

    it("requires MockTime.resolve for batched commands (non-root endpoints)", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Commands to non-root endpoints require batching
        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Start a command but don't resolve the timer yet
        const pendingPromise = cmds.toggle();

        // The command should be pending in the batcher
        let resolved = false;
        // oxlint-disable-next-line @typescript-eslint/no-floating-promises
        pendingPromise.then(() => (resolved = true));

        // Give microtasks a chance to run
        await Promise.resolve();
        expect(resolved).equals(false);

        // Now resolve with MockTime
        await MockTime.resolve(pendingPromise);
        expect(resolved).equals(true);
    });

    it("bypasses batching when maxPathsPerInvoke is 1", async () => {
        await using site = new MockSite();
        // Default device has maxPathsPerInvoke=1 (no batching)
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // With maxPathsPerInvoke=1, commands bypass batching but still need MockTime
        // for the underlying async operations
        await MockTime.resolve(cmds.toggle());
    });

    it("clears maxPathsPerInvoke cache when node goes offline", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // First command - should use batching (maxPathsPerInvoke=10)
        await MockTime.resolve(cmds.toggle());

        // Take the device offline
        await MockTime.resolve(device.cancel());

        // Bring it back online with different maxPathsPerInvoke
        await device.act(agent => {
            agent.basicInformation.state.maxPathsPerInvoke = 1;
        });
        await MockTime.resolve(device.start());

        // The peer should have reconnected and the cache should be cleared
        // Next command should see the new maxPathsPerInvoke=1
        await MockTime.resolve(cmds.toggle(undefined, { connectionTimeout: Minutes(5) }));
    });

    it("executes multiple commands sequentially", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Execute commands sequentially
        await MockTime.resolve(cmds.off());
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);

        await MockTime.resolve(cmds.on());
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(true);

        await MockTime.resolve(cmds.toggle());
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);
    });

    it("rejects pending commands when batcher is closed", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Queue some commands and immediately attach rejection handlers to avoid unhandled rejection
        const promise1 = cmds.toggle().catch(e => e);
        const promise2 = cmds.toggle().catch(e => e);

        // Close the ClientInteraction directly - this should reject pending commands
        await (peer1.interaction as ClientInteraction).close();

        // Both promises should have resolved to errors
        const error1 = await MockTime.resolve(promise1);
        const error2 = await MockTime.resolve(promise2);

        expect(error1).instanceOf(Error);
        expect(error2).instanceOf(Error);
    });

    it("bypasses batching for timed invoke requests", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const interaction = peer1.env.get(ClientInteraction);

        // Create a timed invoke request for a non-root endpoint command
        const request = Invoke({
            commands: [
                Invoke.ConcreteCommandRequest({
                    endpoint: EndpointNumber(1),
                    cluster: OnOffCluster,
                    command: "toggle",
                }),
            ],
            timed: true,
        });

        // Timed commands bypass batching and execute directly via #invokeSingle
        await MockTime.resolve(
            (async () => {
                for await (const _chunk of interaction.invoke(request)) {
                    // consume
                }
            })(),
        );

        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(true);
    });

    it("batches different commands together while splitting duplicates", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Initial state is false
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);

        // Fire: on, toggle, on in same tick
        // "on" and "toggle" have different paths — can batch together
        // second "on" duplicates the first — must go to a separate batch
        // Batch 1: [on, toggle] → state becomes true, then false
        // Batch 2: [on] → state becomes true
        const p1 = cmds.on();
        const p2 = cmds.toggle();
        const p3 = cmds.on();

        await MockTime.resolve(Promise.all([p1, p2, p3]));

        // Final state should be true (on → toggle off → on again)
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(true);
    });

    it("splits duplicate command paths into separate batches", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Get initial state
        const initialState = device.parts.get(1)!.stateOf(OnOffServer).onOff;

        // Fire two toggles in the same tick — same endpoint/cluster/command path
        // Without splitting, the server would reject with InvalidAction
        const p1 = cmds.toggle();
        const p2 = cmds.toggle();

        await MockTime.resolve(Promise.all([p1, p2]));

        // Two toggles: state should be back to initial (toggled twice)
        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(initialState);
    });
});

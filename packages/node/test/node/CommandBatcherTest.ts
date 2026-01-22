/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import { ServerNode } from "#node/ServerNode.js";
import { MockSite } from "./mock-site.js";

describe("CommandBatcher", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.macrotasks = true;
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
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
        await MockTime.resolve(cmds.toggle());
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

        // Close the invoker directly - this should reject pending commands
        await (peer1.interaction as ClientNodeInteraction).invoker.close();

        // Both promises should have resolved to errors
        const error1 = await MockTime.resolve(promise1);
        const error2 = await MockTime.resolve(promise2);

        expect(error1).instanceOf(Error);
        expect(error1.message).equals("CommandBatcher closed");
        expect(error2).instanceOf(Error);
        expect(error2.message).equals("CommandBatcher closed");
    });
});

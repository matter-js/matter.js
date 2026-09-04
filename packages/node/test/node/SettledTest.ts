/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { Environment } from "@matter/general";
import { settled } from "@matter/node/testing";

function nodeWithActivity(name: string) {
    const env = new Environment(name);
    const activity = new NodeActivity();
    env.set(NodeActivity, activity);
    return { env, activity };
}

describe("settled", () => {
    before(() => MockTime.init());

    it("waits past the turn in which a node goes idle with work still to start", async () => {
        const first = nodeWithActivity("first");
        const second = nodeWithActivity("second");

        let done = false;

        const actor = first.activity.begin("first-work");

        const work = (async () => {
            await MockTime.macrotask;

            // The gap the helper must not mistake for quiescence: nothing is active, but the second node's work is
            // scheduled for a later turn
            actor.close();
            await MockTime.macrotask;

            const next = second.activity.begin("second-work");
            await MockTime.macrotask;

            next.close();
            done = true;
        })();

        await settled(first, second);

        expect(done).true;

        await work;
    });

    it("returns once every node is idle", async () => {
        const first = nodeWithActivity("first");
        const second = nodeWithActivity("second");

        await settled(first, second);

        expect(first.activity.inactive.value).true;
        expect(second.activity.inactive.value).true;
    });
});

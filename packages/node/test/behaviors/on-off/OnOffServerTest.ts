/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";
import { MaybePromise } from "#general";
import { MockServerNode } from "../../node/mock-server-node.js";

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
});

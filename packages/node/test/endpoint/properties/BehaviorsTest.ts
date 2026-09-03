/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { OnOffServer } from "#behaviors/on-off";
import { WindowCoveringServer } from "#behaviors/window-covering";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { MockEndpoint } from "../mock-endpoint.js";

describe("Behaviors", () => {
    describe("has", () => {
        it("answers true for a behavior the endpoint supports", async () => {
            const light = await MockEndpoint.create(OnOffLightDevice);

            expect(light.behaviors.has(OnOffServer)).equals(true);
        });

        it("answers false for a behavior the endpoint does not support at all", async () => {
            const light = await MockEndpoint.create(OnOffLightDevice);

            // Not merely falsy: the declared return type is boolean, and an endpoint supporting no
            // behavior of this id at all is the path that used to answer undefined
            expect(light.behaviors.has(WindowCoveringServer)).equals(false);
        });

        it("answers false for a different behavior sharing the id of one it supports", async () => {
            const light = await MockEndpoint.create(OnOffLightDevice);
            const Unrelated = OnOffServer.set({}).with();

            expect(light.behaviors.has(class extends Unrelated {})).equals(false);
        });
    });

    it("transplants observers when a behavior is dropped and re-injected", async () => {
        const light = await MockEndpoint.create(OnOffLightDevice);

        const changes = new Array<boolean>();
        light.eventsOf(OnOffServer).onOff$Changed.on(value => {
            changes.push(value);
        });

        const installedType = light.behaviors.supported[OnOffServer.id];
        await light.behaviors.drop(OnOffServer.id);
        light.behaviors.inject(installedType);

        await light.set({ onOff: { onOff: true } });

        expect(changes).deep.equals([true]);

        await light.close();
    });

    it("sets context on transplanted events", async () => {
        const light = await MockEndpoint.create(OnOffLightDevice);

        light.eventsOf(OnOffServer).onOff$Changed.on(() => {});

        const installedType = light.behaviors.supported[OnOffServer.id];
        await light.behaviors.drop(OnOffServer.id);
        light.behaviors.inject(installedType);

        expect(light.eventsOf(OnOffServer).endpoint).equals(light);

        await light.close();
    });

    it("accepts different base class for cluster requirements", () => {
        class MyOnOffServer extends OnOffServer {}

        const light = new Endpoint(OnOffLightDevice.with(MyOnOffServer));

        light.behaviors.validateRequirements();
    });

    it("inject rejects behavior ID starting with uppercase", () => {
        class UpperBehavior extends Behavior {
            static override readonly id = "BadName";
        }

        const light = new Endpoint(OnOffLightDevice);

        expect(() => {
            light.behaviors.inject(UpperBehavior);
        }).throws('Behavior ID "BadName" must start with a lowercase letter');
    });

    it("inject accepts behavior ID starting with lowercase", () => {
        class GoodBehavior extends Behavior {
            static override readonly id = "goodName";
        }

        const light = new Endpoint(OnOffLightDevice);

        light.behaviors.inject(GoodBehavior);
        expect(light.behaviors.supported["goodName"]).equal(GoodBehavior);
    });
});

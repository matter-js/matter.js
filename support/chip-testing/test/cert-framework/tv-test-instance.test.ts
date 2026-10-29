/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "@matter/main";
import { InternalError } from "@matter/main";
import { KeypadInput, TargetNavigator } from "@matter/main/clusters";
import { expect } from "chai";
import { TestKeypadInputServer } from "../../src/cluster/TestKeypadInputServer.js";
import { TestTargetNavigatorServer } from "../../src/cluster/TestTargetNavigatorServer.js";
import { TvTestInstance } from "../../src/TvTestInstance.js";
import { TV_VIDEO_PLAYER_ENDPOINT } from "../cert/tc-tv-client-support.js";

function videoPlayer(instance: TvTestInstance): Endpoint {
    let found: Endpoint | undefined;
    instance.node.visit(endpoint => {
        if (endpoint.number === TV_VIDEO_PLAYER_ENDPOINT) {
            found = endpoint;
        }
    });
    if (found === undefined) {
        throw new InternalError(`TvTestInstance has no endpoint ${TV_VIDEO_PLAYER_ENDPOINT}`);
    }
    return found;
}

describe("TvTestInstance", () => {
    let instance: TvTestInstance;
    let endpoint: Endpoint;

    beforeEach(async () => {
        instance = new TvTestInstance({ commandPipeFactory: async () => {} });
        await instance.initialize();
        endpoint = videoPlayer(instance);
    });

    afterEach(async () => {
        await instance.close();
    });

    it("seeds the targets chip's tv-app seeds, with no current target", () => {
        const state = endpoint.stateOf(TestTargetNavigatorServer);

        expect(state.targetList.map(({ identifier }) => identifier)).deep.equal([1, 2]);
        expect(state.currentTarget).equal(0xff);
    });

    it("navigates to a target in the TargetList", async () => {
        const response = await endpoint.act(agent =>
            agent.get(TestTargetNavigatorServer).navigateTarget({ target: 2 }),
        );

        expect(response).deep.equal({ status: TargetNavigator.Status.Success });
        expect(endpoint.stateOf(TestTargetNavigatorServer).currentTarget).equal(2);
    });

    it("answers TargetNotFound for a target outside the TargetList", async () => {
        const response = await endpoint.act(agent =>
            agent.get(TestTargetNavigatorServer).navigateTarget({ target: 3 }),
        );

        expect(response).deep.equal({ status: TargetNavigator.Status.TargetNotFound });
        expect(endpoint.stateOf(TestTargetNavigatorServer).currentTarget).equal(0xff);
    });

    // ContentsMenu is a key chip's tv-app refuses
    for (const keyCode of [KeypadInput.CecKeyCode.Up, KeypadInput.CecKeyCode.ContentsMenu]) {
        it(`accepts key code ${KeypadInput.CecKeyCode[keyCode]}`, async () => {
            const response = await endpoint.act(agent => agent.get(TestKeypadInputServer).sendKey({ keyCode }));

            expect(response).deep.equal({ status: KeypadInput.Status.Success });
        });
    }

    it("names the video player endpoint ep1, the segment the cert log checks match", () => {
        expect(endpoint.id).equal(`ep${TV_VIDEO_PLAYER_ENDPOINT}`);
    });
});

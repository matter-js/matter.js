/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "@matter/main";
import { InternalError } from "@matter/main";
import { Channel, KeypadInput, TargetNavigator } from "@matter/main/clusters";
import { StatusResponse } from "@matter/main/types";
import { expect } from "chai";
import { TestChannelServer } from "../../src/cluster/TestChannelServer.js";
import { TestKeypadInputServer } from "../../src/cluster/TestKeypadInputServer.js";
import { TestMediaInputServer } from "../../src/cluster/TestMediaInputServer.js";
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

    function currentChannel() {
        const current = endpoint.stateOf(TestChannelServer).currentChannel;
        return current ? `${current.majorNumber}.${current.minorNumber}` : current;
    }

    function changeChannel(match: string) {
        return endpoint.act(agent => agent.get(TestChannelServer).changeChannel({ match }));
    }

    function inputs() {
        return endpoint.stateOf(TestMediaInputServer).inputList.map(({ index, name }) => `${index}:${name}`);
    }

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

    it("seeds the channels and lineup chip's tv-app seeds, on its first channel", () => {
        const state = endpoint.stateOf(TestChannelServer);

        expect(
            state.channelList.map(({ majorNumber, minorNumber, name }) => `${majorNumber}.${minorNumber} ${name}`),
        ).deep.equal(["6.0 ABC", "9.1 PBS", "9.2 PBS Kids", "9.3 World Channel"]);
        expect(state.lineup?.operatorName).equal("Comcast");
        expect(currentChannel()).equal("6.0");
    });

    it("changes to the one channel a match names, ignoring case", async () => {
        expect(await changeChannel("pbs kids")).deep.equal({ status: Channel.Status.Success });
        expect(currentChannel()).equal("9.2");

        expect(await changeChannel("9.3")).deep.equal({ status: Channel.Status.Success });
        expect(currentChannel()).equal("9.3");
    });

    it("answers MultipleMatches and NoMatches without changing the channel", async () => {
        expect(await changeChannel("KCTS")).deep.equal({ status: Channel.Status.MultipleMatches });
        expect(await changeChannel("NBC")).deep.equal({ status: Channel.Status.NoMatches });
        expect(currentChannel()).equal("6.0");
    });

    it("matches the keys in priority order", async () => {
        await endpoint.setStateOf(TestChannelServer, {
            channelList: [
                { majorNumber: 1, minorNumber: 0, identifier: "One" },
                { majorNumber: 2, minorNumber: 0, affiliateCallSign: "One" },
                { majorNumber: 3, minorNumber: 0, affiliateCallSign: "Two" },
                { majorNumber: 4, minorNumber: 0, callSign: "Two" },
                { majorNumber: 5, minorNumber: 0, callSign: "Three" },
                { majorNumber: 6, minorNumber: 0, name: "Three" },
                { majorNumber: 7, minorNumber: 0, name: "4.0" },
            ],
        });

        for (const [match, channel] of [
            ["one", "1.0"],
            ["two", "3.0"],
            ["three", "5.0"],
            ["4.0", "7.0"],
        ]) {
            expect(await changeChannel(match)).deep.equal({ status: Channel.Status.Success });
            expect(currentChannel()).equal(channel);
        }
    });

    it("changes to a channel by number, the current one included", async () => {
        const changeTo = (majorNumber: number, minorNumber: number) =>
            endpoint.act(async agent =>
                agent.get(TestChannelServer).changeChannelByNumber({ majorNumber, minorNumber }),
            );

        await changeTo(9, 2);
        expect(currentChannel()).equal("9.2");
        await changeTo(9, 2);
        expect(currentChannel()).equal("9.2");

        await expect(changeTo(7, 0)).rejectedWith(StatusResponse.FailureError, "no channel 7.0");
        await expect(changeTo(9, 0)).rejectedWith(StatusResponse.FailureError, "no channel 9.0");
        expect(currentChannel()).equal("9.2");
    });

    it("skips channels, wrapping at both ends of the list", async () => {
        const skip = (count: number) => endpoint.act(agent => agent.get(TestChannelServer).skipChannel({ count }));

        await skip(-1);
        expect(currentChannel()).equal("9.3");
        await skip(6);
        expect(currentChannel()).equal("9.1");
        await skip(-5);
        expect(currentChannel()).equal("6.0");
    });

    it("refuses to skip without a current channel", async () => {
        await endpoint.setStateOf(TestChannelServer, { currentChannel: null });

        await expect(endpoint.act(async agent => agent.get(TestChannelServer).skipChannel({ count: 1 }))).rejectedWith(
            StatusResponse.InvalidInStateError,
        );
        expect(currentChannel()).equal(null);
    });

    it("seeds the inputs chip's tv-app seeds, on index 1", () => {
        expect(inputs()).deep.equal(["1:HDMI", "2:HDMI"]);
        expect(endpoint.stateOf(TestMediaInputServer).currentInput).equal(1);
    });

    it("selects an input of the InputList and refuses any other index", async () => {
        const select = (index: number) =>
            endpoint.act(async agent => agent.get(TestMediaInputServer).selectInput({ index }));

        await select(2);
        expect(endpoint.stateOf(TestMediaInputServer).currentInput).equal(2);

        await expect(select(3)).rejectedWith(StatusResponse.FailureError, "no input with index 3");
        expect(endpoint.stateOf(TestMediaInputServer).currentInput).equal(2);
    });

    it("renames one input of the InputList and refuses any other index", async () => {
        const rename = (index: number, name: string) =>
            endpoint.act(async agent => agent.get(TestMediaInputServer).renameInput({ index, name }));

        await rename(2, "HDMI 2");
        expect(inputs()).deep.equal(["1:HDMI", "2:HDMI 2"]);

        await expect(rename(3, "HDMI 3")).rejectedWith(StatusResponse.FailureError, "no input with index 3");
        expect(inputs()).deep.equal(["1:HDMI", "2:HDMI 2"]);
    });

    it("shows and hides the input status", async () => {
        await endpoint.act(agent => agent.get(TestMediaInputServer).showInputStatus());
        await endpoint.act(agent => agent.get(TestMediaInputServer).hideInputStatus());
    });

    it("names the video player endpoint ep1, the segment the cert log checks match", () => {
        expect(endpoint.id).equal(`ep${TV_VIDEO_PLAYER_ENDPOINT}`);
    });
});

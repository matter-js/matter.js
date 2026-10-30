/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "@matter/main";
import { InternalError } from "@matter/main";
import {
    ApplicationLauncher,
    Channel,
    ContentLauncher,
    KeypadInput,
    MediaPlayback,
    TargetNavigator,
} from "@matter/main/clusters";
import { StatusResponse } from "@matter/main/types";
import { expect } from "chai";
import { CHIP_TV_SETUP_PIN, TestAccountLoginServer } from "../../src/cluster/TestAccountLoginServer.js";
import { TestApplicationLauncherServer } from "../../src/cluster/TestApplicationLauncherServer.js";
import { TestAudioOutputServer } from "../../src/cluster/TestAudioOutputServer.js";
import { TestChannelServer } from "../../src/cluster/TestChannelServer.js";
import { TestContentLauncherServer } from "../../src/cluster/TestContentLauncherServer.js";
import { TestKeypadInputServer } from "../../src/cluster/TestKeypadInputServer.js";
import { TestMediaInputServer } from "../../src/cluster/TestMediaInputServer.js";
import { TestMediaPlaybackServer } from "../../src/cluster/TestMediaPlaybackServer.js";
import { TestTargetNavigatorServer } from "../../src/cluster/TestTargetNavigatorServer.js";
import { TvTestInstance } from "../../src/TvTestInstance.js";
import {
    TV_CONTENT_APP_ENDPOINT,
    TV_KNOWN_APPLICATION,
    TV_VIDEO_PLAYER_ENDPOINT,
} from "../cert/tc-tv-client-support.js";

function endpointOf(instance: TvTestInstance, number: number): Endpoint {
    let found: Endpoint | undefined;
    instance.node.visit(endpoint => {
        if (endpoint.number === number) {
            found = endpoint;
        }
    });
    if (found === undefined) {
        throw new InternalError(`TvTestInstance has no endpoint ${number}`);
    }
    return found;
}

describe("TvTestInstance", () => {
    let instance: TvTestInstance;
    let endpoint: Endpoint;

    beforeEach(async () => {
        instance = new TvTestInstance({ commandPipeFactory: async () => {} });
        await instance.initialize();
        endpoint = endpointOf(instance, TV_VIDEO_PLAYER_ENDPOINT);
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

    it("declares ElectronicGuide and RecordProgram, which the program guide commands need", () => {
        const { featureMap } = endpoint.globalsOf(TestChannelServer);

        expect(featureMap.electronicGuide).equal(true);
        expect(featureMap.recordProgram).equal(true);
    });

    it("answers GetProgramGuide with an empty ProgramList and refuses StartTime after EndTime", async () => {
        const guide = (startTime: number, endTime: number) =>
            endpoint.act(async agent => agent.get(TestChannelServer).getProgramGuide({ startTime, endTime }));

        expect(await guide(10, 10)).deep.equal({ paging: {}, programList: [] });
        await expect(guide(11, 10)).rejectedWith(StatusResponse.InvalidActionError, "StartTime 11 is after EndTime 10");
    });

    it("answers Success to RecordProgram and CancelRecordProgram", async () => {
        await endpoint.act(agent => agent.get(TestChannelServer).recordProgram());
        await endpoint.act(agent => agent.get(TestChannelServer).cancelRecordProgram());
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

    it("answers Success to LaunchContent for a search with no seeded match", async () => {
        expect(
            await endpoint.act(agent =>
                agent.get(TestContentLauncherServer).launchContent({
                    search: { parameterList: [{ type: ContentLauncher.Parameter.Channel, value: "NBC" }] },
                    autoPlay: false,
                }),
            ),
        ).deep.equal({ status: ContentLauncher.Status.Success });
    });

    it("answers Success to LaunchURL for an https URL, in any case, and URLNotAvailable for http", async () => {
        const launch = (contentUrl: string) =>
            endpoint.act(agent => agent.get(TestContentLauncherServer).launchUrl({ contentUrl }));

        expect(await launch("HTTPS://csa-iot.org/content")).deep.equal({ status: ContentLauncher.Status.Success });
        expect(await launch("http://csa-iot.org/content")).deep.equal({
            status: ContentLauncher.Status.UrlNotAvailable,
        });
    });

    it("lists the catalogs chip's tv-app lists", () => {
        expect(endpoint.stateOf(TestApplicationLauncherServer).catalogList).deep.equal([123, 456]);
    });

    for (const command of ["launchApp", "stopApp", "hideApp"] as const) {
        describe(command, () => {
            const send = (application?: ApplicationLauncher.Application) =>
                endpoint.act(async agent => agent.get(TestApplicationLauncherServer)[command]({ application }));

            it("answers Success for the application the cert cases send", async () => {
                expect(await send(TV_KNOWN_APPLICATION)).deep.equal({ status: ApplicationLauncher.Status.Success });
            });

            it("answers AppNotAvailable for an unknown ID or a catalog not in CatalogList", async () => {
                for (const application of [
                    { catalogVendorId: 456, applicationId: "unknown" },
                    { catalogVendorId: 789, applicationId: "exampleid" },
                ]) {
                    expect(await send(application)).deep.equal({ status: ApplicationLauncher.Status.AppNotAvailable });
                }
            });

            it("refuses a request without an application", async () => {
                await expect(send()).rejectedWith(StatusResponse.InvalidCommandError, "requires an Application");
            });
        });
    }

    function outputs() {
        return endpoint.stateOf(TestAudioOutputServer).outputList.map(({ index, name }) => `${index}:${name}`);
    }

    function playback() {
        const { currentState, activeAudioTrack, activeTextTrack } = endpoint.stateOf(TestMediaPlaybackServer);
        return {
            state: MediaPlayback.PlaybackState[currentState],
            audio: activeAudioTrack?.id ?? null,
            text: activeTextTrack?.id ?? null,
        };
    }

    it("seeds the outputs chip's tv-app seeds, on index 1", () => {
        expect(outputs()).deep.equal(["1:HDMI", "2:HDMI", "3:HDMI"]);
        expect(endpoint.stateOf(TestAudioOutputServer).currentOutput).equal(1);
    });

    it("selects an output of the OutputList and refuses any other index", async () => {
        const select = (index: number) =>
            endpoint.act(async agent => agent.get(TestAudioOutputServer).selectOutput({ index }));

        await select(2);
        expect(endpoint.stateOf(TestAudioOutputServer).currentOutput).equal(2);

        await expect(select(4)).rejectedWith(StatusResponse.FailureError, "no output with index 4");
        expect(endpoint.stateOf(TestAudioOutputServer).currentOutput).equal(2);
    });

    it("renames one output of the OutputList and refuses any other index", async () => {
        const rename = (index: number, name: string) =>
            endpoint.act(async agent => agent.get(TestAudioOutputServer).renameOutput({ index, name }));

        await rename(1, "Kitchen Speakers");
        expect(outputs()).deep.equal(["1:Kitchen Speakers", "2:HDMI", "3:HDMI"]);

        await expect(rename(0, "None")).rejectedWith(StatusResponse.FailureError, "no output with index 0");
        expect(outputs()).deep.equal(["1:Kitchen Speakers", "2:HDMI", "3:HDMI"]);
    });

    it("seeds the tracks chip's tv-app seeds, playing its first audio track and no text track", () => {
        const state = endpoint.stateOf(TestMediaPlaybackServer);

        expect(state.availableAudioTracks?.map(({ id }) => id)).deep.equal([
            "activeAudioTrackId_0",
            "activeAudioTrackId_1",
        ]);
        expect(
            state.availableTextTracks?.map(({ id, trackAttributes }) => `${id} ${trackAttributes.languageCode}`),
        ).deep.equal(["activeTextTrackId_0 languageCode1", "activeTextTrackId_1 languageCode2"]);
        expect(playback()).deep.equal({ state: "Playing", audio: "activeAudioTrackId_0", text: null });
    });

    it("sets CurrentState for Play, Pause and Stop and answers Success", async () => {
        for (const [command, state] of [
            ["pause", "Paused"],
            ["stop", "NotPlaying"],
            ["play", "Playing"],
        ] as const) {
            expect(await endpoint.act(agent => agent.get(TestMediaPlaybackServer)[command]())).deep.equal({
                status: MediaPlayback.Status.Success,
            });
            expect(playback().state).equal(state);
        }
    });

    for (const command of ["next", "previous"] as const) {
        it(`sets CurrentState to Playing for ${command} and answers Success`, async () => {
            await endpoint.act(agent => agent.get(TestMediaPlaybackServer).pause());

            expect(await endpoint.act(agent => agent.get(TestMediaPlaybackServer)[command]())).deep.equal({
                status: MediaPlayback.Status.Success,
            });
            expect(playback().state).equal("Playing");
        });
    }

    it("answers Success to StartOver, SkipForward and SkipBackward without changing CurrentState", async () => {
        await endpoint.act(agent => agent.get(TestMediaPlaybackServer).pause());
        const deltaPositionMilliseconds = 10_000;

        for (const send of [
            (server: TestMediaPlaybackServer) => server.startOver(),
            (server: TestMediaPlaybackServer) => server.skipForward({ deltaPositionMilliseconds }),
            (server: TestMediaPlaybackServer) => server.skipBackward({ deltaPositionMilliseconds }),
        ]) {
            expect(await endpoint.act(agent => send(agent.get(TestMediaPlaybackServer)))).deep.equal({
                status: MediaPlayback.Status.Success,
            });
        }
        expect(playback().state).equal("Paused");
    });

    it("activates an available audio track and refuses any other with INVALID_IN_STATE", async () => {
        const activate = (trackId: string) =>
            endpoint.act(async agent =>
                agent.get(TestMediaPlaybackServer).activateAudioTrack({ trackId, audioOutputIndex: 1 }),
            );

        await activate("activeAudioTrackId_1");
        expect(playback().audio).equal("activeAudioTrackId_1");

        await expect(activate("activeTextTrackId_0")).rejectedWith(
            StatusResponse.InvalidInStateError,
            'No available audio track has ID "activeTextTrackId_0"',
        );
        expect(playback().audio).equal("activeAudioTrackId_1");
    });

    it("activates an available text track, refuses any other with INVALID_IN_STATE and deactivates", async () => {
        const activate = (trackId: string) =>
            endpoint.act(async agent => agent.get(TestMediaPlaybackServer).activateTextTrack({ trackId }));
        const deactivate = () => endpoint.act(async agent => agent.get(TestMediaPlaybackServer).deactivateTextTrack());

        await activate("activeTextTrackId_1");
        expect(playback().text).equal("activeTextTrackId_1");

        await expect(activate("activeAudioTrackId_0")).rejectedWith(
            StatusResponse.InvalidInStateError,
            'No available text track has ID "activeAudioTrackId_0"',
        );
        expect(playback().text).equal("activeTextTrackId_1");

        await deactivate();
        expect(playback().text).equal(null);
        await deactivate();
        expect(playback().text).equal(null);
    });

    it("names the video player endpoint ep1, the segment the cert log checks match", () => {
        expect(endpoint.id).equal(`ep${TV_VIDEO_PLAYER_ENDPOINT}`);
    });

    describe("content app", () => {
        let contentApp: Endpoint;

        beforeEach(() => {
            contentApp = endpointOf(instance, TV_CONTENT_APP_ENDPOINT);
        });

        it("returns chip's Setup PIN", async () => {
            const response = await contentApp.act(agent => agent.get(TestAccountLoginServer).getSetupPin());

            expect(response).deep.equal({ setupPin: CHIP_TV_SETUP_PIN });
        });

        it("logs in with chip's Setup PIN, refuses any other with UNSUPPORTED_ACCESS and logs out", async () => {
            const login = (setupPin: string) =>
                contentApp.act(async agent =>
                    agent.get(TestAccountLoginServer).login({ tempAccountIdentifier: "AnyAccountId1234", setupPin }),
                );

            await login(CHIP_TV_SETUP_PIN);
            await expect(login("otherPin123")).rejectedWith(StatusResponse.UnsupportedAccessError, "does not match");
            await contentApp.act(agent => agent.get(TestAccountLoginServer).logout());
        });

        it("names the content app endpoint ep3, the segment the cert log checks match", () => {
            expect(contentApp.id).equal(`ep${TV_CONTENT_APP_ENDPOINT}`);
        });
    });
});

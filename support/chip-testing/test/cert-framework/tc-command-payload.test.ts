/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError, Millis } from "@matter/main";
import { Matter } from "@matter/model";
import type { LogFlavor } from "@matter/testing";
import { LogFollower } from "@matter/testing";
import { expect } from "chai";
import { commandPayload } from "../cert/tc-command-payload.js";
import { expectCommandPayload, MATTERJS_EMPTY_PAYLOAD, MATTERJS_NO_PAYLOAD } from "../cert/tc-support.js";

const KEYPAD_INPUT = Matter.clusters.require("KeypadInput");
const TARGET_NAVIGATOR = Matter.clusters.require("TargetNavigator");
const CHANNEL = Matter.clusters.require("Channel");
const CONTENT_LAUNCHER = Matter.clusters.require("ContentLauncher");
const MEDIA_PLAYBACK = Matter.clusters.require("MediaPlayback");
const APPLICATION_LAUNCHER = Matter.clusters.require("ApplicationLauncher");
const SCENES = Matter.clusters.require("ScenesManagement");
const ACCOUNT_LOGIN = Matter.clusters.require("AccountLogin");

const STRUCT_OPEN = "\\{\\s*$";
const STRUCT_CLOSE = "\\},\\s*$";
const LIST_GAP = "\\[DMG\\]\\s*$";
const LIST_CLOSE = "\\],\\s*$";

function sources(patterns: RegExp[]) {
    return patterns.map(({ source }) => source);
}

describe("commandPayload", () => {
    it("renders an enum field as an unsigned number", () => {
        const payload = commandPayload(KEYPAD_INPUT, "sendKey", { keyCode: 1 });

        expect(sources(payload.chip)).deep.equal(["0x0 = 1 \\(unsigned\\),\\s*$"]);
        expect(payload.matterjs).equal("keyCode: 1");
    });

    it("renders fields in model order and a string with its byte count", () => {
        const payload = commandPayload(TARGET_NAVIGATOR, "navigateTarget", { data: "größe", target: 2 });

        expect(sources(payload.chip)).deep.equal(["0x0 = 2 \\(unsigned\\),\\s*$", '0x1 = "größe" \\(7 chars\\),\\s*$']);
        expect(payload.matterjs).equal("target: 2 data: größe");
    });

    it("leaves out a field the arguments do not name", () => {
        const payload = commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2 });

        expect(sources(payload.chip)).deep.equal(["0x0 = 2 \\(unsigned\\),\\s*$"]);
        expect(payload.matterjs).equal("target: 2");
    });

    it("renders a signed integer field as signed", () => {
        const payload = commandPayload(CHANNEL, "skipChannel", { count: -3 });

        expect(sources(payload.chip)).deep.equal(["0x0 = -3 \\(signed\\),\\s*$"]);
    });

    it("renders a uint64 field and a nullable uint8 field as unsigned numbers (characterization)", () => {
        const skip = commandPayload(MEDIA_PLAYBACK, "skipForward", { deltaPositionMilliseconds: 10_000 });
        expect(sources(skip.chip)).deep.equal(["0x0 = 10000 \\(unsigned\\),\\s*$"]);
        expect(skip.matterjs).equal("deltaPositionMilliseconds: 10000");

        const track = commandPayload(MEDIA_PLAYBACK, "activateAudioTrack", {
            audioOutputIndex: 1,
            trackId: "activeAudioTrackId_1",
        });
        expect(sources(track.chip)).deep.equal([
            '0x0 = "activeAudioTrackId_1" \\(20 chars\\),\\s*$',
            "0x1 = 1 \\(unsigned\\),\\s*$",
        ]);
        expect(track.matterjs).equal("trackId: activeAudioTrackId_1 audioOutputIndex: 1");
    });

    it("renders an epoch-s field as Matter-epoch seconds for chip and Unix-epoch seconds for matter.js", () => {
        const payload = commandPayload(CHANNEL, "getProgramGuide", {
            startTime: 1_700_000_000,
            endTime: 1_700_003_600,
        });

        expect(sources(payload.chip)).deep.equal([
            "0x0 = 753315200 \\(unsigned\\),\\s*$",
            "0x1 = 753318800 \\(unsigned\\),\\s*$",
        ]);
        expect(payload.matterjs).equal("startTime: 1700000000 endTime: 1700003600");
    });

    it("renders a command without fields as no payload", () => {
        const payload = commandPayload(MEDIA_PLAYBACK, "play", {});

        expect(payload.chip).deep.equal([]);
        expect(payload.matterjs).equal(MATTERJS_NO_PAYLOAD);
    });

    it("renders a command that sends none of its optional fields as an empty payload", () => {
        const payload = commandPayload(ACCOUNT_LOGIN, "logout", {});

        expect(payload.chip).deep.equal([]);
        expect(payload.matterjs).equal(MATTERJS_EMPTY_PAYLOAD);
    });

    it("refuses an argument the command has no field for", () => {
        expect(() => commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, targetName: "x" })).throws(
            InternalError,
            "has no field targetName",
        );
    });

    it("refuses a value of the wrong type", () => {
        expect(() => commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: "2" })).throws(
            InternalError,
            "TargetNavigator.NavigateTarget.target needs a number",
        );
        expect(() => commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, data: 5 })).throws(
            InternalError,
            "TargetNavigator.NavigateTarget.data needs a string",
        );
    });

    it("refuses an empty top-level string", () => {
        expect(() => commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, data: "" })).throws(
            InternalError,
            "empty top-level value TargetNavigator.NavigateTarget.data",
        );
    });

    it("refuses a top-level string that ends in whitespace", () => {
        expect(() => commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, data: "trailing " })).throws(
            InternalError,
            "trims the whitespace that ends the top-level string TargetNavigator.NavigateTarget.data",
        );
    });

    it("refuses a string with a line break at any depth", () => {
        expect(() => commandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, data: "two\nlines" })).throws(
            InternalError,
            "has a line break",
        );
        expect(() =>
            commandPayload(APPLICATION_LAUNCHER, "launchApp", {
                application: { catalogVendorId: 1, applicationId: "two\rlines" },
            }),
        ).throws(InternalError, "application.applicationId");
    });

    it("renders an empty string inside a struct", () => {
        const payload = commandPayload(APPLICATION_LAUNCHER, "launchApp", {
            application: { catalogVendorId: 1, applicationId: "" },
        });

        expect(sources(payload.chip)).include('0x1 = "" \\(0 chars\\),\\s*$');
        expect(payload.matterjs).equal('application: { catalogVendorId: 1, applicationId: "" }');
    });

    it("refuses a field id chip-tool sends out of model order", () => {
        expect(() =>
            commandPayload(Matter.clusters.require("CameraAvStreamManagement"), "videoStreamAllocate", {
                osdEnabled: true,
            }),
        ).throws(InternalError, "has field id 10, which chip-tool sends out of model order");
    });

    it("renders a boolean field without a type", () => {
        const payload = commandPayload(CONTENT_LAUNCHER, "launchContent", { autoPlay: false });

        expect(sources(payload.chip)).deep.equal(["0x1 = false,\\s*$"]);
        expect(payload.matterjs).equal("autoPlay: false");
    });

    it("renders a struct field over several lines on chip and in braces on matter.js", () => {
        const payload = commandPayload(APPLICATION_LAUNCHER, "launchApp", {
            application: { applicationId: 'say "größe"', catalogVendorId: 123 },
        });

        expect(sources(payload.chip)).deep.equal([
            "0x0 = \\s*$",
            STRUCT_OPEN,
            "0x0 = 123 \\(unsigned\\),\\s*$",
            '0x1 = "say "größe"" \\(13 chars\\),\\s*$',
            STRUCT_CLOSE,
        ]);
        expect(payload.matterjs).equal('application: { catalogVendorId: 123, applicationId: "say \\"größe\\"" }');
    });

    it("renders a list of structs inside a struct, with its line without text and unnamed entries", () => {
        const payload = commandPayload(CONTENT_LAUNCHER, "launchContent", {
            search: {
                parameterList: [
                    { type: 1, value: "PBS", externalIdList: [{ name: "n", value: "v" }] },
                    { type: 0, value: "A" },
                ],
            },
            autoPlay: true,
        });

        expect(sources(payload.chip)).deep.equal([
            "0x0 = \\s*$",
            STRUCT_OPEN,
            "0x0 = \\[\\s*$",
            LIST_GAP,
            STRUCT_OPEN,
            "0x0 = 1 \\(unsigned\\),\\s*$",
            '0x1 = "PBS" \\(3 chars\\),\\s*$',
            "0x2 = \\[\\s*$",
            LIST_GAP,
            STRUCT_OPEN,
            '0x0 = "n" \\(1 chars\\),\\s*$',
            '0x1 = "v" \\(1 chars\\),\\s*$',
            STRUCT_CLOSE,
            LIST_CLOSE,
            STRUCT_CLOSE,
            STRUCT_OPEN,
            "0x0 = 0 \\(unsigned\\),\\s*$",
            '0x1 = "A" \\(1 chars\\),\\s*$',
            STRUCT_CLOSE,
            LIST_CLOSE,
            STRUCT_CLOSE,
            "0x1 = true,\\s*$",
        ]);
        expect(payload.matterjs).equal(
            'search: { parameterList: [ { type: 1, value: "PBS", externalIdList: [ { name: "n", value: "v" } ] }, ' +
                '{ type: 0, value: "A" } ] } autoPlay: true',
        );
    });

    it("renders an empty list and an empty struct", () => {
        expect(commandPayload(CONTENT_LAUNCHER, "launchContent", { search: { parameterList: [] } })).deep.include({
            matterjs: "search: { parameterList: [] }",
        });
        expect(
            sources(commandPayload(CONTENT_LAUNCHER, "launchContent", { search: { parameterList: [] } }).chip),
        ).deep.equal(["0x0 = \\s*$", STRUCT_OPEN, "0x0 = \\[\\s*$", LIST_GAP, LIST_CLOSE, STRUCT_CLOSE]);

        const empty = commandPayload(CONTENT_LAUNCHER, "launchUrl", { brandingInformation: {} });
        expect(sources(empty.chip)).deep.equal(["0x2 = \\s*$", STRUCT_OPEN, STRUCT_CLOSE]);
        expect(empty.matterjs).equal("brandingInformation: {}");
    });

    it("refuses an argument a nested struct has no field for", () => {
        expect(() =>
            commandPayload(APPLICATION_LAUNCHER, "launchApp", {
                application: { catalogVendorId: 123, applicationId: "x", endpoint: 1 },
            }),
        ).throws(InternalError, "ApplicationLauncher.LaunchApp.application has no field endpoint");
    });

    it("refuses a value of the wrong type for a boolean, a struct or a list", () => {
        expect(() => commandPayload(CONTENT_LAUNCHER, "launchContent", { autoPlay: 1 })).throws(
            InternalError,
            "autoPlay needs a boolean",
        );
        for (const search of ["PBS", [{ parameterList: [] }]]) {
            expect(() => commandPayload(CONTENT_LAUNCHER, "launchContent", { search })).throws(
                InternalError,
                "search needs a struct",
            );
        }
        expect(() => commandPayload(CONTENT_LAUNCHER, "launchContent", { search: { parameterList: {} } })).throws(
            InternalError,
            "parameterList needs a list",
        );
        expect(() => commandPayload(CONTENT_LAUNCHER, "launchContent", { search: { parameterList: ["PBS"] } })).throws(
            InternalError,
            "parameterList[0] needs a struct",
        );
    });

    it("refuses a top-level list", () => {
        expect(() => commandPayload(SCENES, "addScene", { extensionFieldSetStructs: [] })).throws(
            InternalError,
            "does not print the top-level list ScenesManagement.AddScene.extensionFieldSetStructs",
        );
    });

    it("refuses a list whose entries are not structs", () => {
        expect(() =>
            commandPayload(CONTENT_LAUNCHER, "launchContent", {
                playbackPreferences: { textTrack: { languageCode: "en", characteristics: [1] } },
            }),
        ).throws(InternalError, "characteristics is a list of enum entries");
    });

    it("refuses a field of a type it does not render", () => {
        expect(() =>
            commandPayload(CONTENT_LAUNCHER, "launchUrl", {
                brandingInformation: { providerName: "p", logo: { size: { width: 1 } } },
            }),
        ).throws(InternalError, "brandingInformation.logo.size.width is a float field");
    });
});

describe("commandPayload for octet strings, bitmaps and nulls", () => {
    const DOOR_LOCK = Matter.clusters.require("DoorLock");
    const PIN = Bytes.fromHex("313233343536");

    it("renders an octet string as chip's byte list and matter.js's hex", () => {
        const payload = commandPayload(DOOR_LOCK, "setCredential", {
            operationType: 0,
            credential: { credentialType: 1, credentialIndex: 1 },
            credentialData: PIN,
            userIndex: 1,
            userStatus: null,
            userType: null,
        });

        expect(sources(payload.chip)).deep.equal([
            "0x0 = 0 \\(unsigned\\),\\s*$",
            "0x1 = \\s*$",
            STRUCT_OPEN,
            "0x0 = 1 \\(unsigned\\),\\s*$",
            "0x1 = 1 \\(unsigned\\),\\s*$",
            STRUCT_CLOSE,
            "0x2 = \\[\\s*$",
            "\\s0x31, 0x32, 0x33, 0x34, 0x35, 0x36, \\s*$",
            "\\] \\(6 bytes\\),?\\s*$",
            "0x3 = 1 \\(unsigned\\),\\s*$",
            "0x4 = NULL\\s*$",
            "0x5 = NULL\\s*$",
        ]);
        expect(payload.matterjs).equal(
            "operationType: 0 credential: { credentialType: 1, credentialIndex: 1 } credentialData: 313233343536 " +
                "userIndex: 1 userStatus: null userType: null",
        );
    });

    it("renders a bitmap as its number on chip and as every bit on matter.js", () => {
        const payload = commandPayload(DOOR_LOCK, "setWeekDaySchedule", {
            weekDayIndex: 1,
            userIndex: 1,
            daysMask: { monday: true, friday: true },
            startHour: 15,
            startMinute: 45,
            endHour: 16,
            endMinute: 55,
        });

        expect(sources(payload.chip)[2]).equal("0x2 = 34 \\(unsigned\\),\\s*$");
        expect(payload.matterjs).equal(
            "weekDayIndex: 1 userIndex: 1 daysMask: { sunday: false, monday: true, tuesday: false, wednesday: false, " +
                "thursday: false, friday: true, saturday: false } startHour: 15 startMinute: 45 endHour: 16 endMinute: 55",
        );
    });

    it("refuses a bit the bitmap does not have and a bit that is not a boolean", () => {
        expect(() =>
            commandPayload(DOOR_LOCK, "getWeekDaySchedule", { weekDayIndex: 1, userIndex: 1, daysMask: {} }),
        ).throws(InternalError, "has no field daysMask");
        const schedule = { weekDayIndex: 1, userIndex: 1, startHour: 1, startMinute: 0, endHour: 2, endMinute: 0 };
        expect(() =>
            commandPayload(DOOR_LOCK, "setWeekDaySchedule", { ...schedule, daysMask: { someday: true } }),
        ).throws(InternalError, "daysMask has no bit someday");
        expect(() => commandPayload(DOOR_LOCK, "setWeekDaySchedule", { ...schedule, daysMask: { monday: 1 } })).throws(
            InternalError,
            "daysMask needs a boolean per bit",
        );
        expect(() => commandPayload(DOOR_LOCK, "setWeekDaySchedule", { ...schedule, daysMask: 2 })).throws(
            InternalError,
            "daysMask needs an object of set bits",
        );
    });

    it("refuses a null for a field that is not nullable, and bytes of the wrong type or empty", () => {
        expect(() => commandPayload(DOOR_LOCK, "getUser", { userIndex: null })).throws(
            InternalError,
            "DoorLock.GetUser.userIndex is not nullable",
        );
        expect(() => commandPayload(DOOR_LOCK, "lockDoor", { pinCode: "1234" })).throws(
            InternalError,
            "DoorLock.LockDoor.pinCode needs bytes",
        );
        expect(() => commandPayload(DOOR_LOCK, "lockDoor", { pinCode: new Uint8Array() })).throws(
            InternalError,
            "empty top-level value DoorLock.LockDoor.pinCode",
        );
    });
});

describe("commandPayload in the payload check", () => {
    const LAUNCH_CONTENT = { cluster: CONTENT_LAUNCHER, endpoint: 1, command: "launchContent" };
    const ARGS = { search: { parameterList: [{ type: 1, value: "PBS" }] }, autoPlay: true };

    // The lines CHIP's `CheckIMPayload` prints for a LaunchContent request carrying ARGS
    const CHIP_REQUEST = [
        "[DMG] \tInvokeRequests =",
        "[DMG] \t[",
        "[DMG] \t\tCommandDataIB =",
        "[DMG] \t\t{",
        "[DMG] \t\t\tCommandPathIB =",
        "[DMG] \t\t\t{",
        "[DMG] \t\t\t\tEndpointId = 0x1,",
        "[DMG] \t\t\t\tClusterId = 0x50a,",
        "[DMG] \t\t\t\tCommandId = 0x0,",
        "[DMG] \t\t\t},",
        "[DMG] \t\t\t",
        "[DMG] \t\t\tCommandFields = ",
        "[DMG] \t\t\t{",
        "[DMG] \t\t\t\t0x0 = ",
        "[DMG] \t\t\t\t{",
        "[DMG] \t\t\t\t\t0x0 = [",
        "[DMG] \t\t\t\t\t\t\t",
        "[DMG] \t\t\t\t\t\t{",
        "[DMG] \t\t\t\t\t\t\t0x0 = 1 (unsigned), ",
        '[DMG] \t\t\t\t\t\t\t0x1 = "PBS" (3 chars), ',
        "[DMG] \t\t\t\t\t\t},",
        "[DMG] \t\t\t\t\t],",
        "[DMG] \t\t\t\t},",
        "[DMG] \t\t\t\t0x1 = true, ",
        "[DMG] \t\t\t},",
        "[DMG] \t\t},",
        "[DMG] \t\t",
        "[DMG] \t],",
    ];

    // The lines a matter.js TH prints for the same request, as `LogFormat` "plain" renders its `Diagnostic.dict`
    const EXCHANGE = "@1:1c2511c88402bfdf•7eb4⇵c8fe";
    const MATTERJS_REQUEST = [
        `INFO InteractionServer Invoke « ${EXCHANGE} invokes: 1.contentLauncher.launchContent`,
        `INFO ProtocolService Invoke « th.ep1.contentLauncher.launchContent ${EXCHANGE}✉07eb2514 ` +
            'search: { parameterList: [ { type: 1, value: "PBS" } ] } autoPlay: true',
    ];

    async function verdict(lines: string[], flavor: LogFlavor, args: typeof ARGS) {
        const follower = new LogFollower(
            (async function* () {
                yield* lines;
            })(),
            "th",
        );
        try {
            const payload = commandPayload(CONTENT_LAUNCHER, "launchContent", args);
            return (await expectCommandPayload(follower, flavor, LAUNCH_CONTENT, payload, 0, Millis(200))).verdict;
        } finally {
            await follower.close();
        }
    }

    it("passes the request on both flavors", async () => {
        expect(await verdict(CHIP_REQUEST, "chip-local", ARGS)).equal("pass");
        expect(await verdict(MATTERJS_REQUEST, "matterjs", ARGS)).equal("pass");
    });

    it("matches a matter.js line that ends after the message id for an empty payload, and no other", async () => {
        const logout = { cluster: ACCOUNT_LOGIN, endpoint: 3, command: "logout" };
        const lines = (ending: string) => [
            `INFO InteractionServer Invoke « ${EXCHANGE} invokes: 3.accountLogin.logout`,
            `INFO ProtocolService Invoke « th.ep3.accountLogin.logout ${EXCHANGE}✉07eb2514${ending}`,
        ];
        const check = async (ending: string) => {
            const follower = new LogFollower(
                (async function* () {
                    yield* lines(ending);
                })(),
                "th",
            );
            try {
                const payload = commandPayload(ACCOUNT_LOGIN, "logout", {});
                return (await expectCommandPayload(follower, "matterjs", logout, payload, 0, Millis(200))).verdict;
            } finally {
                await follower.close();
            }
        };

        expect(await check("")).equal("pass");
        expect(await check(" node: 1")).equal("fail");
    });

    it("fails a request whose nested value differs", async () => {
        const other = { ...ARGS, search: { parameterList: [{ type: 1, value: "ABC" }] } };

        expect(await verdict(CHIP_REQUEST, "chip-local", other)).equal("fail");
        expect(await verdict(MATTERJS_REQUEST, "matterjs", other)).equal("fail");
    });
});

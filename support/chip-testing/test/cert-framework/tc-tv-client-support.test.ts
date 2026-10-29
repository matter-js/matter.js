/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import { expect } from "chai";
import { MATTERJS_NO_PAYLOAD } from "../cert/tc-support.js";
import { tvCommandPayload } from "../cert/tc-tv-client-support.js";

const KEYPAD_INPUT = Matter.clusters.require("KeypadInput");
const TARGET_NAVIGATOR = Matter.clusters.require("TargetNavigator");
const CHANNEL = Matter.clusters.require("Channel");
const CONTENT_LAUNCHER = Matter.clusters.require("ContentLauncher");
const MEDIA_PLAYBACK = Matter.clusters.require("MediaPlayback");

function sources(patterns: RegExp[]) {
    return patterns.map(({ source }) => source);
}

describe("tvCommandPayload", () => {
    it("renders an enum field as an unsigned number", () => {
        const payload = tvCommandPayload(KEYPAD_INPUT, "sendKey", { keyCode: 1 });

        expect(sources(payload.chip)).deep.equal(["0x0 = 1 \\(unsigned\\),\\s*$"]);
        expect(payload.matterjs).equal("keyCode: 1");
    });

    it("renders fields in model order and a string with its byte count", () => {
        const payload = tvCommandPayload(TARGET_NAVIGATOR, "navigateTarget", { data: "größe", target: 2 });

        expect(sources(payload.chip)).deep.equal(["0x0 = 2 \\(unsigned\\),\\s*$", '0x1 = "größe" \\(7 chars\\),\\s*$']);
        expect(payload.matterjs).equal("target: 2 data: größe");
    });

    it("leaves out a field the arguments do not name", () => {
        const payload = tvCommandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2 });

        expect(sources(payload.chip)).deep.equal(["0x0 = 2 \\(unsigned\\),\\s*$"]);
        expect(payload.matterjs).equal("target: 2");
    });

    it("renders a signed integer field as signed", () => {
        const payload = tvCommandPayload(CHANNEL, "skipChannel", { count: -3 });

        expect(sources(payload.chip)).deep.equal(["0x0 = -3 \\(signed\\),\\s*$"]);
    });

    it("renders a command without fields as no payload", () => {
        const payload = tvCommandPayload(MEDIA_PLAYBACK, "play", {});

        expect(payload.chip).deep.equal([]);
        expect(payload.matterjs).equal(MATTERJS_NO_PAYLOAD);
    });

    it("refuses an argument the command has no field for", () => {
        expect(() => tvCommandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, targetName: "x" })).throws(
            InternalError,
            "has no field targetName",
        );
    });

    it("refuses a value of the wrong type", () => {
        expect(() => tvCommandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: "2" })).throws(
            InternalError,
            "needs a number for target",
        );
        expect(() => tvCommandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, data: 5 })).throws(
            InternalError,
            "needs a string for data",
        );
    });

    it("refuses a string matter.js cannot print as a matchable value", () => {
        for (const data of ["", "two\nlines"]) {
            expect(() => tvCommandPayload(TARGET_NAVIGATOR, "navigateTarget", { target: 2, data })).throws(
                InternalError,
                "as a matchable value",
            );
        }
    });

    it("refuses a field of a type it does not render", () => {
        expect(() => tvCommandPayload(CONTENT_LAUNCHER, "launchContent", { autoPlay: 1 })).throws(
            InternalError,
            "is a boolean field",
        );
    });
});

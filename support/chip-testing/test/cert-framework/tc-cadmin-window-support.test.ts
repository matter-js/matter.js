/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis, Seconds } from "@matter/main";
import { Status, StatusResponseError, ValidationError } from "@matter/main/types";
import type { LogExpectPatterns, LogFlavor, LogLine } from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import {
    isWindowNotOpenRefusal,
    lateStartCheck,
    REVOKE_WINDOW_NOT_OPEN,
    WINDOW_OPENED_OR_CLOSED,
    windowLifetimeCheck,
} from "../cert/tc-cadmin-window-support.js";
import { expectDeviceLog } from "../cert/tc-support.js";

// Lines captured from real TC-CADMIN-1.1 and 1.7 runs against each device flavor. chip's refused revoke has no
// capture yet: its text is `AdministratorCommissioningLogic::RevokeCommissioning`'s, on chip's line prefix.
const CHIP = {
    windowOpen: "[1787433099.731] [23362:73430237:chip] [ZCL] Commissioning window is now open",
    windowClosed: "[1792600312.351] [68466:50592886:chip] [SVR] Closing pairing window",
    revokeRefused: "[1792600312.351] [68466:50592886:chip] [ZCL] Commissioning window is currently not open",
    commissioned: "[1787433099.093] [23362:73430237:chip] [SVR] Commissioning completed successfully",
};

const MATTERJS = {
    windowOpen:
        "2026-08-23 22:41:11.766 DEBUG AdministratorCommissioningServer Commissioning window opened for 3m by fabric 1",
    windowClosed: "2026-10-21 18:56:15.576 DEBUG AdministratorCommissioningServer Commissioning window closed",
    revokeRefused:
        "2026-10-21 22:17:14.137 INFO CommandInvokeResponse Invoke error 0.administratorCommissioning.revokeCommissioning: Status=Failure(1), ClusterStatus=4",
    commissioned:
        "2026-08-23 22:41:11.299 NOTICE GeneralCommissioningClusterHandler Commissioned fabric: 0670b2d454b688b9 (#1) node: 0000000000000001",
};

async function check(flavor: LogFlavor, patterns: LogExpectPatterns, lines: string[]) {
    const source = new LineQueue();
    const follower = new LogFollower(source.follow(), "th");
    for (const text of lines) {
        source.push(text);
    }
    try {
        return (await expectDeviceLog(follower, flavor, patterns, 0, Millis(100))).check;
    } finally {
        source.close();
        await follower.close();
    }
}

function line(index: number, receivedAt: number): LogLine {
    return { index, at: new Date(), receivedAt, text: `line ${index}` };
}

describe("TC-CADMIN-1.7's device-log patterns", () => {
    it("finds the refused revoke in either device's log", async () => {
        expect((await check("chip-local", REVOKE_WINDOW_NOT_OPEN, [CHIP.revokeRefused])).verdict).equal("pass");
        expect((await check("matterjs", REVOKE_WINDOW_NOT_OPEN, [MATTERJS.revokeRefused])).verdict).equal("pass");
    });

    it("does not take a matter.js revoke refused with another status for WindowNotOpen", async () => {
        for (const text of [
            MATTERJS.revokeRefused.replace("Status=Failure(1)", "Status=UnsupportedAccess(126)"),
            MATTERJS.revokeRefused.replace("ClusterStatus=4", "ClusterStatus=42"),
        ]) {
            expect((await check("matterjs", REVOKE_WINDOW_NOT_OPEN, [text])).verdict, text).equal("fail");
        }
    });

    it("does not take a window closing for a refused revoke", async () => {
        expect((await check("chip-local", REVOKE_WINDOW_NOT_OPEN, [CHIP.windowClosed])).verdict).equal("fail");
        expect((await check("matterjs", REVOKE_WINDOW_NOT_OPEN, [MATTERJS.windowClosed])).verdict).equal("fail");
    });

    it("finds a window opening and a window closing in either device's log", async () => {
        for (const [flavor, lines] of [
            ["chip-local", CHIP],
            ["matterjs", MATTERJS],
        ] as const) {
            for (const text of [lines.windowOpen, lines.windowClosed]) {
                expect((await check(flavor, WINDOW_OPENED_OR_CLOSED, [text])).verdict, text).equal("pass");
            }
        }
    });

    it("does not take a refused revoke or a commissioning for a window change", async () => {
        for (const [flavor, lines] of [
            ["chip-local", CHIP],
            ["matterjs", MATTERJS],
        ] as const) {
            for (const text of [lines.revokeRefused, lines.commissioned]) {
                expect((await check(flavor, WINDOW_OPENED_OR_CLOSED, [text])).verdict, text).equal("fail");
            }
        }
    });
});

describe("TC-CADMIN-1.7's WindowNotOpen refusal predicate", () => {
    it("accepts a Failure carrying the WindowNotOpen cluster status", () => {
        expect(isWindowNotOpenRefusal(new StatusResponseError("revoke", Status.Failure, 4))).equal(true);
    });

    it("does not accept another cluster status or a global status", () => {
        expect(isWindowNotOpenRefusal(new StatusResponseError("revoke", Status.Failure, 2))).equal(false);
        expect(isWindowNotOpenRefusal(new StatusResponseError("revoke", Status.Failure))).equal(false);
        expect(isWindowNotOpenRefusal(new StatusResponseError("revoke", Status.UnsupportedAccess))).equal(false);
        expect(isWindowNotOpenRefusal(new StatusResponseError("revoke", Status.InvalidCommand, 4))).equal(false);
    });

    it("does not accept the client's own rejection or a controller failure", () => {
        expect(isWindowNotOpenRefusal(new ValidationError("encode"))).equal(false);
        expect(isWindowNotOpenRefusal(new ChipToolCommandError("chip-tool invoke failed"))).equal(false);
    });
});

describe("TC-CADMIN-1.7's window timing checks", () => {
    const open = line(3, 1_000);

    it("passes a window that closed at its timeout, within the clock allowance", () => {
        for (const lifetime of [Seconds(180), Millis(Seconds(180) - 1_800), Millis(Seconds(180) + 1_800)]) {
            expect(windowLifetimeCheck(open, line(9, 1_000 + lifetime)).verdict, `${lifetime}`).equal("pass");
        }
    });

    it("points the lifetime at the closed line and the start at the open line", () => {
        expect(windowLifetimeCheck(open, line(9, 1_000 + Seconds(180))).logLine).equal(9);
        expect(lateStartCheck(open, 1_000 + Seconds(190)).logLine).equal(3);
    });

    it("fails a window that closed outside the clock allowance or never", () => {
        for (const lifetime of [Millis(Seconds(180) - 1_801), Millis(Seconds(180) + 1_801)]) {
            expect(windowLifetimeCheck(open, line(9, 1_000 + lifetime)).verdict, `${lifetime}`).equal("fail");
        }
        expect(windowLifetimeCheck(open, undefined).verdict).equal("fail");
    });

    it("passes a commissioning that started 190 s after the window opened, and fails one before", () => {
        expect(lateStartCheck(open, 1_000 + Seconds(190)).verdict).equal("pass");
        expect(lateStartCheck(open, 1_000 + Seconds(190) - 1).verdict).equal("fail");
    });
});

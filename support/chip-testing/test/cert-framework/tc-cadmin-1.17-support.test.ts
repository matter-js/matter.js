/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, Millis } from "@matter/main";
import { PeerCommunicationError } from "@matter/main/protocol";
import { Status, StatusResponseError } from "@matter/main/types";
import type { LogExpectPatterns } from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { NoCommissionedPeerError } from "../../src/cert/InProcessControllerAdapter.js";
import { ChipToolStartupError } from "../../src/chip-tool/chip-tool-client.js";
import {
    COMMISSIONING_COMPLETE,
    fabricSessionsEnded,
    isPostRemovalRefusal,
    removeFabricResponseFailure,
    removeFabricSucceeded,
    WINDOW_OPEN,
} from "../cert/tc-cadmin-1.17-support.js";
import { expectDeviceLog } from "../cert/tc-support.js";

// Lines captured from real TC-CADMIN-1.17 runs against each device flavor.
const CHIP = {
    commissioned: "[1787433099.093] [23362:73430237:chip] [SVR] Commissioning completed successfully",
    windowOpen: "[1787433099.731] [23362:73430237:chip] [ZCL] Commissioning window is now open",
    removed: "[1787433103.742] [23362:73430237:chip] [ZCL] OpCreds: RemoveFabric successful",
    expiring: "[1787433103.742] [23362:73430237:chip] [IN] Expiring all sessions for fabric 0x2!!",
};

const MATTERJS = {
    commissioned:
        "2026-08-23 22:41:11.299 NOTICE GeneralCommissioningClusterHandler Commissioned fabric: 0670b2d454b688b9 (#1) node: 0000000000000001",
    windowOpen:
        "2026-08-23 22:41:11.766 DEBUG AdministratorCommissioningServer Commissioning window timer started for 3m for @1:d8845766d0bbb69f•d9ca.",
    removed:
        "2026-08-22 21:48:06.406 INFO ProtocolService Invoke » binford-6100.operationalCredentials.removeFabric @1:9a52bb47a4ee167d•c675⇵68ce✉09f1964b statusCode: 0 fabricIndex: 2",
    sessionEnded: "2026-08-22 21:48:06.401 INFO Session @2:1946ee4c0f86d574•c677 Session ended",
};

async function check(flavor: string, patterns: LogExpectPatterns, lines: string[]) {
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

describe("TC-CADMIN-1.17's device-log patterns", () => {
    it("finds a completed commissioning in either device's log", async () => {
        expect((await check("chip-local", COMMISSIONING_COMPLETE, [CHIP.commissioned])).verdict).equal("pass");
        expect((await check("matterjs", COMMISSIONING_COMPLETE, [MATTERJS.commissioned])).verdict).equal("pass");
    });

    it("finds an opened commissioning window in either device's log", async () => {
        expect((await check("chip-local", WINDOW_OPEN, [CHIP.windowOpen])).verdict).equal("pass");
        expect((await check("matterjs", WINDOW_OPEN, [MATTERJS.windowOpen])).verdict).equal("pass");
    });

    it("does not take a commissioning window for a completed commissioning", async () => {
        expect((await check("chip-local", COMMISSIONING_COMPLETE, [CHIP.windowOpen])).verdict).equal("fail");
        expect((await check("matterjs", COMMISSIONING_COMPLETE, [MATTERJS.windowOpen])).verdict).equal("fail");
    });

    it("finds the removal of the fabric it asked about", async () => {
        expect((await check("chip-local", removeFabricSucceeded(2), [CHIP.removed])).verdict).equal("pass");
        expect((await check("matterjs", removeFabricSucceeded(2), [MATTERJS.removed])).verdict).equal("pass");
    });

    it("does not take another fabric's removal for the one it asked about", async () => {
        expect((await check("matterjs", removeFabricSucceeded(3), [MATTERJS.removed])).verdict).equal("fail");
    });

    it("does not take fabric 20's removal for fabric 2's", async () => {
        const fabric20 = MATTERJS.removed.replace("fabricIndex: 2", "fabricIndex: 20");

        expect((await check("matterjs", removeFabricSucceeded(2), [fabric20])).verdict).equal("fail");
    });

    it("does not pass a removal the device answered with a failure status", async () => {
        const rejected = MATTERJS.removed.replace("statusCode: 0", "statusCode: 11");

        expect((await check("matterjs", removeFabricSucceeded(2), [rejected])).verdict).equal("fail");
    });

    it("finds the removed fabric's sessions ending in either device's log", async () => {
        expect((await check("chip-local", fabricSessionsEnded(2), [CHIP.expiring])).verdict).equal("pass");
        expect((await check("matterjs", fabricSessionsEnded(2), [MATTERJS.sessionEnded])).verdict).equal("pass");
    });

    it("does not take another fabric's session ending for the removed fabric's", async () => {
        expect((await check("matterjs", fabricSessionsEnded(1), [MATTERJS.sessionEnded])).verdict).equal("fail");
        expect((await check("chip-local", fabricSessionsEnded(1), [CHIP.expiring])).verdict).equal("fail");
    });

    it("does not take fabric 20's session ending for fabric 2's", async () => {
        const fabric20 = MATTERJS.sessionEnded.replace("@2:", "@20:");

        expect((await check("matterjs", fabricSessionsEnded(2), [fabric20])).verdict).equal("fail");
    });

    it("does not take a PASE session ending for a removed fabric's", async () => {
        const unsecured = "2026-08-23 22:41:11.220 INFO Session •unsecured#7372af0fa8e6f033 Session ended";

        expect((await check("matterjs", fabricSessionsEnded(2), [unsecured])).verdict).equal("fail");
    });
});

describe("TC-CADMIN-1.17's post-removal refusal predicate", () => {
    // The messages both controllers rejected step 8's write/read with, captured across all six CI legs
    it("accepts the refusals a removed fabric's controller actually produces", () => {
        expect(
            isPostRemovalRefusal(
                new NoCommissionedPeerError('Controller "th_cr2" has no commissioned peer with node id 1'),
            ),
        ).equal(true);
        expect(
            isPostRemovalRefusal(
                new ChipToolCommandError('chip-tool write {"endpoint":0,"cluster":40,"attribute":5} failed'),
            ),
        ).equal(true);
    });

    it("accepts a status the device answered with", () => {
        expect(isPostRemovalRefusal(new StatusResponseError("writeAttribute failed", Status.UnsupportedAccess))).equal(
            true,
        );
    });

    it("accepts a failed connection to a device that no longer serves the fabric", () => {
        expect(isPostRemovalRefusal(new PeerCommunicationError("Cannot establish a session"))).equal(true);
    });

    it("does not accept a controller that could not run or was asked wrongly", () => {
        expect(isPostRemovalRefusal(new ChipToolStartupError("chip-tool did not start"))).equal(false);
        expect(isPostRemovalRefusal(new ImplementationError("writeAttribute requires a concrete path"))).equal(false);
        expect(isPostRemovalRefusal(new Error("spawn ENOENT"))).equal(false);
        expect(isPostRemovalRefusal(undefined)).equal(false);
    });
});

describe("TC-CADMIN-1.17's RemoveFabric response check", () => {
    // The NOCResponse both device implementations answer step 7's RemoveFabric with, as both
    // adapters decode it (chip-tool: "NOCResponse: { statusCode: 0, fabricIndex: 2 }")
    it("passes the captured success response", () => {
        expect(removeFabricResponseFailure({ statusCode: 0, fabricIndex: 2 }, 2)).equal(undefined);
    });

    it("passes a success response that omits fabricIndex", () => {
        expect(removeFabricResponseFailure({ statusCode: 0 }, 2)).equal(undefined);
    });

    it("names a failure statusCode", () => {
        expect(removeFabricResponseFailure({ statusCode: 11, fabricIndex: 2 }, 2)).match(/statusCode is 11, not Ok/);
    });

    it("names a response for a different fabric", () => {
        expect(removeFabricResponseFailure({ statusCode: 0, fabricIndex: 3 }, 2)).match(
            /fabricIndex 3, not the removed 2/,
        );
    });

    it("names a response with no NOCResponse shape", () => {
        expect(removeFabricResponseFailure(undefined, 2)).match(/expected a NOCResponse/);
        expect(removeFabricResponseFailure({ status: 0 }, 2)).match(/expected a NOCResponse/);
    });
});

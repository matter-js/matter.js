/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, Millis } from "@matter/main";
import {
    CommissioningError,
    DeviceAlreadyCommissionedToThisFabricError,
    PeerCommunicationError,
} from "@matter/main/protocol";
import { Status, StatusResponseError, ValidationError } from "@matter/main/types";
import type { CheckRecord, LogExpectPatterns, LogFlavor } from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { NoCommissionedPeerError } from "../../src/cert/InProcessControllerAdapter.js";
import { ChipToolStartupError } from "../../src/chip-tool/chip-tool-client.js";
import { MatterServerCommandError } from "../../src/matter-server/matter-server-client.js";
import {
    ADD_NOC_FABRIC_CONFLICT,
    COMMISSIONING_COMPLETE,
    eitherNoRecordOrNoPase,
    expectNoDeviceLog,
    isFabricConflictRefusal,
    isPostRemovalRefusal,
    messageReceivedOnFabric,
    PASE_ESTABLISHED,
    removeFabricResponseFailure,
    WINDOW_CLOSED,
    WINDOW_OPEN,
    withDashesAndSpaces,
} from "../cert/tc-cadmin-support.js";
import { expectDeviceLog } from "../cert/tc-support.js";

// Lines captured from real TC-CADMIN-1.1 and 1.17 runs against each device flavor.
const CHIP = {
    commissioned: "[1787433099.093] [23362:73430237:chip] [SVR] Commissioning completed successfully",
    windowOpen: "[1787433099.731] [23362:73430237:chip] [ZCL] Commissioning window is now open",
    windowClosed: "[1792600312.351] [68466:50592886:chip] [SVR] Closing pairing window",
    paseEstablished: "[1792600297.630] [68466:50591055:chip] [SVR] Commissioning completed session establishment step",
    fabricConflict:
        "[1792600524.376] [68466:50598627:chip] [ZCL] OpCreds: Failed AddNOC request (err=src/credentials/FabricTable.cpp:1746: " +
        "CHIP Error 0x0000007E: Trying to add a NOC for a fabric that already exists) with OperationalCert error 9",
    rxFabric1:
        "[1792600297.843] [68466:50591150:chip] [EM] >>> [E:60111r S:26043 M:172517593 (Ack:208146301)] (S) Msg RX from " +
        "1:FFFFFFFB00000000 [E38B] to 0000000000000000 --- Type 0000:10 (SecureChannel:StandaloneAck) (B:34)",
};

const MATTERJS = {
    commissioned:
        "2026-08-23 22:41:11.299 NOTICE GeneralCommissioningClusterHandler Commissioned fabric: 0670b2d454b688b9 (#1) node: 0000000000000001",
    windowOpen:
        "2026-08-23 22:41:11.766 DEBUG AdministratorCommissioningServer Commissioning window opened for 3m by fabric 1",
    windowClosed: "2026-10-21 18:56:15.576 DEBUG AdministratorCommissioningServer Commissioning window closed",
    paseEstablished:
        "2026-10-21 18:56:15.111 INFO PaseServer @0:0•f55f New session with udp://[fe80::1c9d:1982:6732:a4a7%en0]:53541 3↔2",
    fabricConflict:
        "2026-10-21 18:59:46.126 INFO ProtocolService Invoke » binford-6100-cert.operationalCredentials.addNoc " +
        "@0:0•f563⇵ece1✉09f194c1 statusCode: 9 debugText: Fabric with Id 4090405572962530633 and Node Id 2 already exists.",
    rxFabric2:
        "2026-10-21 18:56:15.569 DEBUG MessageExchange Message « for: SC/StandaloneAck id: @2:0•f561⇵197a✉0beadd62 type: " +
        "0x0/0x10 acked: 09508de4",
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
});

describe("TC-CADMIN-1.1's device-log patterns", () => {
    it("finds a closed commissioning window in either device's log", async () => {
        expect((await check("chip-local", WINDOW_CLOSED, [CHIP.windowClosed])).verdict).equal("pass");
        expect((await check("matterjs", WINDOW_CLOSED, [MATTERJS.windowClosed])).verdict).equal("pass");
    });

    it("does not take an opened window for a closed one", async () => {
        expect((await check("chip-local", WINDOW_CLOSED, [CHIP.windowOpen])).verdict).equal("fail");
        expect((await check("matterjs", WINDOW_CLOSED, [MATTERJS.windowOpen])).verdict).equal("fail");
    });

    it("finds an accepted PASE session in either device's log", async () => {
        expect((await check("chip-local", PASE_ESTABLISHED, [CHIP.paseEstablished])).verdict).equal("pass");
        expect((await check("matterjs", PASE_ESTABLISHED, [MATTERJS.paseEstablished])).verdict).equal("pass");
    });

    it("finds the FabricConflict answer to AddNOC in either device's log", async () => {
        expect((await check("chip-local", ADD_NOC_FABRIC_CONFLICT, [CHIP.fabricConflict])).verdict).equal("pass");
        expect((await check("matterjs", ADD_NOC_FABRIC_CONFLICT, [MATTERJS.fabricConflict])).verdict).equal("pass");
    });

    it("does not take another AddNOC status for FabricConflict", async () => {
        const tableFull = CHIP.fabricConflict.replace(/error 9$/, "error 5");
        expect((await check("chip-local", ADD_NOC_FABRIC_CONFLICT, [tableFull])).verdict).equal("fail");
        const invalidNoc = MATTERJS.fabricConflict.replace("statusCode: 9", "statusCode: 98");
        expect((await check("matterjs", ADD_NOC_FABRIC_CONFLICT, [invalidNoc])).verdict).equal("fail");
    });

    it("attributes a received message to its fabric index only", async () => {
        expect((await check("chip-local", messageReceivedOnFabric(1), [CHIP.rxFabric1])).verdict).equal("pass");
        expect((await check("chip-local", messageReceivedOnFabric(11), [CHIP.rxFabric1])).verdict).equal("fail");
        const rxFabric11 = CHIP.rxFabric1.replace("from 1:", "from 11:");
        expect((await check("chip-local", messageReceivedOnFabric(1), [rxFabric11])).verdict).equal("fail");

        expect((await check("matterjs", messageReceivedOnFabric(2), [MATTERJS.rxFabric2])).verdict).equal("pass");
        expect((await check("matterjs", messageReceivedOnFabric(1), [MATTERJS.rxFabric2])).verdict).equal("fail");
        // matter.js names the fabric index in hex
        const rxFabric10 = MATTERJS.rxFabric2.replace("@2:", "@a:");
        expect((await check("matterjs", messageReceivedOnFabric(10), [rxFabric10])).verdict).equal("pass");
    });

    it("counts a message an existing exchange dropped on matter.js", async () => {
        // ExchangeManager's line for a message an exchange that is closing drops: the exchange's `via`, then the mark
        const dropped =
            "2026-10-21 18:56:15.570 DEBUG ExchangeManager @1:6041ed59591aef6f•c7df⇵f228 Ignore « message because " +
            "exchange is closing message: 0ee82143 protocol: 1 exId: f228 via: udp://[fe80::1]:5540";
        expect((await check("matterjs", messageReceivedOnFabric(1), [dropped])).verdict).equal("pass");
        expect((await check("matterjs", messageReceivedOnFabric(2), [dropped])).verdict).equal("fail");
    });
});

describe("TC-CADMIN-1.1's step 11 outcome", () => {
    const pass: CheckRecord = { type: "network", verdict: "pass", detail: "no record" };
    const fail: CheckRecord = { type: "network", verdict: "fail", detail: "a record" };

    it("passes when either the record is gone or the TH refused PASE", () => {
        expect(eitherNoRecordOrNoPase(pass, fail).verdict).equal("pass");
        expect(eitherNoRecordOrNoPase(fail, pass).verdict).equal("pass");
        expect(eitherNoRecordOrNoPase(undefined, pass).verdict).equal("pass");
    });

    it("fails when a record exists and the TH accepted PASE", () => {
        expect(eitherNoRecordOrNoPase(fail, fail).verdict).equal("fail");
        expect(eitherNoRecordOrNoPase(undefined, fail).verdict).equal("fail");
    });
});

describe("expectNoDeviceLog", () => {
    async function absent(flavor: LogFlavor, lines: string[], synthetic: string[] = []) {
        const source = new LineQueue();
        const follower = new LogFollower(source.follow(), "th");
        for (const text of lines) {
            source.push(text);
        }
        for (const text of synthetic) {
            follower.annotate(text);
        }
        try {
            return await expectNoDeviceLog(follower, flavor, PASE_ESTABLISHED, 0, Millis(0));
        } finally {
            source.close();
            await follower.close();
        }
    }

    it("passes when no line matches", async () => {
        expect((await absent("matterjs", [MATTERJS.windowClosed])).verdict).equal("pass");
    });

    it("fails on a matching line and names it", async () => {
        const result = await absent("matterjs", [MATTERJS.windowClosed, MATTERJS.paseEstablished]);
        expect(result.verdict).equal("fail");
        expect(result.matched).equal(MATTERJS.paseEstablished);
    });

    it("does not count a line the harness wrote", async () => {
        expect((await absent("matterjs", [], [MATTERJS.paseEstablished])).verdict).equal("pass");
    });

    it("fails when the log ended during the window", async () => {
        const source = new LineQueue();
        const follower = new LogFollower(source.follow(), "th");
        try {
            source.close();
            const result = await expectNoDeviceLog(follower, "matterjs", PASE_ESTABLISHED, 0, Millis(0));
            expect(result.verdict).equal("fail");
            expect(result.detail).match(/ended/);
        } finally {
            await follower.close();
        }
    });

    it("is unverified for a flavor without a pattern", async () => {
        expect((await absent("python-wrapped", [MATTERJS.paseEstablished])).verdict).equal("unverified");
    });

    it("ignores a matching line before `from`", async () => {
        const source = new LineQueue();
        const follower = new LogFollower(source.follow(), "th");
        try {
            source.push(MATTERJS.paseEstablished);
            const from = await follower.markSettled();
            source.push(MATTERJS.windowClosed);
            const result = await expectNoDeviceLog(follower, "matterjs", PASE_ESTABLISHED, from, Millis(0));
            expect(result.verdict).equal("pass");
        } finally {
            source.close();
            await follower.close();
        }
    });

    it("waits out the window for a line still on its way", async () => {
        const source = new LineQueue();
        const follower = new LogFollower(source.follow(), "th");
        try {
            setTimeout(() => source.push(MATTERJS.paseEstablished), 20);
            const result = await expectNoDeviceLog(follower, "matterjs", PASE_ESTABLISHED, 0, Millis(200));
            expect(result.verdict).equal("fail");
        } finally {
            source.close();
            await follower.close();
        }
    });
});

describe("TC-CADMIN-1.1's FabricConflict refusal predicate", () => {
    it("accepts the refusals the controllers report for the conflict", () => {
        expect(
            isFabricConflictRefusal(
                new DeviceAlreadyCommissionedToThisFabricError(
                    "Commission error: This device is already commissioned into this fabric.",
                ),
            ),
        ).equal(true);
        expect(isFabricConflictRefusal(new ChipToolCommandError("chip-tool commissioning of node 4098 failed"))).equal(
            true,
        );
    });

    it("does not accept another commissioning failure", () => {
        expect(isFabricConflictRefusal(new CommissioningError("Commissioning failed"))).equal(false);
        expect(isFabricConflictRefusal(new ChipToolStartupError("chip-tool did not start"))).equal(false);
        expect(isFabricConflictRefusal(undefined)).equal(false);
    });
});

describe("TC-CADMIN-1.1's manual code with dashes and spaces", () => {
    it("inserts a dash and a space between the code's digit groups", () => {
        expect(withDashesAndSpaces("34970112332")).equal("3497-011 2332");
    });

    it("refuses anything but an 11-digit code", () => {
        expect(() => withDashesAndSpaces("3497-011-2332")).throws(/11-digit/);
        expect(() => withDashesAndSpaces("749701123365521327694")).throws(/11-digit/);
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

    it("does not accept a status the removal does not explain", () => {
        expect(isPostRemovalRefusal(new StatusResponseError("writeAttribute failed", Status.ConstraintError))).equal(
            false,
        );
        expect(isPostRemovalRefusal(new StatusResponseError("writeAttribute failed", Status.InvalidCommand))).equal(
            false,
        );
    });

    it("accepts a failed connection to a device that no longer serves the fabric", () => {
        expect(isPostRemovalRefusal(new PeerCommunicationError("Cannot establish a session"))).equal(true);
    });

    it("does not accept a controller that could not run or was asked wrongly", () => {
        expect(isPostRemovalRefusal(new ChipToolStartupError("chip-tool did not start"))).equal(false);
        expect(isPostRemovalRefusal(new MatterServerCommandError("read", 3, "Node is not ready"))).equal(false);
        expect(isPostRemovalRefusal(new ImplementationError("writeAttribute requires a concrete path"))).equal(false);
        expect(isPostRemovalRefusal(new Error("spawn ENOENT"))).equal(false);
        expect(isPostRemovalRefusal(undefined)).equal(false);
    });

    it("does not accept the client's own encode-time rejection", () => {
        expect(isPostRemovalRefusal(new ValidationError("Value out of range", "nodeLabel"))).equal(false);
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

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Seconds } from "@matter/main";
import { DoorLock } from "@matter/main/clusters";
import { Matter } from "@matter/model";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import { type CommandArgs, commandPayload } from "./tc-command-payload.js";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs, sendCommand } from "./tc-support.js";

const DOOR_LOCK = Matter.clusters.require("DoorLock");

/** Both THs, chip's lock-app and matter.js's `LockTestInstance`, put the door lock on endpoint 1. */
const LOCK_ENDPOINT = 1;

/** The user steps 4 to 12 and 16 to 18 work with, added in the precondition step. */
const USER_INDEX = 1;

/** The user steps 13 to 15 add, read and clear. */
const SECOND_USER_INDEX = 2;

/** The first slot of each schedule kind; both THs support 10 per user (week and year day) and 10 holidays. */
const SCHEDULE_INDEX = 1;

/** 2030-01-01 and 2030-01-02, 00:00 UTC, as Unix-epoch seconds. */
const LOCAL_START_TIME = 1_893_456_000;
const LOCAL_END_TIME = 1_893_542_400;

/** A PIN within both THs' PIN length range of 6 to 8 digits. */
const PIN = Bytes.fromString("123456");

const PIN_CREDENTIAL = { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 };

/** SetUser arguments for `userIndex` as CHIP's worked commands send them, except that each user gets its own `userUniqueId`. */
function addUser(userIndex: number): CommandArgs {
    return {
        operationType: DoorLock.DataOperationType.Add,
        userIndex,
        userName: "xxx",
        userUniqueId: 6452 + userIndex,
        userStatus: DoorLock.UserStatus.OccupiedEnabled,
        userType: DoorLock.UserType.UnrestrictedUser,
        credentialRule: DoorLock.CredentialRule.Single,
    };
}

const commissioned = new CommissionedRefs();

/**
 * A step in which the DUT sends `command` with `args` to the TH's door lock, as a timed invoke where the command has
 * the timed quality, the TH answers with success and the TH's log shows exactly that payload; see {@link sendCommand}.
 */
function sendsLockCommand(command: string, args: CommandArgs): (cx: CertStepContext) => Promise<void> {
    const timed = DOOR_LOCK.commands.require(command).effectiveAccess.timed;
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(
            cx,
            ref,
            {
                cluster: DOOR_LOCK,
                endpoint: LOCK_ENDPOINT,
                command,
                args,
                options: timed ? { timedInteractionTimeoutMs: Seconds(2) } : undefined,
            },
            commandPayload(DOOR_LOCK, command, args),
        ),
    );
}

function received(command: string) {
    return `Test Harness receives the ${command} command from the DUT.`;
}

certTest("TC-DRLK-3.2", { plan: "door_lock_Cluster.adoc", pics: ["DRLK.C"], app: "lock" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step("0b", "Precondition: DUT adds a user to the TH.", sendsLockCommand("setUser", addUser(USER_INDEX)), {
        pics: "DRLK.C.F08 & DRLK.C.C1a.Tx",
        expected: "The TH holds the user that steps 4 to 12 need.",
    })
    .step(1, "DUT sends LockDoor command to TH.", sendsLockCommand("lockDoor", {}), {
        pics: "DRLK.C.C00.Tx",
        expected: received("LockDoor"),
    })
    .step(2, "DUT sends UnlockDoor command to TH.", sendsLockCommand("unlockDoor", {}), {
        pics: "DRLK.C.C01.Tx",
        expected: received("UnlockDoor"),
    })
    .step(3, "DUT sends UnlockWithTimeout command to TH.", sendsLockCommand("unlockWithTimeout", { timeout: 60 }), {
        pics: "DRLK.C.C03.Tx",
        expected: received("UnlockWithTimeout"),
    })
    .step(
        4,
        "DUT sends SetWeekDaySchedule command to TH.",
        sendsLockCommand("setWeekDaySchedule", {
            weekDayIndex: SCHEDULE_INDEX,
            userIndex: USER_INDEX,
            daysMask: { monday: true },
            startHour: 15,
            startMinute: 45,
            endHour: 16,
            endMinute: 55,
        }),
        { pics: "DRLK.C.F04 & DRLK.C.C0b.Tx", expected: received("SetWeekDaySchedule") },
    )
    .step(
        5,
        "DUT sends GetWeekDaySchedule command to TH.",
        sendsLockCommand("getWeekDaySchedule", { weekDayIndex: SCHEDULE_INDEX, userIndex: USER_INDEX }),
        { pics: "DRLK.C.F04 & DRLK.C.C0c.Tx", expected: received("GetWeekDaySchedule") },
    )
    .step(
        6,
        "DUT sends ClearWeekDaySchedule command to TH.",
        sendsLockCommand("clearWeekDaySchedule", { weekDayIndex: SCHEDULE_INDEX, userIndex: USER_INDEX }),
        { pics: "DRLK.C.F04 & DRLK.C.C0d.Tx", expected: received("ClearWeekDaySchedule") },
    )
    .step(
        7,
        "DUT sends SetYearDaySchedule command to TH.",
        sendsLockCommand("setYearDaySchedule", {
            yearDayIndex: SCHEDULE_INDEX,
            userIndex: USER_INDEX,
            localStartTime: LOCAL_START_TIME,
            localEndTime: LOCAL_END_TIME,
        }),
        { pics: "DRLK.C.F04 & DRLK.C.C0e.Tx", expected: received("SetYearDaySchedule") },
    )
    .step(
        8,
        "DUT sends GetYearDaySchedule command to TH.",
        sendsLockCommand("getYearDaySchedule", { yearDayIndex: SCHEDULE_INDEX, userIndex: USER_INDEX }),
        { pics: "DRLK.C.F04 & DRLK.C.C0f.Tx", expected: received("GetYearDaySchedule") },
    )
    .step(
        9,
        "DUT sends ClearYearDaySchedule command to TH.",
        sendsLockCommand("clearYearDaySchedule", { yearDayIndex: SCHEDULE_INDEX, userIndex: USER_INDEX }),
        { pics: "DRLK.C.F04 & DRLK.C.C10.Tx", expected: received("ClearYearDaySchedule") },
    )
    .step(
        10,
        "DUT sends Set Holiday Day Schedule command to TH.",
        sendsLockCommand("setHolidaySchedule", {
            holidayIndex: SCHEDULE_INDEX,
            localStartTime: LOCAL_START_TIME,
            localEndTime: LOCAL_END_TIME,
            operatingMode: DoorLock.OperatingMode.Normal,
        }),
        { pics: "DRLK.C.F04 & DRLK.C.C11.Tx", expected: received("SetHolidaySchedule") },
    )
    .step(
        11,
        "DUT sends Get Holiday Day Schedule command to TH.",
        sendsLockCommand("getHolidaySchedule", { holidayIndex: SCHEDULE_INDEX }),
        { pics: "DRLK.C.F04 & DRLK.C.C12.Tx", expected: received("GetHolidaySchedule") },
    )
    .step(
        12,
        "DUT sends Clear Holiday Day Schedule command to TH.",
        sendsLockCommand("clearHolidaySchedule", { holidayIndex: SCHEDULE_INDEX }),
        { pics: "DRLK.C.F04 & DRLK.C.C13.Tx", expected: received("ClearHolidaySchedule") },
    )
    .step(13, "DUT sends SetUser command to TH.", sendsLockCommand("setUser", addUser(SECOND_USER_INDEX)), {
        pics: "DRLK.C.F08 & DRLK.C.C1a.Tx",
        expected: received("SetUser"),
    })
    .step(14, "DUT sends GetUser to TH.", sendsLockCommand("getUser", { userIndex: SECOND_USER_INDEX }), {
        pics: "DRLK.C.F08 & DRLK.C.C1b.Tx",
        expected: received("GetUser"),
    })
    .step(15, "DUT sends ClearUser command to TH.", sendsLockCommand("clearUser", { userIndex: SECOND_USER_INDEX }), {
        pics: "DRLK.C.F08 & DRLK.C.C1d.Tx",
        expected: received("ClearUser"),
    })
    .step(
        16,
        "DUT sends SetCredential command to TH.",
        // Adding a credential to an existing user requires a null UserStatus and UserType (§ 5.2.10.20)
        sendsLockCommand("setCredential", {
            operationType: DoorLock.DataOperationType.Add,
            credential: PIN_CREDENTIAL,
            credentialData: PIN,
            userIndex: USER_INDEX,
            userStatus: null,
            userType: null,
        }),
        { pics: "DRLK.C.F08 & DRLK.C.C22.Tx", expected: received("SetCredential") },
    )
    .step(
        17,
        "DUT sends GetCredentialStatus to TH.",
        sendsLockCommand("getCredentialStatus", { credential: PIN_CREDENTIAL }),
        { pics: "DRLK.C.F08 & DRLK.C.C24.Tx", expected: received("GetCredentialStatus") },
    )
    .step(
        18,
        "DUT sends ClearCredential command to TH.",
        sendsLockCommand("clearCredential", { credential: PIN_CREDENTIAL }),
        { pics: "DRLK.C.F08 & DRLK.C.C26.Tx", expected: received("ClearCredential") },
    )
    .finalize(cx => commissioned.decommissionAll(cx));

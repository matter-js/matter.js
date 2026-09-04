/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoorLockBaseServer, DoorLockClient, DoorLockServer } from "#behaviors/door-lock";
import { DoorLockDevice } from "#devices/door-lock";
import { Endpoint } from "#endpoint/index.js";
import { Time } from "@matter/general";
import { FabricIndex, Status } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import { settled } from "../../node/node-helpers.js";

import CredentialRule = DoorLock.CredentialRule;
import CredentialType = DoorLock.CredentialType;
import LockType = DoorLock.LockType;
import OperatingMode = DoorLock.OperatingMode;
import OperationError = DoorLock.OperationError;
import UserStatus = DoorLock.UserStatus;
import UserType = DoorLock.UserType;

const TestDoorLockDevice = DoorLockDevice.with(DoorLockServer.with("User", "PinCredential"));

const lockState = {
    lockState: DoorLock.LockState.Locked,
    lockType: DoorLock.LockType.DeadBolt,
    actuatorEnabled: true,
    operatingMode: DoorLock.OperatingMode.Normal,
    wrongCodeEntryLimit: 3,
    userCodeTemporaryDisableTime: 10,
    numberOfTotalUsersSupported: 10,
    numberOfPinUsersSupported: 10,
    numberOfCredentialsSupportedPerUser: 5,
    minPinCodeLength: 4,
    maxPinCodeLength: 8,
    users: [
        {
            userIndex: 1,
            userName: "",
            userUniqueId: null,
            userStatus: DoorLock.UserStatus.OccupiedEnabled,
            userType: DoorLock.UserType.UnrestrictedUser,
            credentialRule: DoorLock.CredentialRule.Single,
            credentials: [],
            creatorFabricIndex: FabricIndex.NO_FABRIC,
            lastModifiedFabricIndex: FabricIndex.NO_FABRIC,
            expiringUserExpiresAt: null,
        },
    ],
};

async function createLock(overrides: Partial<typeof lockState> = {}) {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });
    const endpoint = await node.add(TestDoorLockDevice, { doorLock: { ...lockState, ...overrides } });
    return { node, endpoint, [Symbol.asyncDispose]: () => node.close() };
}

function pin(digits: string) {
    return new Uint8Array([...digits].map(d => d.charCodeAt(0)));
}

// ── Schedule / ExpiringUser fixtures ─────────────────────────────────────────
//
// These go through a commissioned client/server pair (real fabric, real Timed Invoke handshake) rather than
// `MockServerNode#online()`: unlockDoor writes the LockState attribute, which is read-only over the wire, and
// online()'s synthetic remote-actor session enforces that even for the command's own internal write.

const TestScheduledDoorLockServer = DoorLockBaseServer.with(
    "PinCredential",
    "User",
    "WeekDayAccessSchedules",
    "YearDayAccessSchedules",
);

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** The current instant, decomposed the way the server evaluates schedules against it. */
function currentLocal() {
    const now = new Date(Time.nowMs);
    return {
        dayName: DAY_NAMES[now.getDay()],
        hour: now.getHours(),
        epochS: Math.floor(
            Date.UTC(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                now.getHours(),
                now.getMinutes(),
                now.getSeconds(),
            ) / 1000,
        ),
    };
}

async function setUpScheduledLock(userIndex: number, doorLockState: Record<string, unknown>) {
    const site = new MockSite();
    const { controller, device } = await site.addCommissionedPair({
        device: {
            device: new Endpoint(DoorLockDevice.with(TestScheduledDoorLockServer), {
                id: "lock",
                doorLock: {
                    lockType: LockType.Other,
                    operatingMode: OperatingMode.Normal,
                    wrongCodeEntryLimit: 3,
                    userCodeTemporaryDisableTime: 10,
                    numberOfTotalUsersSupported: 10,
                    numberOfPinUsersSupported: 10,
                    numberOfWeekDaySchedulesSupportedPerUser: 10,
                    numberOfYearDaySchedulesSupportedPerUser: 10,
                    minPinCodeLength: 4,
                    maxPinCodeLength: 8,
                    credentials: [
                        {
                            credentialType: CredentialType.Pin,
                            credentialIndex: userIndex,
                            credentialData: pin("1234"),
                            creatorFabricIndex: FabricIndex(1),
                            lastModifiedFabricIndex: FabricIndex(1),
                        },
                    ],
                    ...doorLockState,
                },
            }),
        },
    } as any);

    const peer = controller.peers.get("peer1")!;
    const ep = peer.parts.get("ep1")!;
    const cmds = ep.commandsOf(DoorLockClient);
    const serverEp: any = (device as any).parts.get("lock")!;

    // The invoke response only ever carries a generic Failure status (IM strips the server-local message), so
    // denial reason is asserted via the LockOperationError event's operationError field instead.
    const operationErrors: DoorLock.OperationError[] = [];
    serverEp
        .eventsOf(TestScheduledDoorLockServer)
        .lockOperationError.on((e: { operationError: DoorLock.OperationError }) => {
            operationErrors.push(e.operationError);
        });

    return { site, device, cmds, serverEp, operationErrors };
}

function scheduledUserOf(serverEp: any, userIndex: number) {
    return (serverEp.state.doorLock as any).users.find((u: { userIndex: number }) => u.userIndex === userIndex);
}

/** Commands travel over the mock wire; their completion depends on retransmit/ack processing MockTime drives. */
function withMockTime<T>(promise: Promise<T>): Promise<T> {
    return MockTime.resolve(promise, { macrotasks: true });
}

function unlockScheduled(cmds: any) {
    return withMockTime(cmds.unlockDoor({ pinCode: pin("1234") }));
}

async function expectScheduledDenial(
    cmds: any,
    operationErrors: DoorLock.OperationError[],
    expected: DoorLock.OperationError,
) {
    operationErrors.length = 0;
    await expect(unlockScheduled(cmds)).rejected;
    expect(operationErrors).deep.equals([expected]);
}

describe("DoorLockServer", () => {
    before(() => {
        MockTime.init();
    });

    it("reports DUPLICATE when CredentialData duplicates another credential of the same CredentialType", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const first = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(first.status).equals(Status.Success);

            const duplicate = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 2 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(duplicate.status).equals(DoorLock.StatusCode.Duplicate);
        });
    });

    it("reports OCCUPIED when an Add operation targets an occupied CredentialIndex", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const first = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(first.status).equals(Status.Success);

            const occupied = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("5678"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(occupied.status).equals(DoorLock.StatusCode.Occupied);
        });
    });
    it("creates the user alongside the credential when no user index is given", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const added = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: null,
                userStatus: null,
                userType: null,
            });
            expect(added.status).equals(Status.Success);
            expect(added.userIndex).equals(2);

            const user = await doorLock.getUser({ userIndex: 2 });
            expect(user.userUniqueId).null;
            expect(user.userStatus).equals(DoorLock.UserStatus.OccupiedEnabled);
            expect(user.userType).equals(DoorLock.UserType.UnrestrictedUser);
            expect(user.credentials).deep.equals([{ credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 }]);
        });
    });

    it("reports OCCUPIED when no user slot remains for the new credential", async () => {
        await using lock = await createLock({ numberOfTotalUsersSupported: 1 });

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const exhausted = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: null,
                userStatus: null,
                userType: null,
            });
            expect(exhausted.status).equals(DoorLock.StatusCode.Occupied);

            const status = await doorLock.getCredentialStatus({
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
            });
            expect(status.credentialExists).false;
        });
    });

    it("refuses to create a programming user alongside a credential", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const refused = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: null,
                userStatus: null,
                userType: DoorLock.UserType.ProgrammingUser,
            });
            expect(refused.status).equals(Status.InvalidCommand);
        });
    });

    it("reports the next available credential index whatever the status", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });

            const duplicate = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 2 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(duplicate.status).equals(DoorLock.StatusCode.Duplicate);
            expect(duplicate.nextCredentialIndex).equals(3);

            const tooShort = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 2 },
                credentialData: pin("1"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(tooShort.status).equals(Status.InvalidCommand);
            expect(tooShort.nextCredentialIndex).equals(3);
        });
    });
    it("refuses a credential index beyond the supported count", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const refused = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 11 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(refused.status).equals(Status.InvalidCommand);

            // Nothing follows the last supported index, so there is no next index to report
            expect(refused.nextCredentialIndex).null;
        });
    });

    it("reports the next available credential index when modifying a credential", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });

            const modified = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Modify,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("5678"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(modified.status).equals(Status.Success);
            expect(modified.nextCredentialIndex).equals(2);
        });
    });
    it("refuses user fields when the credential joins an existing user", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const refused = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: DoorLock.UserStatus.OccupiedEnabled,
                userType: null,
            });
            expect(refused.status).equals(Status.InvalidCommand);
        });
    });

    it("refuses user fields when modifying a credential", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });

            const refusedStatus = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Modify,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("5678"),
                userIndex: 1,
                userStatus: DoorLock.UserStatus.OccupiedEnabled,
                userType: null,
            });
            expect(refusedStatus.status).equals(Status.InvalidCommand);

            const refusedType = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Modify,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("5678"),
                userIndex: 1,
                userStatus: null,
                userType: DoorLock.UserType.UnrestrictedUser,
            });
            expect(refusedType.status).equals(Status.InvalidCommand);
        });
    });
    it("stores the user status and type the request carries", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const added = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: null,
                userStatus: DoorLock.UserStatus.OccupiedDisabled,
                userType: DoorLock.UserType.NonAccessUser,
            });
            expect(added.status).equals(Status.Success);

            const user = await doorLock.getUser({ userIndex: 2 });
            expect(user.userStatus).equals(DoorLock.UserStatus.OccupiedDisabled);
            expect(user.userType).equals(DoorLock.UserType.NonAccessUser);
        });
    });

    it("modifies the programming PIN only as the specification states that use case", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const seeded = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.ProgrammingPin, credentialIndex: 0 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(seeded.status).equals(Status.Success);

            const modified = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Modify,
                credential: { credentialType: DoorLock.CredentialType.ProgrammingPin, credentialIndex: 0 },
                credentialData: pin("5678"),
                userIndex: null,
                userStatus: null,
                userType: DoorLock.UserType.ProgrammingUser,
            });
            expect(modified.status).equals(Status.Success);

            const withoutType = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Modify,
                credential: { credentialType: DoorLock.CredentialType.ProgrammingPin, credentialIndex: 0 },
                credentialData: pin("9012"),
                userIndex: null,
                userStatus: null,
                userType: null,
            });
            expect(withoutType.status).equals(Status.InvalidCommand);

            const seededPin = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("3456"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(seededPin.status).equals(Status.Success);

            const wrongCredentialType = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Modify,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("7890"),
                userIndex: null,
                userStatus: null,
                userType: DoorLock.UserType.ProgrammingUser,
            });
            expect(wrongCredentialType.status).equals(Status.InvalidCommand);
        });
    });

    it("reserves credential index 0 for the programming PIN", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const pinAtZero = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 0 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(pinAtZero.status).equals(Status.InvalidCommand);

            const pinAtMax = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 10 },
                credentialData: pin("5678"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(pinAtMax.status).equals(Status.Success);

            const pinPastMax = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 11 },
                credentialData: pin("6789"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(pinPastMax.status).equals(Status.InvalidCommand);

            const programmingPinElsewhere = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.ProgrammingPin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(programmingPinElsewhere.status).equals(Status.InvalidCommand);
        });
    });

    it("reports no next index for the programming PIN", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            const added = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.ProgrammingPin, credentialIndex: 0 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });
            expect(added.status).equals(Status.Success);
            expect(added.nextCredentialIndex).null;
        });
    });

    it("reports DUPLICATE ahead of a malformed user field", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: null,
                userType: null,
            });

            // The CHIP SDK scans for duplicates before it validates the user fields
            const both = await doorLock.setCredential({
                operationType: DoorLock.DataOperationType.Add,
                credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 2 },
                credentialData: pin("1234"),
                userIndex: 1,
                userStatus: DoorLock.UserStatus.OccupiedEnabled,
                userType: null,
            });
            expect(both.status).equals(DoorLock.StatusCode.Duplicate);
        });
    });
    it("refuses to store a user type Matter does not define", async () => {
        await using lock = await createLock();

        await lock.node.online({}, async agent => {
            const doorLock = lock.endpoint.agentFor(agent.context).doorLock;

            // The command's own constraint covers a request from a peer; this is the local caller's path
            let message: string | undefined;
            try {
                await doorLock.setCredential({
                    operationType: DoorLock.DataOperationType.Add,
                    credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 1 },
                    credentialData: pin("1234"),
                    userIndex: null,
                    userStatus: null,
                    userType: 99 as DoorLock.UserType,
                });
            } catch (e) {
                message = (e as Error).message;
            }
            expect(message).match(/does not define the enum value 99/);
        });
    });

    describe("schedule-restricted access (spec § 5.2.6.18.2, .3, .9)", () => {
        it("denies a WeekDayScheduleUser with no schedules configured", async () => {
            const { site, cmds, operationErrors } = await setUpScheduledLock(1, {
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.WeekDayScheduleUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            try {
                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);
            } finally {
                await site.close();
            }
        });

        it("denies a YearDayScheduleUser with no schedules configured", async () => {
            const { site, cmds, operationErrors } = await setUpScheduledLock(1, {
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.YearDayScheduleUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            try {
                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);
            } finally {
                await site.close();
            }
        });

        it("denies a ScheduleRestrictedUser with no schedules configured", async () => {
            const { site, cmds, operationErrors } = await setUpScheduledLock(1, {
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.ScheduleRestrictedUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            try {
                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);
            } finally {
                await site.close();
            }
        });

        it("grants a WeekDayScheduleUser inside a matching schedule and denies outside it", async () => {
            const { dayName, hour } = currentLocal();
            const otherDay = DAY_NAMES[(DAY_NAMES.indexOf(dayName) + 1) % 7];

            const { site, cmds, operationErrors } = await setUpScheduledLock(1, {
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.WeekDayScheduleUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
                weekDaySchedules: [
                    {
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [otherDay]: true },
                        startHour: 0,
                        startMinute: 0,
                        endHour: 23,
                        endMinute: 59,
                    },
                ],
            });
            try {
                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);

                await withMockTime(
                    cmds.setWeekDaySchedule({
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [dayName]: true },
                        startHour: hour,
                        startMinute: 0,
                        endHour: hour,
                        endMinute: 59,
                    }),
                );

                await unlockScheduled(cmds);
            } finally {
                await site.close();
            }
        });

        it("grants a YearDayScheduleUser inside a matching time window and denies outside it", async () => {
            const { epochS } = currentLocal();

            const { site, cmds, operationErrors } = await setUpScheduledLock(1, {
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.YearDayScheduleUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
                yearDaySchedules: [
                    {
                        yearDayIndex: 1,
                        userIndex: 1,
                        localStartTime: epochS - 7200,
                        localEndTime: epochS - 3600,
                    },
                ],
            });
            try {
                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);

                await withMockTime(
                    cmds.setYearDaySchedule({
                        yearDayIndex: 1,
                        userIndex: 1,
                        localStartTime: epochS - 60,
                        localEndTime: epochS + 3600,
                    }),
                );

                await unlockScheduled(cmds);
            } finally {
                await site.close();
            }
        });

        it("requires both WeekDay AND YearDay schedules to match for a ScheduleRestrictedUser once both are set", async () => {
            const { dayName, hour, epochS } = currentLocal();
            const otherDay = DAY_NAMES[(DAY_NAMES.indexOf(dayName) + 1) % 7];

            const { site, cmds, operationErrors } = await setUpScheduledLock(1, {
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.ScheduleRestrictedUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
                // WeekDay matches now, YearDay does not -- spec requires both to match once both are configured.
                weekDaySchedules: [
                    {
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [dayName]: true },
                        startHour: hour,
                        startMinute: 0,
                        endHour: hour,
                        endMinute: 59,
                    },
                ],
                yearDaySchedules: [
                    {
                        yearDayIndex: 1,
                        userIndex: 1,
                        localStartTime: epochS - 7200,
                        localEndTime: epochS - 3600,
                    },
                ],
            });
            try {
                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);

                await withMockTime(
                    cmds.setYearDaySchedule({
                        yearDayIndex: 1,
                        userIndex: 1,
                        localStartTime: epochS - 60,
                        localEndTime: epochS + 3600,
                    }),
                );

                await unlockScheduled(cmds);

                // WeekDay set to a day other than today: denies again even though YearDay still matches.
                await withMockTime(
                    cmds.setWeekDaySchedule({
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [otherDay]: true },
                        startHour: 0,
                        startMinute: 0,
                        endHour: 23,
                        endMinute: 59,
                    }),
                );

                await expectScheduledDenial(cmds, operationErrors, OperationError.Restricted);
            } finally {
                await site.close();
            }
        });
    });

    describe("ExpiringUser timeout (spec § 5.2.6.18.8)", () => {
        it("keeps granting access before the timeout elapses", async () => {
            const { site, cmds, serverEp } = await setUpScheduledLock(1, {
                expiringUserTimeout: 5,
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.ExpiringUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            try {
                await unlockScheduled(cmds);
                await MockTime.advance(60_000); // 1 of 5 minutes elapsed
                await unlockScheduled(cmds);
                expect(scheduledUserOf(serverEp, 1).userStatus).equals(UserStatus.OccupiedEnabled);
            } finally {
                await site.close();
            }
        });

        it("auto-disables the user once ExpiringUserTimeout minutes elapse after first use, with no further access attempt", async () => {
            const { site, device, cmds, serverEp, operationErrors } = await setUpScheduledLock(1, {
                expiringUserTimeout: 1,
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.ExpiringUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            try {
                await unlockScheduled(cmds);
                expect(scheduledUserOf(serverEp, 1).userStatus).equals(UserStatus.OccupiedEnabled);

                await MockTime.advance(70_000);
                await settled(device);

                // The timer disables the user on its own -- no unlock attempt needed to observe the transition.
                expect(scheduledUserOf(serverEp, 1).userStatus).equals(UserStatus.OccupiedDisabled);
                await expectScheduledDenial(cmds, operationErrors, OperationError.DisabledUserDenied);
            } finally {
                await site.close();
            }
        });

        it("does not arm the timeout before the first successful use", async () => {
            const { site, cmds, serverEp } = await setUpScheduledLock(1, {
                expiringUserTimeout: 1,
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.ExpiringUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            try {
                await MockTime.advance(70_000);
                expect(scheduledUserOf(serverEp, 1).userStatus).equals(UserStatus.OccupiedEnabled);
                await unlockScheduled(cmds);
            } finally {
                await site.close();
            }
        });

        it("re-arms and honors an already-elapsed deadline loaded from nonvolatile storage (simulated restart)", async () => {
            const { epochS } = currentLocal();
            const { site, serverEp } = await setUpScheduledLock(1, {
                expiringUserTimeout: 1,
                users: [
                    {
                        userIndex: 1,
                        userName: "",
                        userUniqueId: null,
                        userStatus: UserStatus.OccupiedEnabled,
                        userType: UserType.ExpiringUser,
                        credentialRule: CredentialRule.Single,
                        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                        // Deadline already in the past, as if loaded from storage after a reboot.
                        expiringUserExpiresAt: epochS - 3600,
                    },
                ],
            });
            try {
                expect(scheduledUserOf(serverEp, 1).userStatus).equals(UserStatus.OccupiedDisabled);
            } finally {
                await site.close();
            }
        });
    });
});

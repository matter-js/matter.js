/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoorLockBaseServer, DoorLockClient, DoorLockServer, LockSchedule } from "#behaviors/door-lock";
import { DoorLockDevice } from "#devices/door-lock";
import { Endpoint } from "#endpoint/index.js";
import { ServerNode } from "#node/ServerNode.js";
import { Hours, Minutes, Seconds, Time, Timestamp } from "@matter/general";
import { ClusterId, CommandId, EndpointNumber, FabricIndex, Status, TlvOfModel } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import { interaction, settled } from "../../node/node-helpers.js";

import CredentialRule = DoorLock.CredentialRule;
import CredentialType = DoorLock.CredentialType;
import LockType = DoorLock.LockType;
import OperatingMode = DoorLock.OperatingMode;
import OperationError = DoorLock.OperationError;
import UserStatus = DoorLock.UserStatus;
import UserType = DoorLock.UserType;

const SetCredential = DoorLock.schema.commands.require("SetCredential");
const TlvSetCredentialRequest = TlvOfModel(SetCredential);
const TlvSetCredentialResponse = TlvOfModel(DoorLock.schema.commands.require("SetCredentialResponse"));

/** The status a SetCredentialResponse states, for a payload decoded without its type */
function statusOf(payload: unknown) {
    if (typeof payload === "object" && payload !== null && "status" in payload) {
        const { status } = payload;
        if (typeof status === "number") {
            return status;
        }
    }
}

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
// These run over a commissioned pair: an actor from MockServerNode#online() cannot write LockState, even inside the
// unlockDoor handler.

const TestScheduledDoorLockServer = DoorLockBaseServer.with(
    "PinCredential",
    "User",
    "WeekDayAccessSchedules",
    "YearDayAccessSchedules",
);

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** The current instant, decomposed the way the server evaluates schedules against it */
function currentLocal() {
    const now = new Date(Time.nowMs);
    return {
        dayName: DAY_NAMES[now.getDay()],
        hour: now.getHours(),
        epochS: LockSchedule.localInstant(now).epochS,
    };
}

function scheduledUser(userType: UserType, expiringUserExpiresAt: Timestamp | null = null) {
    return {
        userIndex: 1,
        userName: "",
        userUniqueId: null,
        userStatus: UserStatus.OccupiedEnabled,
        userType,
        credentialRule: CredentialRule.Single,
        credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
        creatorFabricIndex: FabricIndex(1),
        lastModifiedFabricIndex: FabricIndex(1),
        expiringUserExpiresAt,
    };
}

async function setUpScheduledLock(doorLockState: {
    users: ReturnType<typeof scheduledUser>[];
    weekDaySchedules?: LockSchedule.WeekDay[];
    yearDaySchedules?: LockSchedule.YearDay[];
    expiringUserTimeout?: number;
}) {
    const lock = new Endpoint(DoorLockDevice.with(TestScheduledDoorLockServer), {
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
                    credentialIndex: 1,
                    credentialData: pin("1234"),
                    creatorFabricIndex: FabricIndex(1),
                    lastModifiedFabricIndex: FabricIndex(1),
                },
            ],
            ...doorLockState,
        },
    });

    const site = new MockSite();
    const { controller, device } = await site.addCommissionedPair({
        device: { type: ServerNode.RootEndpoint, device: lock },
    });
    const cmds = controller.peers.get("peer1")!.parts.get("ep1")!.commandsOf(DoorLockClient);

    // The invoke response carries only a generic Failure, so the denial reason comes from LockOperationError
    const operationErrors = new Array<DoorLock.OperationError>();
    lock.events.doorLock.lockOperationError.on(({ operationError }) => {
        operationErrors.push(operationError);
    });

    const userChanges = new Array<DoorLock.LockUserChangeEvent>();
    lock.events.doorLock.lockUserChange.on(event => {
        userChanges.push(event);
    });

    return { site, device, lock, cmds, operationErrors, userChanges };
}

type ScheduledLock = Awaited<ReturnType<typeof setUpScheduledLock>>;

function userStatusOf({ lock }: ScheduledLock) {
    return lock.state.doorLock.users.find(user => user.userIndex === 1)?.userStatus;
}

/** Commands travel over the mock wire; their completion depends on retransmit/ack processing MockTime drives */
function withMockTime<T>(promise: Promise<T>): Promise<T> {
    return MockTime.resolve(promise, { macrotasks: true });
}

function unlockScheduled({ cmds }: ScheduledLock) {
    return withMockTime(cmds.unlockDoor({ pinCode: pin("1234") }));
}

async function expectScheduledDenial(lock: ScheduledLock, expected: DoorLock.OperationError) {
    lock.operationErrors.length = 0;
    await expect(unlockScheduled(lock)).rejected;
    expect(lock.operationErrors).deep.equals([expected]);
}

function modifyUser({ cmds }: ScheduledLock, change: { userName?: string; userStatus?: UserStatus }) {
    return withMockTime(
        cmds.setUser({
            operationType: DoorLock.DataOperationType.Modify,
            userIndex: 1,
            userName: change.userName ?? null,
            userUniqueId: null,
            userStatus: change.userStatus ?? null,
            userType: null,
            credentialRule: null,
        }),
    );
}

describe("DoorLockServer", () => {
    before(() => {
        MockTime.init();
    });

    it("refuses SetCredential naming an OperationType its constraint omits", async () => {
        await using lock = await createLock();

        // The request creates its own user, so it does not depend on a seeded record any particular fabric owns
        async function setCredentialOverTheWire(operationType: DoorLock.DataOperationType) {
            let interactionStatus: number | undefined;
            let payloadStatus: undefined | number;

            await interaction.invoke(
                lock.node,
                await lock.node.addFabric(),
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(DoorLock.Complete.id),
                        commandId: CommandId(SetCredential.id ?? 0),
                    },
                    commandFields: TlvSetCredentialRequest.encodeTlv({
                        operationType,
                        credential: { credentialType: DoorLock.CredentialType.Pin, credentialIndex: 2 },
                        credentialData: pin("9876"),
                        userIndex: null,
                        userStatus: null,
                        userType: null,
                    }),
                },
                response => {
                    interactionStatus = response.status?.status?.status;
                    const fields = response.command?.commandFields;
                    if (fields !== undefined) {
                        payloadStatus = statusOf(TlvSetCredentialResponse.decodeTlv(fields));
                    }
                },
                { timed: true },
            );

            return { interactionStatus, payloadStatus };
        }

        const cleared = await setCredentialOverTheWire(DoorLock.DataOperationType.Clear);
        expect(cleared.interactionStatus).equals(Status.InvalidCommand);
        expect(cleared.payloadStatus).equals(undefined);

        const added = await setCredentialOverTheWire(DoorLock.DataOperationType.Add);
        expect(added.interactionStatus).equals(undefined);
        expect(added.payloadStatus).equals(Status.Success);
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
        for (const userType of [
            UserType.WeekDayScheduleUser,
            UserType.YearDayScheduleUser,
            UserType.ScheduleRestrictedUser,
        ]) {
            it(`denies a ${UserType[userType]} with no schedules configured`, async () => {
                const lock = await setUpScheduledLock({ users: [scheduledUser(userType)] });
                try {
                    await expectScheduledDenial(lock, OperationError.Restricted);
                } finally {
                    await lock.site.close();
                }
            });
        }

        it("grants a WeekDayScheduleUser inside a matching schedule and denies outside it", async () => {
            const { dayName, hour } = currentLocal();
            const otherDay = DAY_NAMES[(DAY_NAMES.indexOf(dayName) + 1) % 7];

            const lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.WeekDayScheduleUser)],
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
                await expectScheduledDenial(lock, OperationError.Restricted);

                await withMockTime(
                    lock.cmds.setWeekDaySchedule({
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [dayName]: true },
                        startHour: hour,
                        startMinute: 0,
                        endHour: 23,
                        endMinute: 59,
                    }),
                );

                await unlockScheduled(lock);
            } finally {
                await lock.site.close();
            }
        });

        it("grants a YearDayScheduleUser inside a matching time window and denies outside it", async () => {
            const { epochS } = currentLocal();

            const lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.YearDayScheduleUser)],
                yearDaySchedules: [
                    { yearDayIndex: 1, userIndex: 1, localStartTime: epochS - 7200, localEndTime: epochS - 3600 },
                ],
            });
            try {
                await expectScheduledDenial(lock, OperationError.Restricted);

                await withMockTime(
                    lock.cmds.setYearDaySchedule({
                        yearDayIndex: 1,
                        userIndex: 1,
                        localStartTime: epochS - 60,
                        localEndTime: epochS + 3600,
                    }),
                );

                await unlockScheduled(lock);
            } finally {
                await lock.site.close();
            }
        });

        it("requires both WeekDay AND YearDay schedules to match for a ScheduleRestrictedUser once both are set", async () => {
            const { dayName, hour, epochS } = currentLocal();
            const otherDay = DAY_NAMES[(DAY_NAMES.indexOf(dayName) + 1) % 7];

            const lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.ScheduleRestrictedUser)],
                weekDaySchedules: [
                    {
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [dayName]: true },
                        startHour: hour,
                        startMinute: 0,
                        endHour: 23,
                        endMinute: 59,
                    },
                ],
                yearDaySchedules: [
                    { yearDayIndex: 1, userIndex: 1, localStartTime: epochS - 7200, localEndTime: epochS - 3600 },
                ],
            });
            try {
                await expectScheduledDenial(lock, OperationError.Restricted);

                await withMockTime(
                    lock.cmds.setYearDaySchedule({
                        yearDayIndex: 1,
                        userIndex: 1,
                        localStartTime: epochS - 60,
                        localEndTime: epochS + 3600,
                    }),
                );

                await unlockScheduled(lock);

                await withMockTime(
                    lock.cmds.setWeekDaySchedule({
                        weekDayIndex: 1,
                        userIndex: 1,
                        daysMask: { [otherDay]: true },
                        startHour: 0,
                        startMinute: 0,
                        endHour: 23,
                        endMinute: 59,
                    }),
                );

                await expectScheduledDenial(lock, OperationError.Restricted);
            } finally {
                await lock.site.close();
            }
        });

        describe("week day window bounds", () => {
            function weekDayAccess(start: [number, number], end: [number, number], at: [number, number]) {
                return LockSchedule.isAccessGranted(
                    UserType.WeekDayScheduleUser,
                    1,
                    [
                        {
                            weekDayIndex: 1,
                            userIndex: 1,
                            daysMask: { monday: true },
                            startHour: start[0],
                            startMinute: start[1],
                            endHour: end[0],
                            endMinute: end[1],
                        },
                    ],
                    [],
                    { epochS: 0, minuteOfDay: at[0] * 60 + at[1], dayOfWeek: "monday" },
                );
            }

            it("includes the start minute and excludes the end minute", () => {
                expect(weekDayAccess([8, 0], [17, 30], [7, 59])).false;
                expect(weekDayAccess([8, 0], [17, 30], [8, 0])).true;
                expect(weekDayAccess([8, 0], [17, 30], [17, 29])).true;
                expect(weekDayAccess([8, 0], [17, 30], [17, 30])).false;
            });

            it("includes the whole of 23:59 when the window ends there", () => {
                expect(weekDayAccess([8, 0], [23, 59], [23, 59])).true;
            });
        });
    });

    describe("ExpiringUser timeout (spec § 5.2.6.18.8)", () => {
        it("keeps granting access before the timeout elapses", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 5,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await unlockScheduled(lock);
                await MockTime.advance(60_000);
                await unlockScheduled(lock);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);
            } finally {
                await lock.site.close();
            }
        });

        it("disables the user when the timeout elapses after first use, without a further access attempt", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await unlockScheduled(lock);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);

                lock.userChanges.length = 0;
                await MockTime.advance(70_000);
                await settled(lock.device);

                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
                expect(lock.userChanges).deep.equals([
                    {
                        lockDataType: DoorLock.LockDataType.UserIndex,
                        dataOperationType: DoorLock.DataOperationType.Modify,
                        operationSource: DoorLock.OperationSource.Unspecified,
                        userIndex: 1,
                        fabricIndex: null,
                        sourceNode: null,
                        dataIndex: null,
                    },
                ]);
                await expectScheduledDenial(lock, OperationError.DisabledUserDenied);
            } finally {
                await lock.site.close();
            }
        });

        it("does not arm the timeout before the first successful use", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await MockTime.advance(70_000);
                await settled(lock.device);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);
                await unlockScheduled(lock);
            } finally {
                await lock.site.close();
            }
        });

        it("keeps the deadline when a modification changes neither status nor type", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await unlockScheduled(lock);
                await MockTime.advance(30_000);
                await modifyUser(lock, { userName: "renamed" });

                await MockTime.advance(40_000);
                await settled(lock.device);

                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
            } finally {
                await lock.site.close();
            }
        });

        it("starts a new cycle when an expired user is enabled again", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await unlockScheduled(lock);
                await MockTime.advance(70_000);
                await settled(lock.device);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);

                await modifyUser(lock, { userStatus: UserStatus.OccupiedEnabled });
                await unlockScheduled(lock);
                await MockTime.advance(30_000);
                await settled(lock.device);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);

                await MockTime.advance(40_000);
                await settled(lock.device);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
            } finally {
                await lock.site.close();
            }
        });

        it("denies once the wall clock passes the deadline, before the timer fires", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await unlockScheduled(lock);

                MockTime.stepWallClock(Minutes(2));
                try {
                    await expectScheduledDenial(lock, OperationError.DisabledUserDenied);
                } finally {
                    MockTime.stepWallClock(Minutes(-2));
                }
            } finally {
                await lock.site.close();
            }
        });

        it("re-arms for the remaining time when the timer fires early after the wall clock stepped back", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            try {
                await unlockScheduled(lock);

                MockTime.stepWallClock(Seconds(-30));
                try {
                    await MockTime.advance(Seconds(65));
                    await settled(lock.device);
                    expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);

                    await MockTime.advance(Seconds(30));
                    await settled(lock.device);
                    expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
                } finally {
                    MockTime.stepWallClock(Seconds(30));
                }
            } finally {
                await lock.site.close();
            }
        });

        it("disables at startup a user whose stored deadline has passed", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser, Timestamp(Time.nowMs - Minutes(1)))],
            });
            try {
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
            } finally {
                await lock.site.close();
            }
        });

        it("disables a user when a deadline that was still pending at startup passes", async () => {
            const lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser, Timestamp(Time.nowMs + Hours(1)))],
            });
            try {
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);

                await MockTime.advance(3_610_000);
                await settled(lock.device);

                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
            } finally {
                await lock.site.close();
            }
        });
    });
});

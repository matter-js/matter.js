/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DoorLockBaseServer,
    DoorLockClient,
    DoorLockServer,
    LockAuth,
    LockOperationFailedError,
    LockSchedule,
} from "#behaviors/door-lock";
import { DoorLockDevice } from "#devices/door-lock";
import { Endpoint } from "#endpoint/index.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    Days,
    Hours,
    ImplementationError,
    MatterAggregateError,
    Minutes,
    Seconds,
    Time,
    Timestamp,
} from "@matter/general";
import { interaction, MockServerNode, MockSite, settled } from "@matter/node/testing";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    FabricIndex,
    Status,
    StatusResponseError,
    TlvOfModel,
} from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";

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
    "CredentialOverTheAirAccess",
    "Unbolting",
    "WeekDayAccessSchedules",
    "YearDayAccessSchedules",
    "HolidaySchedules",
);

interface TestHardware {
    calls: (DoorLockBaseServer.LockOperation & { lockState: DoorLock.LockState | null })[];
    failure?: Error;

    /** Holds every lock operation until resolved */
    gate?: Promise<void>;
    release?: () => void;

    /** Resolves on the next lock operation the hardware receives */
    called?: () => void;
}

/** Stands in for lock hardware; each test's lock starts with a fresh one */
const hardware: TestHardware = { calls: [] };

/** Holds lock operations at the hardware until the returned function is called */
function holdHardware() {
    hardware.gate = new Promise(resolve => (hardware.release = resolve));
    return () => hardware.release?.();
}

/** Resolves once the hardware receives its next lock operation */
function nextHardwareCall() {
    return withMockTime(new Promise<void>(resolve => (hardware.called = resolve)));
}

class TestHardwareDoorLockServer extends TestScheduledDoorLockServer {
    override async handleLockOperation(operation: DoorLockBaseServer.LockOperation) {
        hardware.calls.push({ ...operation, lockState: this.state.lockState });
        hardware.called?.();
        await hardware.gate;
        if (hardware.failure) {
            throw hardware.failure;
        }
    }
}

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

async function setUpScheduledLock(doorLockState: Partial<DoorLockBaseServer.State> & { users: LockAuth.User[] }) {
    hardware.calls = [];
    hardware.failure = hardware.gate = hardware.release = hardware.called = undefined;

    const lock = new Endpoint(DoorLockDevice.with(TestHardwareDoorLockServer), {
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
            numberOfHolidaySchedulesSupported: 10,
            numberOfCredentialsSupportedPerUser: 5,
            requirePinForRemoteOperation: false,
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
    let pair;
    try {
        pair = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint, device: lock } });
    } catch (e) {
        await site.close();
        throw e;
    }
    const { controller, device } = pair;
    const peer = controller.peers.get("peer1")!;
    const cmds = peer.parts.get("ep1")!.commandsOf(DoorLockClient);

    const errorEvents = new Array<DoorLock.LockOperationErrorEvent>();
    lock.events.doorLock.lockOperationError.on(event => {
        errorEvents.push(event);
    });

    const userChanges = new Array<DoorLock.LockUserChangeEvent>();
    lock.events.doorLock.lockUserChange.on(event => {
        userChanges.push(event);
    });

    const operations = new Array<DoorLock.LockOperationEvent>();
    lock.events.doorLock.lockOperation.on(event => {
        operations.push(event);
    });

    const alarms = new Array<DoorLock.AlarmCode>();
    lock.events.doorLock.doorLockAlarm.on(({ alarmCode }) => {
        alarms.push(alarmCode);
    });

    return {
        site,
        device,
        lock,
        peer,
        cmds,
        errorEvents,
        userChanges,
        operations,
        alarms,
        [Symbol.asyncDispose]: async () => {
            // A test that fails while it holds the hardware would otherwise leave close waiting on the held command
            hardware.release?.();
            await site.close();
        },
    };
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

/** The invoke response carries only a generic Failure, so the denial reason comes from LockOperationError */
function operationErrorsOf({ errorEvents }: ScheduledLock) {
    return errorEvents.map(({ operationError }) => operationError);
}

async function expectScheduledDenial(lock: ScheduledLock, expected: DoorLock.OperationError) {
    lock.errorEvents.length = 0;
    await expect(unlockScheduled(lock)).rejected;
    expect(lock.errorEvents.map(({ operationError, userIndex }) => ({ operationError, userIndex }))).deep.equals([
        { operationError: expected, userIndex: 1 },
    ]);
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
                await using lock = await setUpScheduledLock({ users: [scheduledUser(userType)] });
                await expectScheduledDenial(lock, OperationError.Restricted);
            });
        }

        it("grants a WeekDayScheduleUser inside a matching schedule and denies outside it", async () => {
            const { dayName, hour } = currentLocal();
            const otherDay = DAY_NAMES[(DAY_NAMES.indexOf(dayName) + 1) % 7];

            await using lock = await setUpScheduledLock({
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
        });

        it("grants a YearDayScheduleUser inside a matching time window and denies outside it", async () => {
            const { epochS } = currentLocal();

            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.YearDayScheduleUser)],
                yearDaySchedules: [
                    { yearDayIndex: 1, userIndex: 1, localStartTime: epochS - 7200, localEndTime: epochS - 3600 },
                ],
            });
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
        });

        it("requires both WeekDay AND YearDay schedules to match for a ScheduleRestrictedUser once both are set", async () => {
            const { dayName, hour, epochS } = currentLocal();
            const otherDay = DAY_NAMES[(DAY_NAMES.indexOf(dayName) + 1) % 7];

            await using lock = await setUpScheduledLock({
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

    describe("auto relock (spec § 5.2.9.22)", () => {
        it("relocks once AutoRelockTime has passed since the latest unlock", async () => {
            await using lock = await setUpScheduledLock({
                autoRelockTime: 5,
                users: [scheduledUser(UserType.UnrestrictedUser)],
            });
            await unlockScheduled(lock);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);

            await MockTime.advance(Seconds(3));
            await unlockScheduled(lock);

            await MockTime.advance(Seconds(3));
            await settled(lock.device);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);

            await MockTime.advance(Seconds(3));
            await settled(lock.device);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
        });
    });

    describe("auto relock with the largest AutoRelockTime", () => {
        it("unlocks and stays unlocked", async () => {
            await using lock = await setUpScheduledLock({
                autoRelockTime: 0xffffffff,
                users: [scheduledUser(UserType.UnrestrictedUser)],
            });
            await unlockScheduled(lock);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);

            await MockTime.advance(Hours(1));
            await settled(lock.device);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);
        });
    });

    describe("ExpiringUser timeout (spec § 5.2.6.18.8)", () => {
        it("keeps granting access before the timeout elapses", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 5,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            await unlockScheduled(lock);
            await MockTime.advance(60_000);
            await unlockScheduled(lock);
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);
        });

        it("disables the user when the timeout elapses after first use, without a further access attempt", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
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
                    dataIndex: 1,
                },
            ]);
            await expectScheduledDenial(lock, OperationError.DisabledUserDenied);
        });

        it("does not arm the timeout before the first successful use", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            await MockTime.advance(70_000);
            await settled(lock.device);
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);
            await unlockScheduled(lock);
        });

        it("keeps the deadline when a modification changes neither status nor type", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            await unlockScheduled(lock);
            await MockTime.advance(30_000);
            await modifyUser(lock, { userName: "renamed" });

            await MockTime.advance(40_000);
            await settled(lock.device);

            expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
        });

        it("starts a new cycle when an expired user is enabled again", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
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
        });

        it("denies and disables once the wall clock passes the deadline, before the timer fires", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
            await unlockScheduled(lock);
            lock.userChanges.length = 0;

            MockTime.stepWallClock(Minutes(2));
            try {
                await expectScheduledDenial(lock, OperationError.DisabledUserDenied);
                await MockTime.advance(0);
                await settled(lock.device);

                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
                expect(
                    lock.userChanges.map(({ userIndex, operationSource }) => ({ userIndex, operationSource })),
                ).deep.equals([{ userIndex: 1, operationSource: DoorLock.OperationSource.Unspecified }]);
            } finally {
                MockTime.stepWallClock(Minutes(-2));
            }
        });

        it("re-arms for the remaining time when the timer fires early after the wall clock stepped back", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser)],
            });
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
        });

        it("denies an ExpiringUser while ExpiringUserTimeout is not set", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.ExpiringUser)] });
            await expectScheduledDenial(lock, OperationError.Restricted);
        });

        it("disables at startup a user whose stored deadline has passed", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser, Timestamp(Time.nowMs - Minutes(1)))],
            });
            await MockTime.advance(0);
            await settled(lock.device);
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
        });

        it("starts with a deadline beyond the timer range and still disables once it passes", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser, Timestamp(Time.nowMs + Days(60)))],
            });
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);

            MockTime.stepWallClock(Days(60));
            try {
                await MockTime.advance(Hours(24));
                await settled(lock.device);
                expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
            } finally {
                MockTime.stepWallClock(Days(-60));
            }
        });

        it("restores deadlines at startup from an overridden auth store", async () => {
            const external = {
                users: [scheduledUser(UserType.ExpiringUser, Timestamp(Time.nowMs - Minutes(1)))],
                credentials: new Array<LockAuth.Credential>(),
            };
            class ExternalAuthServer extends DoorLockServer.with("User", "PinCredential") {
                override get auth() {
                    return new LockAuth.Store(external, this.cipher);
                }
            }

            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            try {
                await node.add(DoorLockDevice.with(ExternalAuthServer), {
                    doorLock: { ...lockState, users: [], expiringUserTimeout: 1 },
                });
                await MockTime.advance(0);
                await settled(node);

                expect(external.users[0].userStatus).equals(UserStatus.OccupiedDisabled);
            } finally {
                await node.close();
            }
        });

        it("disables a user when a deadline that was still pending at startup passes", async () => {
            await using lock = await setUpScheduledLock({
                expiringUserTimeout: 1,
                users: [scheduledUser(UserType.ExpiringUser, Timestamp(Time.nowMs + Hours(1)))],
            });
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);

            await MockTime.advance(3_610_000);
            await settled(lock.device);

            expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
        });
    });

    describe("authorization of lock operations", () => {
        const privacySupported = { alwaysSet: 2047, vacation: true, passage: true };

        const actuations = {
            lockDoor: (cmds: ScheduledLock["cmds"]) => cmds.lockDoor({}),
            unlockDoor: (cmds: ScheduledLock["cmds"]) => cmds.unlockDoor({}),
            unlockWithTimeout: (cmds: ScheduledLock["cmds"]) => cmds.unlockWithTimeout({ timeout: 10 }),
            unboltDoor: (cmds: ScheduledLock["cmds"]) => cmds.unboltDoor({}),
        };

        for (const mode of [OperatingMode.Privacy, OperatingMode.NoRemoteLockUnlock]) {
            for (const [name, invoke] of Object.entries(actuations)) {
                it(`refuses ${name} in ${OperatingMode[mode]}`, async () => {
                    const initial = name === "lockDoor" ? DoorLock.LockState.Unlocked : DoorLock.LockState.Locked;
                    await using lock = await setUpScheduledLock({
                        users: [scheduledUser(UserType.UnrestrictedUser)],
                        lockState: initial,
                        operatingMode: mode,
                        supportedOperatingModes: privacySupported,
                    });
                    await expect(withMockTime(invoke(lock.cmds))).rejected;
                    expect(lock.lock.state.doorLock.lockState).equals(initial);
                    expect(hardware.calls).deep.equals([]);
                    expect(operationErrorsOf(lock)).deep.equals([OperationError.Unspecified]);
                    expect(lock.operations).deep.equals([]);
                });
            }
        }

        it("refuses a NonAccessUser and reports the access attempt", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.NonAccessUser)],
                lockState: DoorLock.LockState.Locked,
            });
            await expect(unlockScheduled(lock)).rejected;
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
            expect(hardware.calls).deep.equals([]);
            expect(
                lock.operations.map(({ lockOperationType, userIndex, credentials }) => ({
                    lockOperationType,
                    userIndex,
                    credentials,
                })),
            ).deep.equals([
                {
                    lockOperationType: DoorLock.LockOperationType.NonAccessUserEvent,
                    userIndex: 1,
                    credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                },
            ]);
        });

        it("keeps a DisposableUser enabled when it locks the door", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.DisposableUser)],
                lockState: DoorLock.LockState.Unlocked,
            });
            await withMockTime(lock.cmds.lockDoor({ pinCode: pin("1234") }));
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedEnabled);
            await unlockScheduled(lock);
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
        });

        it("disables a DisposableUser after one use", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.DisposableUser)] });
            await unlockScheduled(lock);
            expect(userStatusOf(lock)).equals(UserStatus.OccupiedDisabled);
            expect(
                lock.userChanges.map(({ lockDataType, dataOperationType, userIndex, dataIndex }) => ({
                    lockDataType,
                    dataOperationType,
                    userIndex,
                    dataIndex,
                })),
            ).deep.equals([
                {
                    lockDataType: DoorLock.LockDataType.UserIndex,
                    dataOperationType: DoorLock.DataOperationType.Modify,
                    userIndex: 1,
                    dataIndex: 1,
                },
            ]);

            await expectScheduledDenial(lock, OperationError.DisabledUserDenied);
        });

        it("reports a ForcedUser operation and raises the silent alarm", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.ForcedUser)] });
            await unlockScheduled(lock);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);
            expect(lock.operations.map(({ lockOperationType }) => lockOperationType)).deep.equals([
                DoorLock.LockOperationType.ForcedUserEvent,
            ]);
            expect(lock.alarms).deep.equals([DoorLock.AlarmCode.ForcedUser]);
        });

        it("reports the user and credential when refusing a disabled user", async () => {
            await using lock = await setUpScheduledLock({
                users: [{ ...scheduledUser(UserType.UnrestrictedUser), userStatus: UserStatus.OccupiedDisabled }],
            });
            await expect(unlockScheduled(lock)).rejected;
            expect(
                lock.errorEvents.map(({ operationError, userIndex, credentials }) => ({
                    operationError,
                    userIndex,
                    credentials,
                })),
            ).deep.equals([
                {
                    operationError: OperationError.DisabledUserDenied,
                    userIndex: 1,
                    credentials: [{ credentialType: CredentialType.Pin, credentialIndex: 1 }],
                },
            ]);
        });

        describe("wrong-code lockout", () => {
            async function enterLockout(lock: ScheduledLock) {
                for (let i = 0; i < 3; i++) {
                    await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
                }
                expect(lock.alarms).deep.equals([DoorLock.AlarmCode.WrongCodeEntryLimit]);
                expect(operationErrorsOf(lock)).deep.equals(new Array(3).fill(OperationError.InvalidCredential));
                lock.errorEvents.length = 0;
            }

            it("refuses every lock operation during the lockout, with or without PIN, and reports none", async () => {
                await using lock = await setUpScheduledLock({
                    users: [scheduledUser(UserType.UnrestrictedUser)],
                    lockState: DoorLock.LockState.Locked,
                });
                await enterLockout(lock);

                await expect(withMockTime(lock.cmds.unlockDoor({}))).rejected;
                await expect(unlockScheduled(lock)).rejected;
                await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
                expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
                expect(hardware.calls).deep.equals([]);
                expect(operationErrorsOf(lock)).deep.equals([]);
                expect(lock.alarms).deep.equals([DoorLock.AlarmCode.WrongCodeEntryLimit]);
            });

            it("ends the lockout after UserCodeTemporaryDisableTime with a fresh attempt count", async () => {
                await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
                await enterLockout(lock);

                await MockTime.advance(9_000);
                await expect(unlockScheduled(lock)).rejected;

                await MockTime.advance(1_000);
                for (let i = 0; i < 2; i++) {
                    await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
                }
                await unlockScheduled(lock);
                expect(lock.alarms).deep.equals([DoorLock.AlarmCode.WrongCodeEntryLimit]);
            });

            it("measures the lockout on the monotonic clock", async () => {
                await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
                MockTime.stepWallClock(Minutes(1));
                try {
                    await enterLockout(lock);
                    MockTime.stepWallClock(Seconds(20));

                    await expect(unlockScheduled(lock)).rejected;

                    await MockTime.advance(10_000);
                    await unlockScheduled(lock);
                } finally {
                    MockTime.stepWallClock(Seconds(-80));
                }
            });

            it("does not count PINs refused by the operating mode", async () => {
                await using lock = await setUpScheduledLock({
                    users: [scheduledUser(UserType.UnrestrictedUser)],
                    operatingMode: OperatingMode.NoRemoteLockUnlock,
                });
                for (let i = 0; i < 3; i++) {
                    await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
                }
                expect(lock.alarms).deep.equals([]);
            });

            it("starts the attempt count again after a correct code", async () => {
                await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
                for (const code of ["9999", "9999", "1234", "9999", "9999"]) {
                    const unlock = withMockTime(lock.cmds.unlockDoor({ pinCode: pin(code) }));
                    if (code === "1234") {
                        await unlock;
                    } else {
                        await expect(unlock).rejected;
                    }
                }
                expect(lock.alarms).deep.equals([]);
            });

            it("counts an omitted PIN as a wrong code when a PIN is required", async () => {
                await using lock = await setUpScheduledLock({
                    users: [scheduledUser(UserType.UnrestrictedUser)],
                    requirePinForRemoteOperation: true,
                });
                for (let i = 0; i < 3; i++) {
                    await expect(withMockTime(lock.cmds.unlockDoor({}))).rejected;
                }
                expect(lock.alarms).deep.equals([DoorLock.AlarmCode.WrongCodeEntryLimit]);
                await expect(unlockScheduled(lock)).rejected;
            });
        });

        describe("OperatingMode", () => {
            it("refuses a write of an unsupported mode and accepts a supported one", async () => {
                await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
                const endpoint = lock.peer.parts.get("ep1")!;
                const error = await withMockTime(
                    endpoint.setStateOf(DoorLockClient, { operatingMode: OperatingMode.Privacy }),
                ).then(
                    () => undefined,
                    (e: unknown) => e,
                );
                expect(error).instanceof(StatusResponseError);
                expect(error instanceof StatusResponseError ? error.code : undefined).equals(Status.ConstraintError);
                expect(lock.lock.state.doorLock.operatingMode).equals(OperatingMode.Normal);

                await withMockTime(
                    endpoint.setStateOf(DoorLockClient, { operatingMode: OperatingMode.NoRemoteLockUnlock }),
                );
                expect(lock.lock.state.doorLock.operatingMode).equals(OperatingMode.NoRemoteLockUnlock);
            });

            it("switches a stored mode SupportedOperatingModes does not support to Normal", async () => {
                await using lock = await setUpScheduledLock({
                    users: [scheduledUser(UserType.UnrestrictedUser)],
                    operatingMode: OperatingMode.Privacy,
                });
                expect(lock.lock.state.doorLock.operatingMode).equals(OperatingMode.Normal);
            });

            it("refuses SupportedOperatingModes without Normal", async () => {
                const error = await setUpScheduledLock({
                    users: [scheduledUser(UserType.UnrestrictedUser)],
                    supportedOperatingModes: { alwaysSet: 2047, normal: true },
                }).then(
                    () => undefined,
                    (e: unknown) => e,
                );
                expect(error).instanceof(MatterAggregateError);
                const cause = error instanceof MatterAggregateError ? error.errors[0]?.cause : undefined;
                expect(cause).instanceof(ImplementationError);
            });

            it("accepts every mode SupportedOperatingModes supports", async () => {
                await using lock = await setUpScheduledLock({
                    users: [scheduledUser(UserType.UnrestrictedUser)],
                    supportedOperatingModes: { alwaysSet: 2047, privacy: true },
                });
                const endpoint = lock.peer.parts.get("ep1")!;
                for (const mode of [OperatingMode.Vacation, OperatingMode.Passage, OperatingMode.NoRemoteLockUnlock]) {
                    await withMockTime(endpoint.setStateOf(DoorLockClient, { operatingMode: mode }));
                    expect(lock.lock.state.doorLock.operatingMode).equals(mode);
                }
            });
        });
    });

    describe("lock hardware", () => {
        it("moves the hardware after authorization and before the lock state changes", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
            await unlockScheduled(lock);
            await withMockTime(lock.cmds.lockDoor({}));
            await withMockTime(lock.cmds.unboltDoor({}));

            const { Remote } = DoorLock.OperationSource;
            expect(hardware.calls).deep.equals([
                { actuation: "unlock", source: Remote, userIndex: 1, lockState: DoorLock.LockState.Locked },
                { actuation: "lock", source: Remote, userIndex: null, lockState: DoorLock.LockState.Unlocked },
                { actuation: "unbolt", source: Remote, userIndex: null, lockState: DoorLock.LockState.Locked },
            ]);
            expect(
                lock.operations.map(({ fabricIndex, sourceNode }) => ({
                    fabricIndex,
                    hasSourceNode: sourceNode !== null,
                })),
            ).deep.equals(new Array(3).fill({ fabricIndex: FabricIndex(1), hasSourceNode: true }));
        });

        it("refuses a lock command invoked locally before the hardware moves", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            let error: unknown;
            try {
                await lock.lock.act(agent => agent.get(TestHardwareDoorLockServer).unlockDoor({}));
            } catch (e) {
                error = e;
            }
            expect(error instanceof StatusResponseError ? error.code : error).equals(Status.UnsupportedAccess);
            expect(hardware.calls).deep.equals([]);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
        });

        it("starts the attempt count again only after the hardware succeeds", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            for (let i = 0; i < 2; i++) {
                await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
            }
            hardware.failure = new LockOperationFailedError(OperationError.Unspecified);
            await expect(unlockScheduled(lock)).rejected;

            await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
            expect(lock.alarms).deep.equals([DoorLock.AlarmCode.WrongCodeEntryLimit]);
        });

        it("keeps the attempt count through an operation without PIN", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            for (let i = 0; i < 2; i++) {
                await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
            }
            await withMockTime(lock.cmds.unlockDoor({}));

            await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("9999") }))).rejected;
            expect(lock.alarms).deep.equals([DoorLock.AlarmCode.WrongCodeEntryLimit]);
        });

        it("refuses a PIN that belongs to no user as a wrong code", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
                credentials: [
                    {
                        credentialType: CredentialType.Pin,
                        credentialIndex: 2,
                        credentialData: pin("5555"),
                        creatorFabricIndex: FabricIndex(1),
                        lastModifiedFabricIndex: FabricIndex(1),
                    },
                ],
            });
            await expect(withMockTime(lock.cmds.unlockDoor({ pinCode: pin("5555") }))).rejected;
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
            expect(hardware.calls).deep.equals([]);
            expect(operationErrorsOf(lock)).deep.equals([OperationError.InvalidCredential]);
        });

        it("runs one lock operation at a time", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            const release = holdHardware();
            const called = nextHardwareCall();
            const both = Promise.allSettled([
                withMockTime(lock.cmds.unlockDoor({})),
                withMockTime(lock.cmds.lockDoor({})),
            ]);
            await called;
            await MockTime.advance(1_000);
            expect(hardware.calls.map(({ actuation }) => actuation)).deep.equals(["unlock"]);

            release();
            expect((await both).map(({ status }) => status)).deep.equals(["fulfilled", "fulfilled"]);
            expect(hardware.calls.map(({ actuation, lockState }) => ({ actuation, lockState }))).deep.equals([
                { actuation: "unlock", lockState: DoorLock.LockState.Locked },
                { actuation: "lock", lockState: DoorLock.LockState.Unlocked },
            ]);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
        });

        it("does not relock for a timer an unlock replaced while the relock waited", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
                autoRelockTime: 5,
            });
            await withMockTime(lock.cmds.unlockDoor({}));

            const release = holdHardware();
            const called = nextHardwareCall();
            const unlock = Promise.allSettled([withMockTime(lock.cmds.unlockDoor({}))]);
            await called;
            await MockTime.advance(6_000);

            release();
            expect((await unlock).map(({ status }) => status)).deep.equals(["fulfilled"]);
            await settled(lock.device);
            expect(hardware.calls.map(({ actuation }) => actuation)).deep.equals(["unlock", "unlock"]);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);
        });

        it("fails the operation when the hardware fails", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            hardware.failure = new Error("motor jammed");

            await expect(unlockScheduled(lock)).rejected;
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
            expect(lock.operations).deep.equals([]);
            expect(
                lock.errorEvents.map(({ lockOperationType, operationError, userIndex }) => ({
                    lockOperationType,
                    operationError,
                    userIndex,
                })),
            ).deep.equals([
                {
                    lockOperationType: DoorLock.LockOperationType.Unlock,
                    operationError: OperationError.Unspecified,
                    userIndex: 1,
                },
            ]);
        });

        it("reports the reason the hardware gives for a failure", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            hardware.failure = new LockOperationFailedError(OperationError.InsufficientBattery);

            await expect(unlockScheduled(lock)).rejected;
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
            expect(operationErrorsOf(lock)).deep.equals([OperationError.InsufficientBattery]);
        });

        it("relocks through the hardware and keeps the state when it fails", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
                autoRelockTime: 5,
            });
            await unlockScheduled(lock);
            hardware.failure = new LockOperationFailedError(OperationError.InsufficientBattery);

            await MockTime.advance(5_000);
            await settled(lock.device);

            expect(hardware.calls.map(({ actuation, source }) => ({ actuation, source }))).deep.equals([
                { actuation: "unlock", source: DoorLock.OperationSource.Remote },
                { actuation: "lock", source: DoorLock.OperationSource.Auto },
            ]);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);
            expect(
                lock.errorEvents.map(({ lockOperationType, operationSource, operationError }) => ({
                    lockOperationType,
                    operationSource,
                    operationError,
                })),
            ).deep.equals([
                {
                    lockOperationType: DoorLock.LockOperationType.Lock,
                    operationSource: DoorLock.OperationSource.Auto,
                    operationError: OperationError.InsufficientBattery,
                },
            ]);

            hardware.failure = undefined;
            await withMockTime(lock.cmds.unlockDoor({}));
            await MockTime.advance(5_000);
            await settled(lock.device);
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Locked);
        });
    });

    describe("lock operation events", () => {
        it("reports UnboltDoor as Unlock and leaves the latch alone", async () => {
            await using lock = await setUpScheduledLock({
                users: [scheduledUser(UserType.UnrestrictedUser)],
                lockState: DoorLock.LockState.Locked,
            });
            await withMockTime(lock.cmds.unboltDoor({ pinCode: pin("1234") }));
            expect(lock.lock.state.doorLock.lockState).equals(DoorLock.LockState.Unlocked);
            expect(lock.operations.map(({ lockOperationType }) => lockOperationType)).deep.equals([
                DoorLock.LockOperationType.Unlock,
            ]);

            await expect(withMockTime(lock.cmds.unboltDoor({ pinCode: pin("9999") }))).rejected;
            expect(lock.errorEvents.map(({ lockOperationType }) => lockOperationType)).deep.equals([
                DoorLock.LockOperationType.Unlock,
            ]);
        });
    });

    describe("LockUserChange", () => {
        function summary(lock: ScheduledLock) {
            return lock.userChanges.map(({ lockDataType, dataOperationType, userIndex, dataIndex }) => ({
                lockDataType,
                dataOperationType,
                userIndex,
                dataIndex,
            }));
        }

        const { LockDataType, DataOperationType } = DoorLock;

        it("reports schedule changes", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.WeekDayScheduleUser)] });
            const { epochS } = currentLocal();
            await withMockTime(
                lock.cmds.setWeekDaySchedule({
                    weekDayIndex: 2,
                    userIndex: 1,
                    daysMask: { monday: true },
                    startHour: 8,
                    startMinute: 0,
                    endHour: 9,
                    endMinute: 0,
                }),
            );
            await withMockTime(lock.cmds.clearWeekDaySchedule({ weekDayIndex: 2, userIndex: 1 }));
            await withMockTime(lock.cmds.clearWeekDaySchedule({ weekDayIndex: 0xfe, userIndex: 1 }));
            await withMockTime(
                lock.cmds.setYearDaySchedule({
                    yearDayIndex: 3,
                    userIndex: 1,
                    localStartTime: epochS,
                    localEndTime: epochS + 60,
                }),
            );
            await withMockTime(lock.cmds.clearYearDaySchedule({ yearDayIndex: 3, userIndex: 1 }));
            await withMockTime(
                lock.cmds.setHolidaySchedule({
                    holidayIndex: 4,
                    localStartTime: epochS,
                    localEndTime: epochS + 60,
                    operatingMode: OperatingMode.Normal,
                }),
            );
            await withMockTime(lock.cmds.clearHolidaySchedule({ holidayIndex: 4 }));

            expect(summary(lock)).deep.equals([
                {
                    lockDataType: LockDataType.WeekDaySchedule,
                    dataOperationType: DataOperationType.Add,
                    userIndex: 1,
                    dataIndex: 2,
                },
                {
                    lockDataType: LockDataType.WeekDaySchedule,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 1,
                    dataIndex: 2,
                },
                {
                    lockDataType: LockDataType.WeekDaySchedule,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 1,
                    dataIndex: 0xfe,
                },
                {
                    lockDataType: LockDataType.YearDaySchedule,
                    dataOperationType: DataOperationType.Add,
                    userIndex: 1,
                    dataIndex: 3,
                },
                {
                    lockDataType: LockDataType.YearDaySchedule,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 1,
                    dataIndex: 3,
                },
                {
                    lockDataType: LockDataType.HolidaySchedule,
                    dataOperationType: DataOperationType.Add,
                    userIndex: null,
                    dataIndex: 4,
                },
                {
                    lockDataType: LockDataType.HolidaySchedule,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: null,
                    dataIndex: 4,
                },
            ]);
        });

        it("reports the user index as DataIndex for user changes", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
            await withMockTime(
                lock.cmds.setUser({
                    operationType: DataOperationType.Add,
                    userIndex: 2,
                    userName: null,
                    userUniqueId: null,
                    userStatus: null,
                    userType: null,
                    credentialRule: null,
                }),
            );
            await modifyUser(lock, { userName: "x" });
            await withMockTime(lock.cmds.clearUser({ userIndex: 2 }));
            await withMockTime(lock.cmds.clearUser({ userIndex: 0xfffe }));

            expect(summary(lock)).deep.equals([
                {
                    lockDataType: LockDataType.UserIndex,
                    dataOperationType: DataOperationType.Add,
                    userIndex: 2,
                    dataIndex: 2,
                },
                {
                    lockDataType: LockDataType.UserIndex,
                    dataOperationType: DataOperationType.Modify,
                    userIndex: 1,
                    dataIndex: 1,
                },
                {
                    lockDataType: LockDataType.UserIndex,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 2,
                    dataIndex: 2,
                },
                {
                    lockDataType: LockDataType.UserIndex,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 0xfffe,
                    dataIndex: 0xfffe,
                },
            ]);
        });

        it("reports the owning user when the programming PIN is modified", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
            const programmingPin = { credentialType: CredentialType.ProgrammingPin, credentialIndex: 0 };
            const added = await withMockTime(
                lock.cmds.setCredential({
                    operationType: DataOperationType.Add,
                    credential: programmingPin,
                    credentialData: pin("5678"),
                    userIndex: 1,
                    userStatus: null,
                    userType: null,
                }),
            );
            expect(added.status).equals(Status.Success);
            lock.userChanges.length = 0;
            const modified = await withMockTime(
                lock.cmds.setCredential({
                    operationType: DataOperationType.Modify,
                    credential: programmingPin,
                    credentialData: pin("8765"),
                    userIndex: null,
                    userStatus: null,
                    userType: UserType.ProgrammingUser,
                }),
            );
            expect(modified.status).equals(Status.Success);

            expect(summary(lock)).deep.equals([
                {
                    lockDataType: LockDataType.ProgrammingCode,
                    dataOperationType: DataOperationType.Modify,
                    userIndex: 1,
                    dataIndex: 0,
                },
            ]);
        });

        it("reports the owning user for credential changes", async () => {
            await using lock = await setUpScheduledLock({ users: [scheduledUser(UserType.UnrestrictedUser)] });
            await withMockTime(
                lock.cmds.setCredential({
                    operationType: DataOperationType.Add,
                    credential: { credentialType: CredentialType.Pin, credentialIndex: 3 },
                    credentialData: pin("5678"),
                    userIndex: null,
                    userStatus: null,
                    userType: null,
                }),
            );
            await withMockTime(
                lock.cmds.setCredential({
                    operationType: DataOperationType.Modify,
                    credential: { credentialType: CredentialType.Pin, credentialIndex: 1 },
                    credentialData: pin("4321"),
                    userIndex: 1,
                    userStatus: null,
                    userType: null,
                }),
            );
            await withMockTime(
                lock.cmds.clearCredential({
                    credential: { credentialType: CredentialType.Pin, credentialIndex: 1 },
                }),
            );
            await withMockTime(
                lock.cmds.clearCredential({
                    credential: { credentialType: CredentialType.Pin, credentialIndex: 0xfffe },
                }),
            );

            expect(summary(lock)).deep.equals([
                {
                    lockDataType: LockDataType.UserIndex,
                    dataOperationType: DataOperationType.Add,
                    userIndex: 2,
                    dataIndex: 2,
                },
                {
                    lockDataType: LockDataType.Pin,
                    dataOperationType: DataOperationType.Add,
                    userIndex: 2,
                    dataIndex: 3,
                },
                {
                    lockDataType: LockDataType.Pin,
                    dataOperationType: DataOperationType.Modify,
                    userIndex: 1,
                    dataIndex: 1,
                },
                {
                    lockDataType: LockDataType.Pin,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 1,
                    dataIndex: 1,
                },
                {
                    lockDataType: LockDataType.Pin,
                    dataOperationType: DataOperationType.Clear,
                    userIndex: 0xfffe,
                    dataIndex: 0xfffe,
                },
            ]);
        });
    });
});

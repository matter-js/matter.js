/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoorLockServer } from "#behaviors/door-lock";
import { DoorLockDevice } from "#devices/door-lock";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    FabricIndex,
    Status,
    TlvByteString,
    TlvField,
    TlvNullable,
    TlvObject,
    TlvUInt16,
    TlvUInt8,
} from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";

const TlvSetCredentialResponse = TlvObject({
    status: TlvField(0, TlvUInt8),
    userIndex: TlvField(1, TlvNullable(TlvUInt16)),
    nextCredentialIndex: TlvField(2, TlvNullable(TlvUInt16)),
});

const TlvSetCredentialRequest = TlvObject({
    operationType: TlvField(0, TlvUInt8),
    credential: TlvField(
        1,
        TlvObject({ credentialType: TlvField(0, TlvUInt8), credentialIndex: TlvField(1, TlvUInt16) }),
    ),
    credentialData: TlvField(2, TlvByteString),
    userIndex: TlvField(3, TlvNullable(TlvUInt16)),
    userStatus: TlvField(4, TlvNullable(TlvUInt8)),
    userType: TlvField(5, TlvNullable(TlvUInt8)),
});

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

describe("DoorLockServer", () => {
    // SetCredential's OperationType admits only the values "add, modify" names, and the cluster answers a payload it
    // cannot validate with INVALID_COMMAND
    it("refuses SetCredential naming an OperationType its constraint omits", async () => {
        await using lock = await createLock();

        // The request creates its own user, so it does not depend on a seeded record any particular fabric owns
        async function setCredentialOverTheWire(operationType: DoorLock.DataOperationType) {
            let interactionStatus: number | undefined;
            let payload: undefined | { status: number };

            await interaction.invoke(
                lock.node,
                await lock.node.addFabric(),
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(DoorLock.Complete.id),
                        commandId: CommandId(0x22),
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
                        payload = TlvSetCredentialResponse.decodeTlv(fields);
                    }
                },
                { timed: true },
            );

            return { interactionStatus, payload };
        }

        // Validation refuses the command, so the cluster never answers a response payload of its own
        const cleared = await setCredentialOverTheWire(DoorLock.DataOperationType.Clear);
        expect(cleared.interactionStatus).equals(Status.InvalidCommand);
        expect(cleared.payload).equals(undefined);

        const added = await setCredentialOverTheWire(DoorLock.DataOperationType.Add);
        expect(added.interactionStatus).equals(undefined);
        expect(added.payload?.status).equals(Status.Success);
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
});

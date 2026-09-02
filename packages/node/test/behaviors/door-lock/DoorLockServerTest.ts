/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoorLockServer } from "#behaviors/door-lock";
import { DoorLockDevice } from "#devices/door-lock";
import { FabricIndex, Status } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { MockServerNode } from "../../node/mock-server-node.js";

const TestDoorLockDevice = DoorLockDevice.with(DoorLockServer.with("User", "PinCredential"));

async function createLock() {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });
    const endpoint = await node.add(TestDoorLockDevice, {
        doorLock: {
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
            // A pre-existing user avoids the Add branch's new-user creation path (which has its own,
            // unrelated userUniqueId bug) so the test can focus on the credential status codes.
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
        },
    });
    return { node, endpoint, [Symbol.asyncDispose]: () => node.close() };
}

function pin(digits: string) {
    return new Uint8Array([...digits].map(d => d.charCodeAt(0)));
}

describe("DoorLockServer", () => {
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
});

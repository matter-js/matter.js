/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { DoorLockServer } from "@matter/main/behaviors/door-lock";
import { BasicInformation, DoorLock } from "@matter/main/clusters";
import { DoorLockDevice } from "@matter/main/devices/door-lock";
import { DeviceTypeId, EndpointNumber, VendorId } from "@matter/main/types";
import { NodeTestInstance } from "./NodeTestInstance.js";

/**
 * A door lock on endpoint 1 that matches chip's lock-app (`lock-app.matter`), the TH of the DoorLock client cases: the
 * same features except Aliro, the same supported counts and PIN and RFID lengths, and no PIN required for a remote
 * lock or unlock, so one set of command arguments is valid on both THs.
 */
export class LockTestInstance extends NodeTestInstance {
    static override id = "lock-6100";

    async setupServer(): Promise<ServerNode> {
        const serverNode = await ServerNode.create(ServerNode.RootEndpoint, {
            id: this.id,
            environment: this.env,
            network: {
                port: this.config.port ?? 5540,
            },
            commissioning: {
                passcode: this.config.passcode ?? 20202021,
                discriminator: this.config.discriminator ?? 3840,
            },
            productDescription: {
                name: this.appName,
                deviceType: DeviceTypeId(DoorLockDevice.deviceType),
            },
            basicInformation: {
                vendorName: "Binford",
                vendorId: VendorId(0xfff1),
                nodeLabel: "",
                productName: "MorePowerPro 6100 Door Lock",
                productLabel: "MorePowerPro 6100 Door Lock",
                productId: 0x8003,
                serialNumber: "9999-9999-9999",
                manufacturingDate: "20200101",
                partNumber: "123456",
                productUrl: "https://test.com",
                uniqueId: "node-matter-unique",
                localConfigDisabled: false,
                productAppearance: {
                    finish: BasicInformation.ProductFinish.Satin,
                    primaryColor: BasicInformation.Color.Purple,
                },
                reachable: true,
            },
        });

        const lock = new Endpoint(
            DoorLockDevice.with(
                DoorLockServer.with(
                    DoorLock.Feature.PinCredential,
                    DoorLock.Feature.RfidCredential,
                    DoorLock.Feature.WeekDayAccessSchedules,
                    DoorLock.Feature.DoorPositionSensor,
                    DoorLock.Feature.CredentialOverTheAirAccess,
                    DoorLock.Feature.User,
                    DoorLock.Feature.YearDayAccessSchedules,
                    DoorLock.Feature.HolidaySchedules,
                    DoorLock.Feature.Unbolting,
                ),
            ),
            {
                number: EndpointNumber(1),
                id: "ep1",
                doorLock: {
                    lockState: DoorLock.LockState.Locked,
                    lockType: DoorLock.LockType.DeadBolt,
                    actuatorEnabled: true,
                    doorState: DoorLock.DoorState.DoorClosed,
                    numberOfTotalUsersSupported: 10,
                    numberOfPinUsersSupported: 10,
                    numberOfRfidUsersSupported: 10,
                    numberOfWeekDaySchedulesSupportedPerUser: 10,
                    numberOfYearDaySchedulesSupportedPerUser: 10,
                    numberOfHolidaySchedulesSupported: 10,
                    maxPinCodeLength: 8,
                    minPinCodeLength: 6,
                    maxRfidCodeLength: 20,
                    minRfidCodeLength: 10,
                    credentialRulesSupport: { single: true },
                    numberOfCredentialsSupportedPerUser: 5,
                    language: "en",
                    autoRelockTime: 60,
                    soundVolume: DoorLock.SoundVolume.Silent,
                    operatingMode: DoorLock.OperatingMode.Normal,
                    wrongCodeEntryLimit: 3,
                    userCodeTemporaryDisableTime: 10,
                    requirePinForRemoteOperation: false,
                },
            },
        );
        await serverNode.add(lock);

        return serverNode;
    }
}

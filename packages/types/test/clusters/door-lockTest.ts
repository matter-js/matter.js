/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoorLock } from "#clusters/door-lock.js";
import { Groups } from "#clusters/groups.js";
import { Status } from "#globals/Status.js";

describe("Door Lock Cluster types", () => {
    it("types a status field as both the global and the cluster status codes", () => {
        Status.Success satisfies DoorLock.SetCredentialResponse["status"];
        Status.InvalidCommand satisfies DoorLock.SetCredentialResponse["status"];
        DoorLock.StatusCode.Duplicate satisfies DoorLock.SetCredentialResponse["status"];
        DoorLock.StatusCode.Occupied satisfies DoorLock.SetCredentialResponse["status"];

        expect(DoorLock.StatusCode.Duplicate).equals(2);
        expect(DoorLock.StatusCode.Occupied).equals(3);
    });

    it("types the schedule response status fields the same way", () => {
        DoorLock.StatusCode.Occupied satisfies DoorLock.GetWeekDayScheduleResponse["status"];
        DoorLock.StatusCode.Occupied satisfies DoorLock.GetYearDayScheduleResponse["status"];
        DoorLock.StatusCode.Occupied satisfies DoorLock.GetHolidayScheduleResponse["status"];
    });

    it("rejects a value belonging to neither space", () => {
        // @ts-expect-error 4 is neither a global status code nor one of DoorLock's
        4 satisfies DoorLock.SetCredentialResponse["status"];
    });

    it("leaves a cluster without its own status codes on the global ones", () => {
        Status.Success satisfies Groups.AddGroupResponse["status"];

        // @ts-expect-error Groups defines no cluster status codes, so nothing widens its status field
        DoorLock.StatusCode.Duplicate satisfies Groups.AddGroupResponse["status"];

        expect(Groups.id).equals(4);
    });
});

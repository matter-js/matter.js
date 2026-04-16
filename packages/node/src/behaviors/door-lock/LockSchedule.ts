/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { field, Matter, uint16, uint32, uint8 } from "@matter/model";
import { DoorLock } from "@matter/types/clusters/door-lock";

/**
 * Schedule-related data types for the DoorLock server implementation.
 */
export namespace LockSchedule {
    /**
     * Stored week day schedule record.
     */
    export class WeekDay {
        @field(uint8)
        weekDayIndex!: number;

        @field(uint16)
        userIndex!: number;

        @field(Matter.clusters.require("DoorLock").datatypes.require("DaysMaskBitmap"))
        daysMask!: DoorLock.DaysMask;

        @field(uint8)
        startHour!: number;

        @field(uint8)
        startMinute!: number;

        @field(uint8)
        endHour!: number;

        @field(uint8)
        endMinute!: number;
    }

    /**
     * Stored year day schedule record.
     */
    export class YearDay {
        @field(uint8)
        yearDayIndex!: number;

        @field(uint16)
        userIndex!: number;

        @field(uint32)
        localStartTime!: number;

        @field(uint32)
        localEndTime!: number;
    }

    /**
     * Stored holiday schedule record.
     */
    export class Holiday {
        @field(uint8)
        holidayIndex!: number;

        @field(uint32)
        localStartTime!: number;

        @field(uint32)
        localEndTime!: number;

        @field(uint8)
        operatingMode!: DoorLock.OperatingMode;
    }
}

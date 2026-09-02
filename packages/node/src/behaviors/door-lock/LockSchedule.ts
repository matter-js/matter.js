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

    const DAYS_OF_WEEK: readonly (keyof DoorLock.DaysMask)[] = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ];

    /**
     * The current instant expressed the way WeekDay/YearDay schedules expect: YearDay's LocalStartTime/LocalEndTime
     * are Epoch Time in Seconds "with local time offset" (i.e. the local wall-clock reading, encoded as if it were
     * UTC), and WeekDay's Start/EndHour+Minute are plain local wall-clock time.
     */
    export interface LocalInstant {
        epochS: number;
        minuteOfDay: number;
        dayOfWeek: keyof DoorLock.DaysMask;
    }

    export function localInstant(date: Date): LocalInstant {
        return {
            epochS: Math.floor(
                Date.UTC(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate(),
                    date.getHours(),
                    date.getMinutes(),
                    date.getSeconds(),
                ) / 1000,
            ),
            minuteOfDay: date.getHours() * 60 + date.getMinutes(),
            dayOfWeek: DAYS_OF_WEEK[date.getDay()],
        };
    }

    function matchesWeekDay(schedule: WeekDay, now: LocalInstant): boolean {
        if (!schedule.daysMask[now.dayOfWeek]) {
            return false;
        }
        const start = schedule.startHour * 60 + schedule.startMinute;
        const end = schedule.endHour * 60 + schedule.endMinute;
        return now.minuteOfDay >= start && now.minuteOfDay <= end;
    }

    function matchesYearDay(schedule: YearDay, now: LocalInstant): boolean {
        return now.epochS >= schedule.localStartTime && now.epochS <= schedule.localEndTime;
    }

    /**
     * Evaluate per-user schedule access per Matter spec § 5.2.6.18.2 (YearDayScheduleUser), § 5.2.6.18.3
     * (WeekDayScheduleUser) and § 5.2.6.18.9 (ScheduleRestrictedUser). User types that are not schedule-restricted
     * are always granted here.
     */
    export function isAccessGranted(
        userType: DoorLock.UserType,
        userIndex: number,
        weekDaySchedules: readonly WeekDay[],
        yearDaySchedules: readonly YearDay[],
        now: LocalInstant,
    ): boolean {
        const weekly = weekDaySchedules.filter(s => s.userIndex === userIndex);
        const yearly = yearDaySchedules.filter(s => s.userIndex === userIndex);

        switch (userType) {
            case DoorLock.UserType.WeekDayScheduleUser:
                return weekly.length > 0 && weekly.some(s => matchesWeekDay(s, now));

            case DoorLock.UserType.YearDayScheduleUser:
                return yearly.length > 0 && yearly.some(s => matchesYearDay(s, now));

            case DoorLock.UserType.ScheduleRestrictedUser:
                if (weekly.length === 0 && yearly.length === 0) {
                    return false;
                }
                if (yearly.length === 0) {
                    return weekly.some(s => matchesWeekDay(s, now));
                }
                if (weekly.length === 0) {
                    return yearly.some(s => matchesYearDay(s, now));
                }
                return weekly.some(s => matchesWeekDay(s, now)) && yearly.some(s => matchesYearDay(s, now));

            default:
                return true;
        }
    }
}

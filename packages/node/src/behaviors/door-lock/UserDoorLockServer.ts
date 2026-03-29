/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supervision } from "#behavior/supervision/Supervision.js";
import { Bytes, MaybePromise } from "@matter/general";
import { FabricIndex, NodeId, StatusCode, StatusResponseError } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { LockAuth } from "./LockAuth.js";
import { LockSchedule } from "./LockSchedule.js";
import { NonUserDoorLockServer } from "./NonUserDoorLockServer.js";

import CredentialRule = DoorLock.CredentialRule;
import CredentialType = DoorLock.CredentialType;
import DataOperationType = DoorLock.DataOperationType;
import LockDataType = DoorLock.LockDataType;
import OperationSource = DoorLock.OperationSource;
import UserStatus = DoorLock.UserStatus;
import UserType = DoorLock.UserType;

const UserBase = NonUserDoorLockServer.with(
    "PinCredential",
    "RfidCredential",
    "FingerCredentials",
    "FaceCredentials",
    "User",
    "WeekDayAccessSchedules",
    "YearDayAccessSchedules",
    "HolidaySchedules",
);

/**
 * Stage 2 of the DoorLock server: adds User and schedule features.
 *
 * This class extends {@link NonUserDoorLockServer} with User-feature commands (setUser, getUser, clearUser,
 * setCredential, getCredentialStatus, clearCredential) and schedule commands (week day, year day, holiday).
 */
export class UserDoorLockServer extends UserBase {
    // ── User Database (USR) ──────────────────────────────────────────────────

    override setUser(request: DoorLock.SetUserRequest): MaybePromise {
        const { operationType, userIndex } = request;
        const maxUsers = this.state.numberOfTotalUsersSupported;
        const fabricIndex = this.#fabricIndex;

        if (userIndex < 1 || userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", StatusCode.InvalidCommand);
        }

        const auth = this.auth;
        const existing = auth.findUser(userIndex);

        if (operationType === DataOperationType.Add) {
            if (existing) {
                throw new DoorLock.OccupiedError("User slot is occupied");
            }

            auth.addUser({
                userIndex,
                userName: request.userName ?? "",
                userUniqueId: request.userUniqueId ?? null,
                userStatus: request.userStatus ?? UserStatus.OccupiedEnabled,
                userType: request.userType ?? UserType.UnrestrictedUser,
                credentialRule: request.credentialRule ?? CredentialRule.Single,
                credentials: [],
                creatorFabricIndex: fabricIndex,
                lastModifiedFabricIndex: fabricIndex,
            });

            this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Add, userIndex, fabricIndex, null);
        } else if (operationType === DataOperationType.Modify) {
            if (!existing) {
                throw new StatusResponseError("User slot is available", StatusCode.InvalidCommand);
            }

            if (request.userName !== null && fabricIndex !== existing.creatorFabricIndex) {
                throw new StatusResponseError(
                    "Cannot modify userName from different fabric",
                    StatusCode.InvalidCommand,
                );
            }
            if (request.userUniqueId !== null && fabricIndex !== existing.creatorFabricIndex) {
                throw new StatusResponseError(
                    "Cannot modify userUniqueId from different fabric",
                    StatusCode.InvalidCommand,
                );
            }

            auth.replaceUser(userIndex, {
                ...existing,
                userName: request.userName ?? existing.userName,
                userUniqueId: request.userUniqueId ?? existing.userUniqueId,
                userStatus: request.userStatus ?? existing.userStatus,
                userType: request.userType ?? existing.userType,
                credentialRule: request.credentialRule ?? existing.credentialRule,
                lastModifiedFabricIndex: fabricIndex,
            });

            this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Modify, userIndex, fabricIndex, null);
        } else {
            throw new StatusResponseError("Invalid operation type", StatusCode.InvalidCommand);
        }
    }

    override getUser(request: DoorLock.GetUserRequest): DoorLock.GetUserResponse {
        const maxUsers = this.state.numberOfTotalUsersSupported;

        if (request.userIndex < 1 || request.userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", StatusCode.InvalidCommand);
        }

        const auth = this.auth;
        const user = auth.findUser(request.userIndex);
        const nextUserIndex = auth.findNextOccupiedUserIndex(request.userIndex);

        if (!user) {
            return {
                userIndex: request.userIndex,
                userName: null,
                userUniqueId: null,
                userStatus: null,
                userType: null,
                credentialRule: null,
                credentials: null,
                creatorFabricIndex: null,
                lastModifiedFabricIndex: null,
                nextUserIndex,
            };
        }

        return {
            userIndex: user.userIndex,
            userName: user.userName,
            userUniqueId: user.userUniqueId,
            userStatus: user.userStatus,
            userType: user.userType,
            credentialRule: user.credentialRule,
            credentials: user.credentials.length > 0 ? [...user.credentials] : [],
            creatorFabricIndex: user.creatorFabricIndex,
            lastModifiedFabricIndex: user.lastModifiedFabricIndex,
            nextUserIndex,
        };
    }

    override clearUser(request: DoorLock.ClearUserRequest): MaybePromise {
        const { userIndex } = request;
        const maxUsers = this.state.numberOfTotalUsersSupported;
        const fabricIndex = this.#fabricIndex;
        const auth = this.auth;

        if (userIndex === 0xfffe) {
            for (const user of auth.users) {
                this.#clearCredentialsForUser(auth, user.userIndex);
                this.#clearSchedulesForUser(user.userIndex);
            }
            auth.clearUsers();

            this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Clear, 0xfffe, fabricIndex, null);
            return;
        }

        if (userIndex < 1 || userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", StatusCode.InvalidCommand);
        }

        const user = auth.findUser(userIndex);
        if (!user) {
            // SDK clears nonexistent users silently — no error
            return;
        }

        this.#clearCredentialsForUser(auth, userIndex);
        this.#clearSchedulesForUser(userIndex);
        auth.removeUser(userIndex);

        this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Clear, userIndex, fabricIndex, null);
    }

    // ── Credential Management (USR) ──────────────────────────────────────────

    override setCredential(request: DoorLock.SetCredentialRequest): DoorLock.SetCredentialResponse {
        const { operationType, credential, credentialData, userIndex, userStatus, userType } = request;
        const fabricIndex = this.#fabricIndex;
        const maxCredentials = this.#maxCredentialsForType(credential.credentialType);
        const auth = this.auth;

        if (credential.credentialIndex < 0 || credential.credentialIndex > maxCredentials) {
            return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex: null };
        }

        if (!this.#validateCredentialDataLength(credential.credentialType, credentialData)) {
            return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex: null };
        }

        if (auth.isDuplicateCredential(credential.credentialType, credentialData, credential.credentialIndex)) {
            return { status: StatusCode.Failure, userIndex: null, nextCredentialIndex: null };
        }

        const nextCredentialIndex = auth.findNextAvailableCredentialIndex(
            credential.credentialType,
            credential.credentialIndex,
            maxCredentials,
        );

        if (operationType === DataOperationType.Add) {
            const existingCred = auth.findCredential(credential.credentialType, credential.credentialIndex);
            if (existingCred) {
                return { status: StatusCode.Failure, userIndex: null, nextCredentialIndex };
            }

            auth.addCredential(credential.credentialType, credential.credentialIndex, credentialData, fabricIndex);

            let createdUserIndex: number | null = null;

            if (userIndex === null) {
                const newUserIndex = auth.findAvailableUserIndex(this.state.numberOfTotalUsersSupported);
                if (newUserIndex === null) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: StatusCode.ResourceExhausted, userIndex: null, nextCredentialIndex };
                }

                auth.addUser({
                    userIndex: newUserIndex,
                    userName: "",
                    userUniqueId: 0xffffffff,
                    userStatus: userStatus ?? UserStatus.OccupiedEnabled,
                    userType: userType ?? UserType.UnrestrictedUser,
                    credentialRule: CredentialRule.Single,
                    credentials: [
                        { credentialType: credential.credentialType, credentialIndex: credential.credentialIndex },
                    ],
                    creatorFabricIndex: fabricIndex,
                    lastModifiedFabricIndex: fabricIndex,
                });
                createdUserIndex = newUserIndex;

                this.#emitLockUserChange(
                    LockDataType.UserIndex,
                    DataOperationType.Add,
                    newUserIndex,
                    fabricIndex,
                    credential.credentialIndex,
                );
            } else {
                const user = auth.findUser(userIndex);
                if (!user) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
                }

                if (fabricIndex !== user.creatorFabricIndex) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
                }

                if (user.credentials.length >= this.state.numberOfCredentialsSupportedPerUser) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: StatusCode.ResourceExhausted, userIndex: null, nextCredentialIndex };
                }

                auth.replaceUser(userIndex, {
                    ...user,
                    credentials: [
                        ...user.credentials,
                        { credentialType: credential.credentialType, credentialIndex: credential.credentialIndex },
                    ],
                    lastModifiedFabricIndex: fabricIndex,
                });
            }

            this.#emitLockUserChange(
                LockAuth.credentialTypeToLockDataType(credential.credentialType),
                DataOperationType.Add,
                userIndex ?? createdUserIndex,
                fabricIndex,
                credential.credentialIndex,
            );

            return { status: StatusCode.Success, userIndex: createdUserIndex, nextCredentialIndex };
        } else if (operationType === DataOperationType.Modify) {
            const existingCred = auth.findCredential(credential.credentialType, credential.credentialIndex);
            if (!existingCred) {
                return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
            }

            if (fabricIndex !== existingCred.creatorFabricIndex) {
                return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
            }

            if (userIndex !== null) {
                const user = auth.findUser(userIndex);
                if (!user) {
                    return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
                }
                if (fabricIndex !== user.creatorFabricIndex) {
                    return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
                }
                const hasCredential = user.credentials.some(
                    c =>
                        c.credentialType === credential.credentialType &&
                        c.credentialIndex === credential.credentialIndex,
                );
                if (!hasCredential) {
                    return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex };
                }
            }

            auth.updateCredentialData(
                credential.credentialType,
                credential.credentialIndex,
                credentialData,
                fabricIndex,
            );

            this.#emitLockUserChange(
                LockAuth.credentialTypeToLockDataType(credential.credentialType),
                DataOperationType.Modify,
                userIndex,
                fabricIndex,
                credential.credentialIndex,
            );

            return { status: StatusCode.Success, userIndex: null, nextCredentialIndex };
        }

        return { status: StatusCode.InvalidCommand, userIndex: null, nextCredentialIndex: null };
    }

    override getCredentialStatus(request: DoorLock.GetCredentialStatusRequest): DoorLock.GetCredentialStatusResponse {
        const { credential } = request;
        const auth = this.auth;
        const cred = auth.findCredential(credential.credentialType, credential.credentialIndex);
        const nextCredentialIndex = auth.findNextOccupiedCredentialIndex(
            credential.credentialType,
            credential.credentialIndex,
        );

        if (!cred) {
            return {
                credentialExists: false,
                userIndex: null,
                creatorFabricIndex: null,
                lastModifiedFabricIndex: null,
                nextCredentialIndex,
            };
        }

        const userIndex = auth.findUserIndexForCredential(credential.credentialType, credential.credentialIndex);

        return {
            credentialExists: true,
            userIndex,
            creatorFabricIndex: cred.creatorFabricIndex,
            lastModifiedFabricIndex: cred.lastModifiedFabricIndex,
            nextCredentialIndex,
        };
    }

    override clearCredential(request: DoorLock.ClearCredentialRequest): MaybePromise {
        const { credential } = request;
        const fabricIndex = this.#fabricIndex;
        const auth = this.auth;

        if (credential === null) {
            const typesToClear = [
                CredentialType.Pin,
                CredentialType.Rfid,
                CredentialType.Fingerprint,
                CredentialType.FingerVein,
                CredentialType.Face,
            ];

            for (const type of typesToClear) {
                this.#clearAllCredentialsOfType(auth, type, fabricIndex);
            }
            return;
        }

        if (credential.credentialType === CredentialType.ProgrammingPin) {
            throw new StatusResponseError("Cannot clear ProgrammingPIN", StatusCode.InvalidCommand);
        }

        if (credential.credentialIndex === 0xfffe) {
            this.#clearAllCredentialsOfType(auth, credential.credentialType, fabricIndex);
            return;
        }

        const cred = auth.findCredential(credential.credentialType, credential.credentialIndex);
        if (!cred) {
            throw new StatusResponseError("Credential not found", StatusCode.InvalidCommand);
        }

        this.#removeCredentialFromUsers(auth, credential.credentialType, credential.credentialIndex, fabricIndex);
        auth.removeCredential(credential.credentialType, credential.credentialIndex);

        this.#emitLockUserChange(
            LockAuth.credentialTypeToLockDataType(credential.credentialType),
            DataOperationType.Clear,
            null,
            fabricIndex,
            credential.credentialIndex,
        );
    }

    // ── Schedules (WDSCH, YDSCH, HDSCH) ─────────────────────────────────────

    override setWeekDaySchedule(request: DoorLock.SetWeekDayScheduleRequest): MaybePromise {
        const maxSchedules = this.state.numberOfWeekDaySchedulesSupportedPerUser;
        const { weekDayIndex, userIndex } = request;

        if (weekDayIndex < 1 || weekDayIndex > maxSchedules) {
            throw new StatusResponseError("Invalid schedule index", StatusCode.InvalidCommand);
        }

        this.#requireValidUser(userIndex);

        if (request.endHour < request.startHour) {
            throw new StatusResponseError("End hour must be >= start hour", StatusCode.InvalidCommand);
        }
        if (request.endHour === request.startHour && request.endMinute <= request.startMinute) {
            throw new StatusResponseError("End time must be after start time", StatusCode.InvalidCommand);
        }

        const schedules = this.state.weekDaySchedules.filter(
            s => !(s.weekDayIndex === weekDayIndex && s.userIndex === userIndex),
        );

        const schedule: LockSchedule.WeekDay = {
            weekDayIndex,
            userIndex,
            daysMask: request.daysMask,
            startHour: request.startHour,
            startMinute: request.startMinute,
            endHour: request.endHour,
            endMinute: request.endMinute,
        };

        this.state.weekDaySchedules = [...schedules, schedule];
    }

    override getWeekDaySchedule(request: DoorLock.GetWeekDayScheduleRequest): DoorLock.GetWeekDayScheduleResponse {
        const maxSchedules = this.state.numberOfWeekDaySchedulesSupportedPerUser;
        const { weekDayIndex, userIndex } = request;

        if (
            weekDayIndex < 1 ||
            weekDayIndex > maxSchedules ||
            userIndex < 1 ||
            userIndex > this.state.numberOfTotalUsersSupported
        ) {
            const response = { weekDayIndex, userIndex, status: StatusCode.InvalidCommand };
            Supervision(response, "weekDayIndex").constraint = false;
            Supervision(response, "userIndex").constraint = false;
            return response;
        }

        if (!this.auth.findUser(userIndex)) {
            return { weekDayIndex, userIndex, status: StatusCode.NotFound };
        }

        const schedule = this.state.weekDaySchedules.find(
            s => s.weekDayIndex === weekDayIndex && s.userIndex === userIndex,
        );

        if (!schedule) {
            return { weekDayIndex, userIndex, status: StatusCode.NotFound };
        }

        return {
            weekDayIndex,
            userIndex,
            status: StatusCode.Success,
            daysMask: schedule.daysMask,
            startHour: schedule.startHour,
            startMinute: schedule.startMinute,
            endHour: schedule.endHour,
            endMinute: schedule.endMinute,
        };
    }

    override clearWeekDaySchedule(request: DoorLock.ClearWeekDayScheduleRequest): MaybePromise {
        const { weekDayIndex, userIndex } = request;

        this.#requireValidUser(userIndex);

        if (weekDayIndex === 0xfe) {
            this.state.weekDaySchedules = this.state.weekDaySchedules.filter(s => s.userIndex !== userIndex);
        } else {
            const maxSchedules = this.state.numberOfWeekDaySchedulesSupportedPerUser;
            if (weekDayIndex < 1 || weekDayIndex > maxSchedules) {
                throw new StatusResponseError("Invalid schedule index", StatusCode.InvalidCommand);
            }
            this.state.weekDaySchedules = this.state.weekDaySchedules.filter(
                s => !(s.weekDayIndex === weekDayIndex && s.userIndex === userIndex),
            );
        }
    }

    override setYearDaySchedule(request: DoorLock.SetYearDayScheduleRequest): MaybePromise {
        const maxSchedules = this.state.numberOfYearDaySchedulesSupportedPerUser;
        const { yearDayIndex, userIndex } = request;

        if (yearDayIndex < 1 || yearDayIndex > maxSchedules) {
            throw new StatusResponseError("Invalid schedule index", StatusCode.InvalidCommand);
        }

        this.#requireValidUser(userIndex);

        if (request.localEndTime <= request.localStartTime) {
            throw new StatusResponseError("End time must be after start time", StatusCode.InvalidCommand);
        }

        const schedules = this.state.yearDaySchedules.filter(
            s => !(s.yearDayIndex === yearDayIndex && s.userIndex === userIndex),
        );

        const schedule: LockSchedule.YearDay = {
            yearDayIndex,
            userIndex,
            localStartTime: request.localStartTime,
            localEndTime: request.localEndTime,
        };

        this.state.yearDaySchedules = [...schedules, schedule];
    }

    override getYearDaySchedule(request: DoorLock.GetYearDayScheduleRequest): DoorLock.GetYearDayScheduleResponse {
        const maxSchedules = this.state.numberOfYearDaySchedulesSupportedPerUser;
        const { yearDayIndex, userIndex } = request;

        if (
            yearDayIndex < 1 ||
            yearDayIndex > maxSchedules ||
            userIndex < 1 ||
            userIndex > this.state.numberOfTotalUsersSupported
        ) {
            const response = { yearDayIndex, userIndex, status: StatusCode.InvalidCommand };
            Supervision(response, "yearDayIndex").constraint = false;
            Supervision(response, "userIndex").constraint = false;
            return response;
        }

        if (!this.auth.findUser(userIndex)) {
            return { yearDayIndex, userIndex, status: StatusCode.NotFound };
        }

        const schedule = this.state.yearDaySchedules.find(
            s => s.yearDayIndex === yearDayIndex && s.userIndex === userIndex,
        );

        if (!schedule) {
            return { yearDayIndex, userIndex, status: StatusCode.NotFound };
        }

        return {
            yearDayIndex,
            userIndex,
            status: StatusCode.Success,
            localStartTime: schedule.localStartTime,
            localEndTime: schedule.localEndTime,
        };
    }

    override clearYearDaySchedule(request: DoorLock.ClearYearDayScheduleRequest): MaybePromise {
        const { yearDayIndex, userIndex } = request;

        this.#requireValidUser(userIndex);

        if (yearDayIndex === 0xfe) {
            this.state.yearDaySchedules = this.state.yearDaySchedules.filter(s => s.userIndex !== userIndex);
        } else {
            const maxSchedules = this.state.numberOfYearDaySchedulesSupportedPerUser;
            if (yearDayIndex < 1 || yearDayIndex > maxSchedules) {
                throw new StatusResponseError("Invalid schedule index", StatusCode.InvalidCommand);
            }
            this.state.yearDaySchedules = this.state.yearDaySchedules.filter(
                s => !(s.yearDayIndex === yearDayIndex && s.userIndex === userIndex),
            );
        }
    }

    override setHolidaySchedule(request: DoorLock.SetHolidayScheduleRequest): MaybePromise {
        const maxSchedules = this.state.numberOfHolidaySchedulesSupported;
        const { holidayIndex } = request;

        if (holidayIndex < 1 || holidayIndex > maxSchedules) {
            throw new StatusResponseError("Invalid schedule index", StatusCode.InvalidCommand);
        }

        if (request.localEndTime <= request.localStartTime) {
            throw new StatusResponseError("End time must be after start time", StatusCode.InvalidCommand);
        }

        if (
            request.operatingMode !== DoorLock.OperatingMode.Normal &&
            request.operatingMode !== DoorLock.OperatingMode.Vacation &&
            request.operatingMode !== DoorLock.OperatingMode.Privacy &&
            request.operatingMode !== DoorLock.OperatingMode.NoRemoteLockUnlock &&
            request.operatingMode !== DoorLock.OperatingMode.Passage
        ) {
            throw new StatusResponseError("Invalid operating mode", StatusCode.InvalidCommand);
        }

        const schedules = this.state.holidaySchedules.filter(s => s.holidayIndex !== holidayIndex);

        const schedule: LockSchedule.Holiday = {
            holidayIndex,
            localStartTime: request.localStartTime,
            localEndTime: request.localEndTime,
            operatingMode: request.operatingMode,
        };

        this.state.holidaySchedules = [...schedules, schedule];
    }

    override getHolidaySchedule(request: DoorLock.GetHolidayScheduleRequest): DoorLock.GetHolidayScheduleResponse {
        const maxSchedules = this.state.numberOfHolidaySchedulesSupported;
        const { holidayIndex } = request;

        if (holidayIndex < 1 || holidayIndex > maxSchedules) {
            const response = { holidayIndex, status: StatusCode.InvalidCommand };
            Supervision(response, "holidayIndex").constraint = false;
            return response;
        }

        const schedule = this.state.holidaySchedules.find(s => s.holidayIndex === holidayIndex);

        if (!schedule) {
            return { holidayIndex, status: StatusCode.NotFound };
        }

        return {
            holidayIndex,
            status: StatusCode.Success,
            localStartTime: schedule.localStartTime,
            localEndTime: schedule.localEndTime,
            operatingMode: schedule.operatingMode,
        };
    }

    override clearHolidaySchedule(request: DoorLock.ClearHolidayScheduleRequest): MaybePromise {
        const { holidayIndex } = request;

        if (holidayIndex === 0xfe) {
            this.state.holidaySchedules = [];
        } else {
            const maxSchedules = this.state.numberOfHolidaySchedulesSupported;
            if (holidayIndex < 1 || holidayIndex > maxSchedules) {
                throw new StatusResponseError("Invalid schedule index", StatusCode.InvalidCommand);
            }
            this.state.holidaySchedules = this.state.holidaySchedules.filter(s => s.holidayIndex !== holidayIndex);
        }
    }

    // ── Private Helpers ────────────────────────────────────────────────────────

    get #fabricIndex(): FabricIndex {
        const fabric = this.context.fabric;
        if (fabric === undefined) {
            throw new StatusResponseError("Fabric required", StatusCode.UnsupportedAccess);
        }
        return fabric;
    }

    get #sourceNode(): NodeId | null {
        const context = this.context;
        if ("subject" in context && context.subject?.kind === "node") {
            return context.subject.id;
        }
        return null;
    }

    #emitLockUserChange(
        lockDataType: LockDataType,
        dataOperationType: DataOperationType,
        userIndex: number | null,
        fabricIndex: FabricIndex,
        dataIndex: number | null,
    ) {
        this.events.lockUserChange.emit(
            {
                lockDataType,
                dataOperationType,
                operationSource: OperationSource.Remote,
                userIndex,
                fabricIndex,
                sourceNode: this.#sourceNode,
                dataIndex,
            },
            this.context,
        );
    }

    #requireValidUser(userIndex: number) {
        const maxUsers = this.state.numberOfTotalUsersSupported;
        if (userIndex < 1 || userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", StatusCode.InvalidCommand);
        }
        if (!this.auth.findUser(userIndex)) {
            throw new StatusResponseError("User not found", StatusCode.Failure);
        }
    }

    #maxCredentialsForType(type: CredentialType): number {
        switch (type) {
            case CredentialType.Pin:
            case CredentialType.ProgrammingPin:
                return this.state.numberOfPinUsersSupported;
            case CredentialType.Rfid:
                return this.state.numberOfRfidUsersSupported;
            default:
                return this.state.numberOfTotalUsersSupported;
        }
    }

    #validateCredentialDataLength(type: CredentialType, data: Bytes): boolean {
        switch (type) {
            case CredentialType.Pin:
            case CredentialType.ProgrammingPin: {
                const min = this.state.minPinCodeLength;
                const max = this.state.maxPinCodeLength;
                return data.byteLength >= min && data.byteLength <= max;
            }
            case CredentialType.Rfid: {
                const min = this.state.minRfidCodeLength;
                const max = this.state.maxRfidCodeLength;
                return data.byteLength >= min && data.byteLength <= max;
            }
            default:
                return true;
        }
    }

    #clearCredentialsForUser(auth: LockAuth.Store, userIndex: number) {
        const user = auth.findUser(userIndex);
        if (!user) return;

        for (const cred of user.credentials) {
            auth.removeCredential(cred.credentialType, cred.credentialIndex);
        }
    }

    #clearAllCredentialsOfType(auth: LockAuth.Store, type: CredentialType, fabricIndex: FabricIndex) {
        const credsOfType = auth.credentials.filter(c => c.credentialType === type);
        for (const cred of credsOfType) {
            this.#removeCredentialFromUsers(auth, type, cred.credentialIndex, fabricIndex);
        }
        auth.removeAllCredentialsOfType(type);

        this.#emitLockUserChange(
            LockAuth.credentialTypeToLockDataType(type),
            DataOperationType.Clear,
            null,
            fabricIndex,
            0xfffe,
        );
    }

    #removeCredentialFromUsers(auth: LockAuth.Store, type: CredentialType, index: number, _fabricIndex: FabricIndex) {
        const userIndex = auth.findUserIndexForCredential(type, index);
        if (userIndex === null) return;

        const user = auth.findUser(userIndex);
        if (!user) return;

        // With the User feature, users exist independently of credentials — only remove the credential reference
        auth.replaceUser(userIndex, {
            ...user,
            credentials: user.credentials.filter(c => !(c.credentialType === type && c.credentialIndex === index)),
        });
    }

    #clearSchedulesForUser(userIndex: number) {
        this.state.weekDaySchedules = this.state.weekDaySchedules.filter(s => s.userIndex !== userIndex);
        this.state.yearDaySchedules = this.state.yearDaySchedules.filter(s => s.userIndex !== userIndex);
    }
}

// ── Supervision wiring ────────────────────────────────────────────────────────
//
// Pattern 1: commands that throw on bad input — remap validation errors to INVALID_COMMAND
const throwInvalidCommand = () => {
    throw new StatusResponseError("Invalid field value", StatusCode.InvalidCommand);
};

for (const method of [
    "setUser",
    "getUser",
    "clearUser",
    "setCredential",
    "setWeekDaySchedule",
    "clearWeekDaySchedule",
    "setYearDaySchedule",
    "clearYearDaySchedule",
    "setHolidaySchedule",
    "clearHolidaySchedule",
]) {
    Supervision(UserDoorLockServer, method).onValidationError = throwInvalidCommand;
}

// Pattern 2: get*Schedule commands do their own range checks and return a status response rather than
// throwing — skip constraint validation on the index fields so the handler receives the raw value
for (const field of ["weekDayIndex", "userIndex"]) {
    Supervision(UserDoorLockServer, "getWeekDaySchedule", field).constraint = false;
}
for (const field of ["yearDayIndex", "userIndex"]) {
    Supervision(UserDoorLockServer, "getYearDaySchedule", field).constraint = false;
}
Supervision(UserDoorLockServer, "getHolidaySchedule", "holidayIndex").constraint = false;

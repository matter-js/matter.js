/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supervision } from "#behavior/supervision/Supervision.js";
import {
    AesCipher,
    Bytes,
    type Cipher,
    Crypto,
    Hours,
    ImplementationError,
    Instant,
    Logger,
    MatterError,
    MaybePromise,
    Minutes,
    Seconds,
    Time,
    Timer,
    Timestamp,
} from "@matter/general";
import { field, listOf, nonvolatile, octstr } from "@matter/model";
import { FabricIndex, NodeId, Status, StatusResponseError } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { DoorLockBehavior } from "./DoorLockBehavior.js";
import { LockAuth } from "./LockAuth.js";
import { LockSchedule } from "./LockSchedule.js";

import AlarmCode = DoorLock.AlarmCode;
import CredentialRule = DoorLock.CredentialRule;
import CredentialType = DoorLock.CredentialType;
import DataOperationType = DoorLock.DataOperationType;
import DoorState = DoorLock.DoorState;
import LockDataType = DoorLock.LockDataType;
import LockOperationType = DoorLock.LockOperationType;
import LockState = DoorLock.LockState;
import OperatingMode = DoorLock.OperatingMode;
import OperationError = DoorLock.OperationError;
import OperationSource = DoorLock.OperationSource;
import UserStatus = DoorLock.UserStatus;
import UserType = DoorLock.UserType;

const logger = Logger.get("DoorLockServer");

/** Bounded below the timer maximum; a longer wait re-arms, so a wall clock far behind the deadline cannot overflow */
const MAX_EXPIRY_DELAY = Hours(24);

const OPERATING_MODE_BITS = {
    [OperatingMode.Normal]: "normal",
    [OperatingMode.Vacation]: "vacation",
    [OperatingMode.Privacy]: "privacy",
    [OperatingMode.NoRemoteLockUnlock]: "noRemoteLockUnlock",
    [OperatingMode.Passage]: "passage",
} satisfies Record<OperatingMode, keyof DoorLock.OperatingModes>;

/** Who requests a lock operation, as far as its credential identifies them */
interface LockRequester {
    user: LockAuth.User | null;
    credentials: DoorLock.Credential[] | null;
}

const ANONYMOUS: LockRequester = { user: null, credentials: null };

/**
 * Thrown by {@link DoorLockBaseServer.handleLockOperation} when the lock hardware cannot complete an operation.
 *
 * The server reports {@link reason} in the `LockOperationError` event and answers the command with FAILURE, for
 * example `throw new LockOperationFailedError(DoorLock.OperationError.InsufficientBattery)`. The reason comes first
 * because it is what the server reports; the message defaults to one naming it.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 5.2.6.14, § 5.2.11.4
 */
export class LockOperationFailedError extends MatterError {
    constructor(
        readonly reason: OperationError,
        message = `Lock operation failed: ${OperationError[reason]}`,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}

const DoorLockBaseServerClass = DoorLockBehavior.with(
    "PinCredential",
    "RfidCredential",
    "FingerCredentials",
    "FaceCredentials",
    "DoorPositionSensor",
    "CredentialOverTheAirAccess",
    "Unbolting",
    "User",
    "WeekDayAccessSchedules",
    "YearDayAccessSchedules",
    "HolidaySchedules",
);

/**
 * Full DoorLock server implementation covering all features including User and schedules.
 *
 * The server stores users, credentials, and schedules in nonvolatile extension fields on the State class. Credential
 * data is encrypted at rest with AES-128-CCM by default. Override {@link cipher} for custom encryption (e.g. HSM) or
 * {@link auth} to replace the entire storage backend.
 *
 * To drive real lock hardware, override {@link handleLockOperation} instead of the lock commands, so the hardware moves
 * only for an authorized operation.
 */
export class DoorLockBaseServer extends DoorLockBaseServerClass {
    declare readonly state: DoorLockBaseServer.State;
    declare readonly internal: DoorLockBaseServer.Internal;

    override initialize(): MaybePromise {
        const state = this.state;

        // Default supportedOperatingModes
        if (!Object.values(state.supportedOperatingModes).some(v => v)) {
            state.supportedOperatingModes = { vacation: true, privacy: true, passage: true, alwaysSet: 2047 };
        } else if (state.supportedOperatingModes.alwaysSet !== 2047) {
            throw new ImplementationError(
                `DoorLockServer: The "alwaysSet" bit-range in supportedOperatingModes must be set. Please check the` +
                    ` specification about the meaning of this field because bits are inverted here!`,
            );
        }
        if (!isOperatingModeSupported(state.supportedOperatingModes, OperatingMode.Normal)) {
            throw new ImplementationError(`DoorLockServer: ${unsupportedOperatingMode(OperatingMode.Normal)}`);
        }
        // A controller may have stored a mode that a later SupportedOperatingModes no longer supports
        if (!isOperatingModeSupported(state.supportedOperatingModes, state.operatingMode)) {
            logger.warn(`${unsupportedOperatingMode(state.operatingMode)}; switching to Normal`);
            state.operatingMode = OperatingMode.Normal;
        }
        this.reactTo(this.events.operatingMode$Changing, this.#assertOperatingModeSupported);

        // Initialize internal stores if empty
        if (!state.users) {
            state.users = [];
        }
        if (!state.credentials) {
            state.credentials = [];
        }
        if (!state.weekDaySchedules) {
            state.weekDaySchedules = [];
        }
        if (!state.yearDaySchedules) {
            state.yearDaySchedules = [];
        }
        if (!state.holidaySchedules) {
            state.holidaySchedules = [];
        }

        // Generate encryption key if not present; re-encrypt existing plaintext credentials
        if (!state.credentialKey) {
            state.credentialKey = Bytes.of(this.env.get(Crypto).randomBytes(16));

            if (state.credentials.length > 0) {
                const auth = this.auth;
                state.credentials = state.credentials.map(c => ({
                    ...c,
                    credentialData: auth.encrypt(c.credentialData),
                }));
            }
        }

        this.internal.expireUser = this.callback(this.#expireUser, { lock: true });
        this.internal.autoRelock = this.callback(this.#autoRelock, { lock: true });
        for (const user of this.auth.users) {
            if (
                user.userType === UserType.ExpiringUser &&
                user.userStatus !== UserStatus.OccupiedDisabled &&
                user.expiringUserExpiresAt != null
            ) {
                this.#armExpiryTimer(user.userIndex, user.expiringUserExpiresAt);
            }
        }

        // Subscribe to doorState changes for DPS events
        this.reactTo(this.events.doorState$Changed, this.#handleDoorStateChange);
    }

    override [Symbol.asyncDispose](): MaybePromise {
        this.#stopAutoRelockTimer();
        for (const timer of this.internal.expiryTimers.values()) {
            timer.stop();
        }
        this.internal.expiryTimers.clear();
        return super[Symbol.asyncDispose]();
    }

    // ── Core Lock Operations ─────────────────────────────────────────────────

    override async lockDoor(request: DoorLock.LockDoorRequest) {
        await this.#actuate("lock", request.pinCode);
        this.#stopAutoRelockTimer();
    }

    override async unlockDoor(request: DoorLock.UnlockDoorRequest) {
        await this.#actuate("unlock", request.pinCode);
        this.#scheduleAutoRelock();
    }

    override async unlockWithTimeout(request: DoorLock.UnlockWithTimeoutRequest) {
        await this.#actuate("unlock", request.pinCode);
        this.#scheduleAutoRelock(request.timeout);
    }

    /**
     * Unbolting retracts the bolt without pulling the latch, so the lock ends up Unlocked and reports an Unlock.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 5.2.10.25, § 5.2.11.3
     */
    override async unboltDoor(request: DoorLock.UnboltDoorRequest) {
        await this.#actuate("unbolt", request.pinCode);
        this.#scheduleAutoRelock();
    }

    /**
     * Moves the lock hardware. Override to drive a real lock; the default implementation does nothing.
     *
     * The server calls this once a remote lock command is authorized, before it sets `lockState` and reports the
     * operation, and for auto-relock. Both hold the lock of this behavior, so calls never overlap. Lock commands
     * invoked locally, without a fabric, are refused before this runs.
     *
     * To fail the operation, throw. `lockState` stays unchanged and `LockOperationError` reports the reason of a
     * {@link LockOperationFailedError}, or `Unspecified` for any other error, which is also logged with its stack. A
     * failed command is answered with FAILURE and state written here is discarded; a failed auto-relock keeps such
     * state and is not retried. Report a jam through the `doorLockAlarm` event.
     *
     * Override without `protected`: the {@link DoorLockBaseServer.ExtensionInterface} makes it public on the server
     * types derived with `with()`.
     *
     * @param operation what the hardware has to do and who asked for it
     * @see {@link MatterSpecification.v161.Cluster} § 5.2.10.1, § 5.2.10.2, § 5.2.10.3, § 5.2.10.25
     */
    protected handleLockOperation(_operation: DoorLockBaseServer.LockOperation): MaybePromise {}

    // ── Credential Storage (overridable) ─────────────────────────────────────
    //
    // The default implementation uses reversible encryption (AES-128-CCM) rather than hashing because the legacy
    // non-User commands (getPinCode, getRfidCode) must return plaintext credential data. Deployments where credential
    // secrecy is critical should override `cipher` (for HSM-backed encryption) or `auth` (for an external credential
    // store).

    /**
     * The cipher used for credential encryption. Override to integrate with an HSM or other secure storage.
     */
    get cipher(): Cipher {
        return new AesCipher(this.env.get(Crypto), this.state.credentialKey!);
    }

    /**
     * The credential/user store with integrated encryption. Override to replace the entire storage backend.
     */
    get auth(): LockAuth.Store {
        return new LockAuth.Store(this.state, this.cipher);
    }

    // ── User Database (USR) ──────────────────────────────────────────────────

    override setUser(request: DoorLock.SetUserRequest): MaybePromise {
        const { operationType, userIndex } = request;
        const maxUsers = this.state.numberOfTotalUsersSupported;
        const fabricIndex = this.#fabricIndex;

        if (userIndex < 1 || userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", Status.InvalidCommand);
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
                expiringUserExpiresAt: null,
            });

            this.#warnIfExpiryUnbounded(request.userType);
            this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Add, userIndex, fabricIndex, userIndex);
        } else if (operationType === DataOperationType.Modify) {
            if (!existing) {
                throw new StatusResponseError("User slot is available", Status.InvalidCommand);
            }

            if (request.userName !== null && fabricIndex !== existing.creatorFabricIndex) {
                throw new StatusResponseError("Cannot modify userName from different fabric", Status.InvalidCommand);
            }
            if (request.userUniqueId !== null && fabricIndex !== existing.creatorFabricIndex) {
                throw new StatusResponseError(
                    "Cannot modify userUniqueId from different fabric",
                    Status.InvalidCommand,
                );
            }

            const userStatus = request.userStatus ?? existing.userStatus;
            const userType = request.userType ?? existing.userType;

            // A status or type change starts a new ExpiringUser cycle; the timeout arms again on the next first use
            const restartsExpiry = userStatus !== existing.userStatus || userType !== existing.userType;
            if (restartsExpiry) {
                this.#stopExpiryTimer(userIndex);
            }

            auth.replaceUser(userIndex, {
                ...existing,
                userName: request.userName ?? existing.userName,
                userUniqueId: request.userUniqueId ?? existing.userUniqueId,
                userStatus,
                userType,
                credentialRule: request.credentialRule ?? existing.credentialRule,
                lastModifiedFabricIndex: fabricIndex,
                expiringUserExpiresAt: restartsExpiry ? null : (existing.expiringUserExpiresAt ?? null),
            });

            this.#warnIfExpiryUnbounded(request.userType);
            this.#emitLockUserChange(
                LockDataType.UserIndex,
                DataOperationType.Modify,
                userIndex,
                fabricIndex,
                userIndex,
            );
        } else {
            throw new StatusResponseError("Invalid operation type", Status.InvalidCommand);
        }
    }

    override getUser(request: DoorLock.GetUserRequest): DoorLock.GetUserResponse {
        const maxUsers = this.state.numberOfTotalUsersSupported;

        if (request.userIndex < 1 || request.userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", Status.InvalidCommand);
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
            credentials: [...user.credentials],
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
                this.#stopExpiryTimer(user.userIndex);
            }
            auth.clearUsers();

            this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Clear, 0xfffe, fabricIndex, 0xfffe);
            return;
        }

        if (userIndex < 1 || userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", Status.InvalidCommand);
        }

        const user = auth.findUser(userIndex);
        if (!user) {
            // SDK clears nonexistent users silently — no error
            return;
        }

        this.#clearCredentialsForUser(auth, userIndex);
        this.#clearSchedulesForUser(userIndex);
        this.#stopExpiryTimer(userIndex);
        auth.removeUser(userIndex);

        this.#emitLockUserChange(LockDataType.UserIndex, DataOperationType.Clear, userIndex, fabricIndex, userIndex);
    }

    // ── Credential Management (USR) ──────────────────────────────────────────

    override setCredential(request: DoorLock.SetCredentialRequest): DoorLock.SetCredentialResponse {
        const { operationType, credential, credentialData, userIndex, userStatus, userType } = request;
        const fabricIndex = this.#fabricIndex;
        const maxCredentialIndex = this.#maxCredentialIndexForType(credential.credentialType);
        const auth = this.auth;

        // § 5.2.10.21.3 states NextCredentialIndex independently of the status, so every response carries it
        const nextCredentialIndex = auth.findNextAvailableCredentialIndex(
            credential.credentialType,
            credential.credentialIndex,
            maxCredentialIndex,
        );

        if (!this.#credentialIndexValid(credential.credentialType, credential.credentialIndex, maxCredentialIndex)) {
            return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
        }

        if (!this.#validateCredentialDataLength(credential.credentialType, credentialData)) {
            return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
        }

        if (auth.isDuplicateCredential(credential.credentialType, credentialData, credential.credentialIndex)) {
            return { status: DoorLock.StatusCode.Duplicate, userIndex: null, nextCredentialIndex };
        }

        if (!this.#requestMatchesUseCase(operationType, credential, userIndex, userStatus, userType)) {
            return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
        }

        if (operationType === DataOperationType.Add) {
            const existingCred = auth.findCredential(credential.credentialType, credential.credentialIndex);
            if (existingCred) {
                return { status: DoorLock.StatusCode.Occupied, userIndex: null, nextCredentialIndex };
            }

            auth.addCredential(credential.credentialType, credential.credentialIndex, credentialData, fabricIndex);

            let createdUserIndex: number | null = null;

            if (userIndex === null) {
                const newUserIndex = auth.findAvailableUserIndex(this.state.numberOfTotalUsersSupported);
                if (newUserIndex === null) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: DoorLock.StatusCode.Occupied, userIndex: null, nextCredentialIndex };
                }

                auth.addUser({
                    userIndex: newUserIndex,
                    userName: "",
                    userUniqueId: null,
                    userStatus: userStatus ?? UserStatus.OccupiedEnabled,
                    userType: userType ?? UserType.UnrestrictedUser,
                    credentialRule: CredentialRule.Single,
                    credentials: [
                        { credentialType: credential.credentialType, credentialIndex: credential.credentialIndex },
                    ],
                    creatorFabricIndex: fabricIndex,
                    lastModifiedFabricIndex: fabricIndex,
                    expiringUserExpiresAt: null,
                });
                createdUserIndex = newUserIndex;
                this.#warnIfExpiryUnbounded(userType);

                this.#emitLockUserChange(
                    LockDataType.UserIndex,
                    DataOperationType.Add,
                    newUserIndex,
                    fabricIndex,
                    newUserIndex,
                );
            } else {
                const user = auth.findUser(userIndex);
                if (!user) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
                }

                if (fabricIndex !== user.creatorFabricIndex) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
                }

                if (user.credentials.length >= this.state.numberOfCredentialsSupportedPerUser) {
                    auth.removeCredential(credential.credentialType, credential.credentialIndex);
                    return { status: Status.ResourceExhausted, userIndex: null, nextCredentialIndex };
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

            return { status: Status.Success, userIndex: createdUserIndex, nextCredentialIndex };
        } else if (operationType === DataOperationType.Modify) {
            const existingCred = auth.findCredential(credential.credentialType, credential.credentialIndex);
            if (!existingCred) {
                return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
            }

            if (fabricIndex !== existingCred.creatorFabricIndex) {
                return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
            }

            if (userIndex !== null) {
                const user = auth.findUser(userIndex);
                if (!user) {
                    return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
                }
                if (fabricIndex !== user.creatorFabricIndex) {
                    return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
                }
                const hasCredential = user.credentials.some(
                    c =>
                        c.credentialType === credential.credentialType &&
                        c.credentialIndex === credential.credentialIndex,
                );
                if (!hasCredential) {
                    return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
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
                userIndex ?? auth.findUserIndexForCredential(credential.credentialType, credential.credentialIndex),
                fabricIndex,
                credential.credentialIndex,
            );

            return { status: Status.Success, userIndex: null, nextCredentialIndex };
        }

        return { status: Status.InvalidCommand, userIndex: null, nextCredentialIndex };
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
            throw new StatusResponseError("Cannot clear ProgrammingPIN", Status.InvalidCommand);
        }

        if (credential.credentialIndex === 0xfffe) {
            this.#clearAllCredentialsOfType(auth, credential.credentialType, fabricIndex);
            return;
        }

        const cred = auth.findCredential(credential.credentialType, credential.credentialIndex);
        if (!cred) {
            throw new StatusResponseError("Credential not found", Status.InvalidCommand);
        }

        const owner = auth.findUserIndexForCredential(credential.credentialType, credential.credentialIndex);
        this.#removeCredentialFromUsers(auth, credential.credentialType, credential.credentialIndex);
        auth.removeCredential(credential.credentialType, credential.credentialIndex);

        this.#emitLockUserChange(
            LockAuth.credentialTypeToLockDataType(credential.credentialType),
            DataOperationType.Clear,
            owner,
            fabricIndex,
            credential.credentialIndex,
        );
    }

    // ── Schedules (WDSCH, YDSCH, HDSCH) ─────────────────────────────────────

    override setWeekDaySchedule(request: DoorLock.SetWeekDayScheduleRequest): MaybePromise {
        const maxSchedules = this.state.numberOfWeekDaySchedulesSupportedPerUser;
        const { weekDayIndex, userIndex } = request;

        if (weekDayIndex < 1 || weekDayIndex > maxSchedules) {
            throw new StatusResponseError("Invalid schedule index", Status.InvalidCommand);
        }

        this.#requireValidUser(userIndex);

        if (request.endHour < request.startHour) {
            throw new StatusResponseError("End hour must be >= start hour", Status.InvalidCommand);
        }
        if (request.endHour === request.startHour && request.endMinute <= request.startMinute) {
            throw new StatusResponseError("End time must be after start time", Status.InvalidCommand);
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
        this.#emitLockUserChange(
            LockDataType.WeekDaySchedule,
            DataOperationType.Add,
            userIndex,
            this.#fabricIndex,
            weekDayIndex,
        );
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
            const response = { weekDayIndex, userIndex, status: Status.InvalidCommand };
            Supervision(response, "weekDayIndex").constraint = false;
            Supervision(response, "userIndex").constraint = false;
            return response;
        }

        if (!this.auth.findUser(userIndex)) {
            return { weekDayIndex, userIndex, status: Status.NotFound };
        }

        const schedule = this.state.weekDaySchedules.find(
            s => s.weekDayIndex === weekDayIndex && s.userIndex === userIndex,
        );

        if (!schedule) {
            return { weekDayIndex, userIndex, status: Status.NotFound };
        }

        return {
            weekDayIndex,
            userIndex,
            status: Status.Success,
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
                throw new StatusResponseError("Invalid schedule index", Status.InvalidCommand);
            }
            this.state.weekDaySchedules = this.state.weekDaySchedules.filter(
                s => !(s.weekDayIndex === weekDayIndex && s.userIndex === userIndex),
            );
        }
        this.#emitLockUserChange(
            LockDataType.WeekDaySchedule,
            DataOperationType.Clear,
            userIndex,
            this.#fabricIndex,
            weekDayIndex,
        );
    }

    override setYearDaySchedule(request: DoorLock.SetYearDayScheduleRequest): MaybePromise {
        const maxSchedules = this.state.numberOfYearDaySchedulesSupportedPerUser;
        const { yearDayIndex, userIndex } = request;

        if (yearDayIndex < 1 || yearDayIndex > maxSchedules) {
            throw new StatusResponseError("Invalid schedule index", Status.InvalidCommand);
        }

        this.#requireValidUser(userIndex);

        if (request.localEndTime <= request.localStartTime) {
            throw new StatusResponseError("End time must be after start time", Status.InvalidCommand);
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
        this.#emitLockUserChange(
            LockDataType.YearDaySchedule,
            DataOperationType.Add,
            userIndex,
            this.#fabricIndex,
            yearDayIndex,
        );
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
            const response = { yearDayIndex, userIndex, status: Status.InvalidCommand };
            Supervision(response, "yearDayIndex").constraint = false;
            Supervision(response, "userIndex").constraint = false;
            return response;
        }

        if (!this.auth.findUser(userIndex)) {
            return { yearDayIndex, userIndex, status: Status.NotFound };
        }

        const schedule = this.state.yearDaySchedules.find(
            s => s.yearDayIndex === yearDayIndex && s.userIndex === userIndex,
        );

        if (!schedule) {
            return { yearDayIndex, userIndex, status: Status.NotFound };
        }

        return {
            yearDayIndex,
            userIndex,
            status: Status.Success,
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
                throw new StatusResponseError("Invalid schedule index", Status.InvalidCommand);
            }
            this.state.yearDaySchedules = this.state.yearDaySchedules.filter(
                s => !(s.yearDayIndex === yearDayIndex && s.userIndex === userIndex),
            );
        }
        this.#emitLockUserChange(
            LockDataType.YearDaySchedule,
            DataOperationType.Clear,
            userIndex,
            this.#fabricIndex,
            yearDayIndex,
        );
    }

    override setHolidaySchedule(request: DoorLock.SetHolidayScheduleRequest): MaybePromise {
        const maxSchedules = this.state.numberOfHolidaySchedulesSupported;
        const { holidayIndex } = request;

        if (holidayIndex < 1 || holidayIndex > maxSchedules) {
            throw new StatusResponseError("Invalid schedule index", Status.InvalidCommand);
        }

        if (request.localEndTime <= request.localStartTime) {
            throw new StatusResponseError("End time must be after start time", Status.InvalidCommand);
        }

        const schedules = this.state.holidaySchedules.filter(s => s.holidayIndex !== holidayIndex);

        const schedule: LockSchedule.Holiday = {
            holidayIndex,
            localStartTime: request.localStartTime,
            localEndTime: request.localEndTime,
            operatingMode: request.operatingMode,
        };

        this.state.holidaySchedules = [...schedules, schedule];
        this.#emitLockUserChange(
            LockDataType.HolidaySchedule,
            DataOperationType.Add,
            null,
            this.#fabricIndex,
            holidayIndex,
        );
    }

    override getHolidaySchedule(request: DoorLock.GetHolidayScheduleRequest): DoorLock.GetHolidayScheduleResponse {
        const maxSchedules = this.state.numberOfHolidaySchedulesSupported;
        const { holidayIndex } = request;

        if (holidayIndex < 1 || holidayIndex > maxSchedules) {
            const response = { holidayIndex, status: Status.InvalidCommand };
            Supervision(response, "holidayIndex").constraint = false;
            return response;
        }

        const schedule = this.state.holidaySchedules.find(s => s.holidayIndex === holidayIndex);

        if (!schedule) {
            return { holidayIndex, status: Status.NotFound };
        }

        return {
            holidayIndex,
            status: Status.Success,
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
                throw new StatusResponseError("Invalid schedule index", Status.InvalidCommand);
            }
            this.state.holidaySchedules = this.state.holidaySchedules.filter(s => s.holidayIndex !== holidayIndex);
        }
        this.#emitLockUserChange(
            LockDataType.HolidaySchedule,
            DataOperationType.Clear,
            null,
            this.#fabricIndex,
            holidayIndex,
        );
    }

    // ── Private Helpers ────────────────────────────────────────────────────────

    get #fabricIndex(): FabricIndex {
        const fabric = this.context.fabric;
        if (fabric === undefined) {
            throw new StatusResponseError("Fabric required", Status.UnsupportedAccess);
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

    #stopAutoRelockTimer() {
        this.internal.autoRelockTimer?.stop();
        this.internal.autoRelockTimer = undefined;
    }

    #scheduleAutoRelock(timeoutSeconds?: number) {
        this.#stopAutoRelockTimer();

        const timeout = timeoutSeconds ?? this.state.autoRelockTime;
        if (timeout === undefined || timeout === 0) {
            return;
        }

        const { internal } = this;
        const timer = Time.getTimer("auto-relock", Seconds(timeout), () => internal.autoRelock?.(timer));
        internal.autoRelockTimer = timer.start();
    }

    async #autoRelock(timer: Timer) {
        // A lock operation that ran while this relock waited for the lock replaced or stopped its timer
        if (timer !== this.internal.autoRelockTimer || this.state.lockState === LockState.Locked) {
            return;
        }
        this.internal.autoRelockTimer = undefined;

        const operation: DoorLockBaseServer.LockOperation = {
            actuation: "lock",
            source: OperationSource.Auto,
            userIndex: null,
        };
        try {
            await this.handleLockOperation(operation);
        } catch (error) {
            this.events.lockOperationError.emit(
                {
                    lockOperationType: LockOperationType.Lock,
                    operationSource: OperationSource.Auto,
                    operationError: hardwareFailureReason(operation, error),
                    userIndex: null,
                    fabricIndex: null,
                    sourceNode: null,
                    credentials: null,
                },
                this.context,
            );
            return;
        }

        this.state.lockState = LockState.Locked;
        this.events.lockOperation.emit(
            {
                lockOperationType: LockOperationType.Lock,
                operationSource: OperationSource.Auto,
                userIndex: null,
                fabricIndex: null,
                sourceNode: null,
                credentials: null,
            },
            this.context,
        );
    }

    // ── Authorization ──────────────────────────────────────────────────────────

    async #actuate(actuation: DoorLockBaseServer.Actuation, pinCode: Bytes | undefined) {
        // Events of a lock operation name the requesting fabric; without one the hardware must not move
        if (this.context.fabric === undefined) {
            throw new StatusResponseError(
                "Lock commands need the fabric of a remote requester",
                Status.UnsupportedAccess,
            );
        }

        const locking = actuation === "lock";
        const operationType = locking ? LockOperationType.Lock : LockOperationType.Unlock;
        const requester = this.#authorize(operationType, pinCode);

        const operation: DoorLockBaseServer.LockOperation = {
            actuation,
            source: OperationSource.Remote,
            userIndex: requester.user?.userIndex ?? null,
        };
        try {
            await this.handleLockOperation(operation);
        } catch (error) {
            this.#emitLockOperationError(operationType, hardwareFailureReason(operation, error), requester);
            throw new StatusResponseError(`Lock hardware failed to ${actuation}`, Status.Failure);
        }

        this.state.lockState = locking ? LockState.Locked : LockState.Unlocked;
        this.#completeOperation(operationType, requester);
    }

    /**
     * The single decision every remote lock operation passes before the lock moves.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 5.2.6.15, § 5.2.6.18, § 5.2.10.1
     */
    #authorize(operationType: LockOperationType, pinCode: Bytes | undefined): LockRequester {
        const { operatingMode } = this.state;
        if (operatingMode === OperatingMode.Privacy || operatingMode === OperatingMode.NoRemoteLockUnlock) {
            this.#emitLockOperationError(operationType, OperationError.Unspecified);
            throw new StatusResponseError(
                `Remote lock operations are disabled in operating mode ${OperatingMode[operatingMode]}`,
                Status.Failure,
            );
        }

        if (this.#isLockedOut) {
            throw new StatusResponseError("Lock operations are ignored during the wrong code lockout", Status.Failure);
        }

        if (pinCode === undefined) {
            if (this.state.requirePinForRemoteOperation) {
                this.#refuseWrongCode(operationType, "PIN required for remote operation");
            }
            return ANONYMOUS;
        }

        const requester = this.#identifyPin(pinCode);
        if (requester === undefined) {
            this.#refuseWrongCode(operationType, "Invalid PIN code");
        }

        if (requester.user !== null) {
            this.#authorizeUser(operationType, requester, requester.user);
        }

        return requester;
    }

    #authorizeUser(operationType: LockOperationType, requester: LockRequester, user: LockAuth.User) {
        const { userIndex } = user;
        const expired = hasExpired(user);
        if (expired && user.userStatus !== UserStatus.OccupiedDisabled) {
            this.#armExpiryTimer(userIndex, user.expiringUserExpiresAt);
        }

        if (user.userStatus === UserStatus.OccupiedDisabled || expired) {
            this.#emitLockOperationError(operationType, OperationError.DisabledUserDenied, requester);
            throw new StatusResponseError("User is disabled", Status.Failure);
        }

        if (
            !LockSchedule.isAccessGranted(
                user.userType,
                userIndex,
                this.state.weekDaySchedules,
                this.state.yearDaySchedules,
                LockSchedule.localInstant(Time.now),
            )
        ) {
            this.#emitLockOperationError(operationType, OperationError.Restricted, requester);
            throw new StatusResponseError("Access denied by schedule", Status.Failure);
        }

        if (user.userType === UserType.ExpiringUser && this.state.expiringUserTimeout === undefined) {
            this.#emitLockOperationError(operationType, OperationError.Restricted, requester);
            throw new StatusResponseError(
                "ExpiringUser cannot be granted access without ExpiringUserTimeout",
                Status.Failure,
            );
        }

        if (user.userType === UserType.NonAccessUser) {
            this.#emitLockOperation(LockOperationType.NonAccessUserEvent, requester);
            throw new StatusResponseError("NonAccessUser cannot operate the lock", Status.Failure);
        }
    }

    #completeOperation(operationType: LockOperationType, requester: LockRequester) {
        const { user, credentials } = requester;
        if (credentials !== null) {
            this.internal.wrongCodeCount = 0;
        }

        if (user?.userType === UserType.ForcedUser) {
            this.#emitLockOperation(LockOperationType.ForcedUserEvent, requester);
            this.events.doorLockAlarm.emit({ alarmCode: AlarmCode.ForcedUser }, this.context);
        } else {
            this.#emitLockOperation(operationType, requester);
        }

        if (user === null) {
            return;
        }

        // A DisposableUser may open the lock once; locking does not use that up
        if (user.userType === UserType.DisposableUser && operationType === LockOperationType.Unlock) {
            this.#disableUser(this.auth, user.userIndex, user);
        }
        this.#armExpiringUserOnFirstUse(this.auth, user.userIndex, user);
    }

    #identifyPin(pinCode: Bytes): LockRequester | undefined {
        const auth = this.auth;
        for (const cred of auth.credentials) {
            if (
                cred.credentialType !== CredentialType.Pin ||
                !Bytes.areEqual(auth.decrypt(cred.credentialData), pinCode)
            ) {
                continue;
            }

            // § 5.2.4.1 associates every PIN with a user; one that no user holds counts as a wrong code, as in CHIP
            const userIndex = auth.findUserIndexForCredential(CredentialType.Pin, cred.credentialIndex);
            const user = userIndex === null ? undefined : auth.findUser(userIndex);
            if (user === undefined) {
                return;
            }

            return {
                user,
                credentials: [{ credentialType: CredentialType.Pin, credentialIndex: cred.credentialIndex }],
            };
        }
    }

    /**
     * Counts a wrong or missing code and starts the lockout once {@link State.wrongCodeEntryLimit} is reached; both
     * lockout attributes must be set for either to happen.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 5.2.9.32, § 5.2.9.33, § 5.2.10.1.1
     */
    #refuseWrongCode(operationType: LockOperationType, message: string): never {
        const { wrongCodeEntryLimit, userCodeTemporaryDisableTime } = this.state;
        const { internal } = this;
        if (
            wrongCodeEntryLimit !== undefined &&
            userCodeTemporaryDisableTime !== undefined &&
            ++internal.wrongCodeCount >= wrongCodeEntryLimit
        ) {
            internal.wrongCodeCount = 0;
            internal.lockoutEndsAt = Timestamp(Time.nowUs + Seconds(userCodeTemporaryDisableTime));
            this.events.doorLockAlarm.emit({ alarmCode: AlarmCode.WrongCodeEntryLimit }, this.context);
        }

        this.#emitLockOperationError(operationType, OperationError.InvalidCredential);
        throw new StatusResponseError(message, Status.Failure);
    }

    get #isLockedOut() {
        const { lockoutEndsAt } = this.internal;
        return lockoutEndsAt !== undefined && Time.nowUs < lockoutEndsAt;
    }

    #assertOperatingModeSupported(operatingMode: OperatingMode) {
        if (!isOperatingModeSupported(this.state.supportedOperatingModes, operatingMode)) {
            throw new StatusResponseError(unsupportedOperatingMode(operatingMode), Status.ConstraintError);
        }
    }

    // ── ExpiringUser Timeout (spec § 5.2.6.18.8) ─────────────────────────────────
    //
    // The persisted deadline is the source of truth; the timer only triggers a re-check against it. The deadline
    // is wall-clock time because it has to survive a reboot. Expiry is applied only in the timer's own action.

    #armExpiringUserOnFirstUse(auth: LockAuth.Store, userIndex: number, user: LockAuth.User) {
        if (user.userType !== UserType.ExpiringUser || user.expiringUserExpiresAt != null) {
            return;
        }

        const timeoutMinutes = this.state.expiringUserTimeout;
        if (timeoutMinutes === undefined) {
            return;
        }

        const expiresAt = Timestamp(Time.nowMs + Minutes(timeoutMinutes));
        auth.replaceUser(userIndex, { ...user, expiringUserExpiresAt: expiresAt });
        this.#armExpiryTimer(userIndex, expiresAt);
    }

    #armExpiryTimer(userIndex: number, expiresAt: Timestamp) {
        this.#stopExpiryTimer(userIndex);

        const remaining = Timestamp.delta(Time.nowMs, expiresAt);
        const { internal } = this;
        const delay = remaining <= 0 ? Instant : remaining > MAX_EXPIRY_DELAY ? MAX_EXPIRY_DELAY : remaining;
        const timer = Time.getTimer("expiring-user-timeout", delay, () => internal.expireUser?.(userIndex)).start();
        internal.expiryTimers.set(userIndex, timer);
    }

    #warnIfExpiryUnbounded(userType: UserType | null) {
        if (userType === UserType.ExpiringUser && this.state.expiringUserTimeout === undefined) {
            logger.warn(
                "ExpiringUser provisioned without ExpiringUserTimeout; its PIN is denied until the attribute is set",
            );
        }
    }

    #stopExpiryTimer(userIndex: number) {
        this.internal.expiryTimers.get(userIndex)?.stop();
        this.internal.expiryTimers.delete(userIndex);
    }

    #expireUser(userIndex: number) {
        const { expiryTimers } = this.internal;
        if (expiryTimers.get(userIndex)?.isRunning === false) {
            expiryTimers.delete(userIndex);
        }

        const auth = this.auth;
        const user = auth.findUser(userIndex);
        if (
            user?.userType !== UserType.ExpiringUser ||
            user.userStatus === UserStatus.OccupiedDisabled ||
            user.expiringUserExpiresAt == null
        ) {
            return;
        }

        if (!hasExpired(user)) {
            this.#armExpiryTimer(userIndex, user.expiringUserExpiresAt);
            return;
        }

        this.#disableUser(auth, userIndex, user);
    }

    #disableUser(auth: LockAuth.Store, userIndex: number, user: LockAuth.User) {
        auth.replaceUser(userIndex, { ...user, userStatus: UserStatus.OccupiedDisabled });

        this.events.lockUserChange.emit(
            {
                lockDataType: LockDataType.UserIndex,
                dataOperationType: DataOperationType.Modify,
                operationSource: OperationSource.Unspecified,
                userIndex,
                fabricIndex: null,
                sourceNode: null,
                dataIndex: userIndex,
            },
            this.context,
        );
    }

    // ── Event Emission ─────────────────────────────────────────────────────────

    #emitLockOperation(operationType: LockOperationType, { user, credentials }: LockRequester) {
        this.events.lockOperation.emit(
            {
                lockOperationType: operationType,
                operationSource: OperationSource.Remote,
                userIndex: user?.userIndex ?? null,
                fabricIndex: this.#fabricIndex,
                sourceNode: this.#sourceNode,
                credentials,
            },
            this.context,
        );
    }

    #emitLockOperationError(
        operationType: LockOperationType,
        error: OperationError,
        { user, credentials }: LockRequester = ANONYMOUS,
    ) {
        this.events.lockOperationError.emit(
            {
                lockOperationType: operationType,
                operationSource: OperationSource.Remote,
                operationError: error,
                userIndex: user?.userIndex ?? null,
                fabricIndex: this.#fabricIndex,
                sourceNode: this.#sourceNode,
                credentials,
            },
            this.context,
        );
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

    // ── DPS ────────────────────────────────────────────────────────────────────

    #handleDoorStateChange(value: DoorState | null) {
        if (value === null) {
            return;
        }

        this.events.doorStateChange.emit({ doorState: value }, this.context);

        if (value === DoorState.DoorOpen) {
            if (this.state.doorOpenEvents !== undefined) {
                this.state.doorOpenEvents++;
            }
        } else if (value === DoorState.DoorClosed) {
            if (this.state.doorClosedEvents !== undefined) {
                this.state.doorClosedEvents++;
            }
        }
    }

    // ── User/Credential/Schedule helpers ───────────────────────────────────────

    #requireValidUser(userIndex: number) {
        const maxUsers = this.state.numberOfTotalUsersSupported;
        if (userIndex < 1 || userIndex > maxUsers) {
            throw new StatusResponseError("Invalid user index", Status.InvalidCommand);
        }
        if (!this.auth.findUser(userIndex)) {
            throw new StatusResponseError("User not found", Status.Failure);
        }
    }

    /**
     * § 5.2.10.20 states what each SetCredential use case carries. Only the case that creates a user alongside the
     * credential carries user fields; the others state them as null. The values each field may hold are the command's
     * own constraint, enforced before the request reaches us.
     */
    #requestMatchesUseCase(
        operationType: DataOperationType,
        credential: DoorLock.Credential,
        userIndex: number | null,
        userStatus: UserStatus | null,
        userType: UserType | null,
    ): boolean {
        if (operationType === DataOperationType.Add && userIndex === null) {
            return userType !== UserType.ProgrammingUser;
        }

        // Reached only for a credential index the type permits, so the programming PIN is already at index 0
        if (operationType === DataOperationType.Modify && userIndex === null) {
            return (
                userStatus === null &&
                userType === UserType.ProgrammingUser &&
                credential.credentialType === CredentialType.ProgrammingPin
            );
        }

        return userStatus === null && userType === null;
    }

    /**
     * § 5.2.6.24.2 states index 0 for a credential type that indexes into nothing, of which the programming PIN is
     * the only one, so every other type indexes from 1.
     */
    #credentialIndexValid(type: CredentialType, index: number, maxIndex: number): boolean {
        if (type === CredentialType.ProgrammingPin) {
            return index === 0;
        }

        return index >= 1 && index <= maxIndex;
    }

    #maxCredentialIndexForType(type: CredentialType): number {
        switch (type) {
            // Indexes into nothing, so there is no slot to scan and none to report
            case CredentialType.ProgrammingPin:
                return 0;
            case CredentialType.Pin:
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
            this.#removeCredentialFromUsers(auth, type, cred.credentialIndex);
        }
        auth.removeAllCredentialsOfType(type);

        this.#emitLockUserChange(
            LockAuth.credentialTypeToLockDataType(type),
            DataOperationType.Clear,
            0xfffe,
            fabricIndex,
            0xfffe,
        );
    }

    #removeCredentialFromUsers(auth: LockAuth.Store, type: CredentialType, index: number) {
        const userIndex = auth.findUserIndexForCredential(type, index);
        if (userIndex === null) return;

        const user = auth.findUser(userIndex);
        if (!user) return;

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
    throw new StatusResponseError("Invalid field value", Status.InvalidCommand);
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
    Supervision(DoorLockBaseServer, method).onValidationError = throwInvalidCommand;
}

// Pattern 2: get*Schedule commands do their own range checks and return a status response rather than
// throwing — skip constraint validation on the index fields so the handler receives the raw value
for (const fieldName of ["weekDayIndex", "userIndex"]) {
    Supervision(DoorLockBaseServer, "getWeekDaySchedule", fieldName).constraint = false;
}
for (const fieldName of ["yearDayIndex", "userIndex"]) {
    Supervision(DoorLockBaseServer, "getYearDaySchedule", fieldName).constraint = false;
}
Supervision(DoorLockBaseServer, "getHolidaySchedule", "holidayIndex").constraint = false;

export namespace DoorLockBaseServer {
    /** The movement a lock operation asks of the hardware; "unbolt" retracts the bolt without pulling the latch */
    export type Actuation = "lock" | "unlock" | "unbolt";

    /** A lock operation {@link DoorLockBaseServer.handleLockOperation} carries out */
    export interface LockOperation {
        actuation: Actuation;

        /** `Remote` for a command, `Auto` for auto-relock */
        source: DoorLock.OperationSource;

        /** The user the PIN of a remote operation identifies */
        userIndex: number | null;
    }

    export class State extends DoorLockBaseServerClass.State {
        /**
         * Internal user database.
         */
        @field(listOf(LockAuth.User), nonvolatile)
        users: LockAuth.User[] = [];

        /**
         * Internal credential store.
         */
        @field(listOf(LockAuth.Credential), nonvolatile)
        credentials: LockAuth.Credential[] = [];

        /**
         * Internal week day schedule store.
         */
        @field(listOf(LockSchedule.WeekDay), nonvolatile)
        weekDaySchedules: LockSchedule.WeekDay[] = [];

        /**
         * Internal year day schedule store.
         */
        @field(listOf(LockSchedule.YearDay), nonvolatile)
        yearDaySchedules: LockSchedule.YearDay[] = [];

        /**
         * Internal holiday schedule store.
         */
        @field(listOf(LockSchedule.Holiday), nonvolatile)
        holidaySchedules: LockSchedule.Holiday[] = [];

        /**
         * AES-128-CCM key for credential encryption. Auto-generated on first use.
         */
        @field(octstr, nonvolatile)
        credentialKey?: Bytes;
    }

    export class Internal {
        wrongCodeCount = 0;
        lockoutEndsAt?: Timestamp;
        autoRelockTimer?: Timer;
        expiryTimers = new Map<number, Timer>();
        expireUser?: (userIndex: number) => void;
        autoRelock?: (timer: Timer) => void;
    }

    export declare const ExtensionInterface: {
        handleLockOperation(operation: LockOperation): MaybePromise;
    };
}

/**
 * Default DoorLock server with no features enabled. Use `.with()` to enable features.
 */
export class DoorLockServer extends DoorLockBaseServer.with() {}

function hasExpired(user: LockAuth.User): user is LockAuth.User & { expiringUserExpiresAt: Timestamp } {
    const { userType, expiringUserExpiresAt } = user;
    return userType === UserType.ExpiringUser && expiringUserExpiresAt != null && expiringUserExpiresAt <= Time.nowMs;
}

/** A set bit marks the mode as not supported (§ 5.2.9.25) */
function isOperatingModeSupported(supported: DoorLock.OperatingModes, mode: OperatingMode) {
    return !supported[OPERATING_MODE_BITS[mode]];
}

function hardwareFailureReason({ actuation, source }: DoorLockBaseServer.LockOperation, error: unknown) {
    // A failed relock leaves the door unlocked until someone acts; a remote peer can repeat its failing command
    const relocking = source === OperationSource.Auto;
    if (!(error instanceof LockOperationFailedError)) {
        if (relocking) {
            logger.warn(`Lock hardware failed to ${actuation}:`, error);
        } else {
            logger.info(`Lock hardware failed to ${actuation}:`, error);
        }
        return OperationError.Unspecified;
    }

    const message = `Lock hardware could not ${actuation}: ${error.message}`;
    if (relocking) {
        logger.notice(message);
    } else {
        logger.info(message);
    }
    return error.reason;
}

function unsupportedOperatingMode(mode: OperatingMode) {
    return `OperatingMode ${OperatingMode[mode]} is marked unsupported (bit set) in SupportedOperatingModes`;
}

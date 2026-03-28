/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supervision } from "#behavior/supervision/Supervision.js";
import { AesCipher, Bytes, type Cipher, Crypto, Logger, MaybePromise, Seconds, Time, Timer } from "@matter/general";
import { field, listOf, nonvolatile, octstr } from "@matter/model";
import { FabricIndex, NodeId, StatusCode, StatusResponseError } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { DoorLockBehavior } from "./DoorLockBehavior.js";
import { LockAuth } from "./LockAuth.js";
import { LockSchedule } from "./LockSchedule.js";

const logger = Logger.get("DoorLockServer");

import AlarmCode = DoorLock.AlarmCode;
import CredentialRule = DoorLock.CredentialRule;
import CredentialType = DoorLock.CredentialType;
import DoorState = DoorLock.DoorState;
import LockOperationType = DoorLock.LockOperationType;
import LockState = DoorLock.LockState;
import OperationError = DoorLock.OperationError;
import OperationSource = DoorLock.OperationSource;
import UserStatus = DoorLock.UserStatus;
import UserType = DoorLock.UserType;

const NonUserBase = DoorLockBehavior.with(
    "PinCredential",
    "RfidCredential",
    "FingerCredentials",
    "FaceCredentials",
    "DoorPositionSensor",
    "CredentialOverTheAirAccess",
    "Unbolting",
);

/**
 * Stage 1 of the DoorLock server: all features except User and schedules.
 *
 * This implementation includes credential and lock features of {@link DoorLock}, implementing all mandatory commands
 * for non-user locks. Commands that require the User feature (including schedules) are in
 * {@link UserDoorLockServer}.
 *
 * The server stores users, credentials, and schedules in nonvolatile extension fields on the State class. Credential
 * data is encrypted at rest with AES-128-CCM by default. Override {@link cipher} for custom encryption (e.g. HSM) or
 * {@link auth} to replace the entire storage backend.
 */
export class NonUserDoorLockServer extends NonUserBase {
    declare readonly state: NonUserDoorLockServer.State;
    declare readonly internal: NonUserDoorLockServer.Internal;

    override initialize(): MaybePromise {
        const state = this.state;

        // Default supportedOperatingModes
        if (!Object.values(state.supportedOperatingModes).some(v => v)) {
            state.supportedOperatingModes = { vacation: true, privacy: true, passage: true, alwaysSet: 2047 };
        } else if (state.supportedOperatingModes.alwaysSet !== 2047) {
            logger.warn(
                "The 'alwaysSet' bit-range in supportedOperatingModes must be 2047. Bits are inverted in this field.",
            );
        }

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

        // Subscribe to doorState changes for DPS events
        this.reactTo(this.events.doorState$Changed, this.#handleDoorStateChange);
    }

    override [Symbol.asyncDispose](): MaybePromise {
        this.#stopAutoRelockTimer();
        return super[Symbol.asyncDispose]();
    }

    // ── Core Lock Operations ─────────────────────────────────────────────────

    override lockDoor(request: DoorLock.LockDoorRequest): MaybePromise {
        this.#validatePinIfRequired(request.pinCode, LockOperationType.Lock);
        this.state.lockState = LockState.Locked;
        this.#stopAutoRelockTimer();
        this.#emitLockOperation(LockOperationType.Lock, request.pinCode);
    }

    override unlockDoor(request: DoorLock.UnlockDoorRequest): MaybePromise {
        this.#validatePinIfRequired(request.pinCode, LockOperationType.Unlock);
        this.state.lockState = LockState.Unlocked;
        this.#emitLockOperation(LockOperationType.Unlock, request.pinCode);
        this.#scheduleAutoRelock();
    }

    override unlockWithTimeout(request: DoorLock.UnlockWithTimeoutRequest): MaybePromise {
        this.#validatePinIfRequired(request.pinCode, LockOperationType.Unlock);
        this.state.lockState = LockState.Unlocked;
        this.#emitLockOperation(LockOperationType.Unlock, request.pinCode);
        this.#scheduleAutoRelock(request.timeout);
    }

    override unboltDoor(request: DoorLock.UnboltDoorRequest): MaybePromise {
        this.#validatePinIfRequired(request.pinCode, LockOperationType.Unlatch);
        this.state.lockState = LockState.Unlatched;
        this.#emitLockOperation(LockOperationType.Unlatch, request.pinCode);
        this.#scheduleAutoRelock();
    }

    // ── Non-User PIN/RFID Commands (PIN & !USR, RID & !USR) ─────────────────

    override setPinCode(request: DoorLock.SetPinCodeRequest): MaybePromise {
        this.#setNonUserCode(CredentialType.Pin, request.userId, request.pin, request.userStatus, request.userType);
    }

    override getPinCode(request: DoorLock.GetPinCodeRequest): DoorLock.GetPinCodeResponse {
        return this.#getNonUserPinCode(request.userId);
    }

    override clearPinCode(request: DoorLock.ClearPinCodeRequest): MaybePromise {
        this.#clearNonUserCode(CredentialType.Pin, request.pinSlotIndex);
    }

    override clearAllPinCodes(): MaybePromise {
        this.#clearAllNonUserCodes(CredentialType.Pin);
    }

    override setRfidCode(request: DoorLock.SetRfidCodeRequest): MaybePromise {
        this.#setNonUserCode(
            CredentialType.Rfid,
            request.userId,
            request.rfidCode,
            request.userStatus,
            request.userType,
        );
    }

    override getRfidCode(request: DoorLock.GetRfidCodeRequest): DoorLock.GetRfidCodeResponse {
        return this.#getNonUserRfidCode(request.userId);
    }

    override clearRfidCode(request: DoorLock.ClearRfidCodeRequest): MaybePromise {
        this.#clearNonUserCode(CredentialType.Rfid, request.rfidSlotIndex);
    }

    override clearAllRfidCodes(): MaybePromise {
        this.#clearAllNonUserCodes(CredentialType.Rfid);
    }

    // ── Non-User Status Commands (!USR) ──────────────────────────────────────

    override setUserStatus(request: DoorLock.SetUserStatusRequest): MaybePromise {
        const auth = this.auth;
        const user = auth.findUser(request.userId);
        if (!user) {
            throw new StatusResponseError("User not found", StatusCode.InvalidCommand);
        }
        auth.replaceUser(request.userId, { ...user, userStatus: request.userStatus });
    }

    override getUserStatus(request: DoorLock.GetUserStatusRequest): DoorLock.GetUserStatusResponse {
        const user = this.auth.findUser(request.userId);
        return { userId: request.userId, userStatus: user?.userStatus ?? UserStatus.Available };
    }

    override setUserType(request: DoorLock.SetUserTypeRequest): MaybePromise {
        const auth = this.auth;
        const user = auth.findUser(request.userId);
        if (!user) {
            throw new StatusResponseError("User not found", StatusCode.InvalidCommand);
        }
        auth.replaceUser(request.userId, { ...user, userType: request.userType });
    }

    override getUserType(request: DoorLock.GetUserTypeRequest): DoorLock.GetUserTypeResponse {
        const user = this.auth.findUser(request.userId);
        return { userId: request.userId, userType: user?.userType ?? UserType.UnrestrictedUser };
    }

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

    // ── Private Helpers ────────────────────────────────────────────────────────

    get #fabricIndex(): FabricIndex {
        const fabric = this.context.fabric;
        if (fabric === undefined) {
            throw new StatusResponseError("Fabric required", StatusCode.UnsupportedAccess);
        }
        return fabric;
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

        this.internal.autoRelockTimer = Time.getTimer(
            "auto-relock",
            Seconds(timeout),
            this.callback(this.#autoRelock, { lock: true }),
        ).start();
    }

    #autoRelock() {
        if (this.state.lockState !== LockState.Locked) {
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
    }

    // ── PIN Validation ─────────────────────────────────────────────────────────

    #validatePinIfRequired(pinCode: Bytes | undefined, operationType: LockOperationType) {
        const requirePin = this.state.requirePinForRemoteOperation;

        if (pinCode !== undefined) {
            this.#validatePin(pinCode, operationType);
            return;
        }

        if (requirePin) {
            this.#emitLockOperationError(operationType, OperationError.InvalidCredential);
            throw new StatusResponseError("PIN required for remote operation", StatusCode.Failure);
        }
    }

    #validatePin(pinCode: Bytes, operationType: LockOperationType) {
        // Check if temporarily disabled due to wrong code entries
        if (this.state.wrongCodeEntryLimit !== undefined && this.state.userCodeTemporaryDisableTime !== undefined) {
            if (this.internal.wrongCodeCount >= this.state.wrongCodeEntryLimit) {
                this.#emitLockOperationError(operationType, OperationError.InvalidCredential);
                throw new StatusResponseError("User code temporarily disabled", StatusCode.Failure);
            }
        }

        // Search all PIN credentials for a match
        const auth = this.auth;
        for (const cred of auth.credentials) {
            if (cred.credentialType !== CredentialType.Pin) {
                continue;
            }

            const decrypted = auth.decrypt(cred.credentialData);
            if (Bytes.areEqual(decrypted, pinCode)) {
                const userIndex = auth.findUserIndexForCredential(CredentialType.Pin, cred.credentialIndex);
                if (userIndex !== null) {
                    const user = auth.findUser(userIndex);
                    if (user && user.userStatus === UserStatus.OccupiedDisabled) {
                        this.#emitLockOperationError(operationType, OperationError.DisabledUserDenied);
                        throw new StatusResponseError("User is disabled", StatusCode.Failure);
                    }
                }

                // Reset wrong code count on success
                this.internal.wrongCodeCount = 0;
                return;
            }
        }

        // No match found — wrong code
        const wrongCount = ++this.internal.wrongCodeCount;

        if (this.state.wrongCodeEntryLimit !== undefined && wrongCount >= this.state.wrongCodeEntryLimit) {
            this.events.doorLockAlarm.emit({ alarmCode: AlarmCode.WrongCodeEntryLimit }, this.context);

            if (this.state.userCodeTemporaryDisableTime !== undefined) {
                Time.getTimer(
                    "wrong-code-disable",
                    Seconds(this.state.userCodeTemporaryDisableTime),
                    this.callback(
                        () => {
                            this.internal.wrongCodeCount = 0;
                        },
                        { lock: true },
                    ),
                ).start();
            }
        }

        this.#emitLockOperationError(operationType, OperationError.InvalidCredential);
        throw new StatusResponseError("Invalid PIN code", StatusCode.Failure);
    }

    // ── Event Emission ─────────────────────────────────────────────────────────

    #emitLockOperation(operationType: LockOperationType, pinCode?: Bytes) {
        let userIndex: number | null = null;
        let credentials: DoorLock.Credential[] | null = null;

        if (pinCode !== undefined) {
            const auth = this.auth;
            for (const cred of auth.credentials) {
                if (cred.credentialType !== CredentialType.Pin) continue;
                const decrypted = auth.decrypt(cred.credentialData);
                if (Bytes.areEqual(decrypted, pinCode)) {
                    userIndex = auth.findUserIndexForCredential(CredentialType.Pin, cred.credentialIndex);
                    credentials = [{ credentialType: CredentialType.Pin, credentialIndex: cred.credentialIndex }];
                    break;
                }
            }
        }

        this.events.lockOperation.emit(
            {
                lockOperationType: operationType,
                operationSource: OperationSource.Remote,
                userIndex,
                fabricIndex: this.#fabricIndex,
                sourceNode: this.#sourceNode,
                credentials,
            },
            this.context,
        );
    }

    #emitLockOperationError(operationType: LockOperationType, error: OperationError) {
        this.events.lockOperationError.emit(
            {
                lockOperationType: operationType,
                operationSource: OperationSource.Remote,
                operationError: error,
                userIndex: null,
                fabricIndex: this.#fabricIndex,
                sourceNode: this.#sourceNode,
                credentials: null,
            },
            this.context,
        );
    }

    get #sourceNode(): NodeId | null {
        const context = this.context;
        if ("subject" in context && context.subject?.kind === "node") {
            return context.subject.id;
        }
        return null;
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

    // ── Credential Helpers ─────────────────────────────────────────────────────

    #maxCredentialsForType(type: CredentialType): number {
        switch (type) {
            case CredentialType.Pin:
            case CredentialType.ProgrammingPin:
                return this.state.numberOfPinUsersSupported;
            case CredentialType.Rfid:
                return this.state.numberOfRfidUsersSupported;
            default:
                return 0;
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

    #clearAllCredentialsOfType(type: CredentialType) {
        const auth = this.auth;
        const credsOfType = auth.credentials.filter(c => c.credentialType === type);
        for (const cred of credsOfType) {
            this.#removeCredentialFromUsers(auth, type, cred.credentialIndex);
        }
        auth.removeAllCredentialsOfType(type);
    }

    #removeCredentialFromUsers(auth: LockAuth.Store, type: CredentialType, index: number) {
        const userIndex = auth.findUserIndexForCredential(type, index);
        if (userIndex === null) return;

        const user = auth.findUser(userIndex);
        if (!user) return;

        const remainingCreds = user.credentials.filter(
            c => !(c.credentialType === type && c.credentialIndex === index),
        );

        if (remainingCreds.length === 0) {
            auth.removeUser(userIndex);
            this.state.weekDaySchedules = this.state.weekDaySchedules.filter(s => s.userIndex !== userIndex);
            this.state.yearDaySchedules = this.state.yearDaySchedules.filter(s => s.userIndex !== userIndex);
        } else {
            auth.replaceUser(userIndex, { ...user, credentials: remainingCreds });
        }
    }

    // ── NonUser Code Helpers ────────────────────────────────────────────────────

    #setNonUserCode(
        type: CredentialType,
        userId: number,
        code: Bytes,
        userStatus: UserStatus | null,
        userType: UserType | null,
    ) {
        const max = this.#maxCredentialsForType(type);
        if (userId < 0 || userId > max) {
            throw new StatusResponseError("Invalid user ID", StatusCode.InvalidCommand);
        }

        if (!this.#validateCredentialDataLength(type, code)) {
            throw new StatusResponseError("Invalid code length", StatusCode.InvalidCommand);
        }

        const auth = this.auth;

        if (auth.isDuplicateCredential(type, code, userId)) {
            throw new DoorLock.DuplicateError("Duplicate credential");
        }

        const fabricIndex = this.#fabricIndex;
        const existingCred = auth.findCredential(type, userId);
        const existingUser = auth.findUser(userId);

        if (existingCred) {
            auth.updateCredentialData(type, userId, code, fabricIndex);

            if (existingUser) {
                auth.replaceUser(userId, {
                    ...existingUser,
                    userStatus: userStatus ?? existingUser.userStatus,
                    userType: userType ?? existingUser.userType,
                    lastModifiedFabricIndex: fabricIndex,
                });
            }
        } else {
            auth.addCredential(type, userId, code, fabricIndex);

            if (existingUser) {
                auth.replaceUser(userId, {
                    ...existingUser,
                    credentials: [...existingUser.credentials, { credentialType: type, credentialIndex: userId }],
                    userStatus: userStatus ?? existingUser.userStatus,
                    userType: userType ?? existingUser.userType,
                    lastModifiedFabricIndex: fabricIndex,
                });
            } else {
                auth.addUser({
                    userIndex: userId,
                    userName: "",
                    userUniqueId: 0xffffffff,
                    userStatus: userStatus ?? UserStatus.OccupiedEnabled,
                    userType: userType ?? UserType.UnrestrictedUser,
                    credentialRule: CredentialRule.Single,
                    credentials: [{ credentialType: type, credentialIndex: userId }],
                    creatorFabricIndex: fabricIndex,
                    lastModifiedFabricIndex: fabricIndex,
                });
            }
        }
    }

    #getNonUserPinCode(userId: number): DoorLock.GetPinCodeResponse {
        const auth = this.auth;
        const user = auth.findUser(userId);
        const cred = auth.findCredential(CredentialType.Pin, userId);

        if (!user || !cred) {
            return {
                userId,
                userStatus: UserStatus.Available,
                userType: UserType.UnrestrictedUser,
                pinCode: null,
            };
        }

        return {
            userId,
            userStatus: user.userStatus,
            userType: user.userType,
            pinCode: auth.decrypt(cred.credentialData),
        };
    }

    #getNonUserRfidCode(userId: number): DoorLock.GetRfidCodeResponse {
        const auth = this.auth;
        const user = auth.findUser(userId);
        const cred = auth.findCredential(CredentialType.Rfid, userId);

        if (!user || !cred) {
            return {
                userId,
                userStatus: UserStatus.Available,
                userType: UserType.UnrestrictedUser,
                rfidCode: null,
            };
        }

        return {
            userId,
            userStatus: user.userStatus,
            userType: user.userType,
            rfidCode: auth.decrypt(cred.credentialData),
        };
    }

    #clearNonUserCode(type: CredentialType, slotIndex: number) {
        const max = this.#maxCredentialsForType(type);
        if (slotIndex < 0 || slotIndex > max) {
            throw new StatusResponseError("Invalid slot index", StatusCode.InvalidCommand);
        }

        const auth = this.auth;
        this.#removeCredentialFromUsers(auth, type, slotIndex);
        auth.removeCredential(type, slotIndex);
    }

    #clearAllNonUserCodes(type: CredentialType) {
        this.#clearAllCredentialsOfType(type);
    }
}

// ── Supervision wiring ────────────────────────────────────────────────────────
//
// Commands that throw on bad input — remap validation errors to INVALID_COMMAND
const throwInvalidCommand = () => {
    throw new StatusResponseError("Invalid field value", StatusCode.InvalidCommand);
};

for (const method of ["clearPinCode", "clearRfidCode"]) {
    Supervision(NonUserDoorLockServer, method).onValidationError = throwInvalidCommand;
}

export namespace NonUserDoorLockServer {
    export class State extends NonUserBase.State {
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
        autoRelockTimer?: Timer;
    }
}

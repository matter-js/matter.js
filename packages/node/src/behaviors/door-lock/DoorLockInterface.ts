/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { DoorLock } from "#clusters/door-lock";

export namespace DoorLockInterface {
    export interface Base {
        /**
         * This command causes the lock device to lock the door. This command includes an optional code forthelock. The
         * door lock may require a PIN depending on the value of the RequirePINForRemoteOperation attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.1
         */
        lockDoor(request: DoorLock.LockDoorRequest): MaybePromise;

        /**
         * This command causes the lock device to unlock the door. This command includes an optional code for the lock.
         * The door lock may require a code depending on the value of the RequirePINForRemoteOperation attribute.
         *
         * > [!NOTE]
         *
         * > If the attribute AutoRelockTime is supported the lock will transition to the locked state when the auto
         *   relock time has expired.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.2
         */
        unlockDoor(request: DoorLock.UnlockDoorRequest): MaybePromise;

        /**
         * This command causes the lock device to unlock the door with a timeout parameter. After the time in seconds
         * specified in the timeout field, the lock device will relock itself automatically. This timeout parameter is
         * only temporary for this message transition and overrides the default relock time as specified in the
         * AutoRelockTime attribute. If the door lock device is not capable of or does not want to support temporary
         * Relock Timeout, it SHOULD NOT support this optional command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.3
         */
        unlockWithTimeout(request: DoorLock.UnlockWithTimeoutRequest): MaybePromise;
    }

    export interface User {
        /**
         * Set user into the lock.
         *
         * Fields used for different use cases:
         *
         *   - OperationType shall be set to Add.
         *
         *   - UserIndex value shall be set to a user record with UserType set to Available.
         *
         *   - UserName may be null causing new user record to use empty string for UserName otherwise UserName shall be
         *     set to the value provided in the new user record.
         *
         *   - UserUniqueID may be null causing new user record to use 0xFFFFFFFF for UserUniqueID otherwise
         *     UserUniqueID shall be set to the value provided in the new user record.
         *
         *   - UserStatus may be null causing new user record to use OccupiedEnabled for UserStatus otherwise UserStatus
         *     shall be set to the value provided in the new user record.
         *
         *   - UserType may be null causing new user record to use UnrestrictedUser for UserType otherwise UserType
         *     shall be set to the value provided in the new user record.
         *
         *   - CredentialRule may be null causing new user record to use Single for CredentialRule otherwise
         *     CredentialRule shall be set to the value provided in the new user record.
         *
         * CreatorFabricIndex and LastModifiedFabricIndex in the new user record shall be set to the accessing fabric
         * index.
         *
         * A LockUserChange event shall be generated after successfully creating a new user.
         *
         *   - OperationType shall be set to Modify.
         *
         *   - UserIndex value shall be set for a user record with UserType NOT set to Available.
         *
         *   - UserName shall be null if modifying a user record that was not created by the accessing fabric.
         *
         *   - INVALID_COMMAND shall be returned if UserName is not null and the accessing fabric index doesn’t match
         *     the CreatorFabricIndex in the user record otherwise UserName shall be set to the value provided in the
         *     user record.
         *
         *   - UserUniqueID shall be null if modifying the user record that was not created by the accessing fabric.
         *
         *   - INVALID_COMMAND shall be returned if UserUniqueID is not null and the accessing fabric index doesn’t
         *     match the CreatorFabricIndex in the user record otherwise UserUniqueID shall be set to the value provided
         *     in the user record.
         *
         *   - UserStatus may be null causing no change to UserStatus in user record otherwise UserStatus shall be set
         *     to the value provided in the user record.
         *
         *   - UserType may be null causing no change to UserType in user record otherwise UserType shall be set to the
         *     value provided in the user record.
         *
         *   - CredentialRule may be null causing no change to CredentialRule in user record otherwise CredentialRule
         *     shall be set to the value provided in the user record.
         *
         * CreatorFabricIndex shall NOT be changed in the user record. LastModifiedFabricIndex in the new user record
         * shall be set to the accessing fabric index.
         *
         * A LockUserChange event shall be generated after successfully modifying a user.
         *
         * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall
         * be one of the following values:
         *
         *   - SUCCESS, if setting User was successful.
         *
         *   - FAILURE, if some unexpected internal error occurred setting User.
         *
         *   - OCCUPIED, if OperationType is Add and UserIndex points to an occupied slot.
         *
         *   - INVALID_COMMAND, if one or more fields violate constraints or are invalid or if OperationType is Modify
         *     and UserIndex points to an available slot.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32
         */
        setUser(request: DoorLock.SetUserRequest): MaybePromise;

        /**
         * Retrieve user.
         *
         * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.) as
         * needed otherwise the GetUserResponse Command shall be sent implying a status of SUCCESS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.33
         */
        getUser(request: DoorLock.GetUserRequest): MaybePromise<DoorLock.GetUserResponse>;

        /**
         * Clears a user or all Users.
         *
         * For each user to clear, all associated credentials (e.g. PIN, RFID, fingerprint, etc.) shall be cleared and
         * the user entry values shall be reset to their default values (e.g. UserStatus shall be Available, UserType
         * shall be UnrestrictedUser) and all associated schedules shall be cleared.
         *
         * A LockUserChange event with the provided UserIndex shall be generated after successfully clearing users.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.35
         */
        clearUser(request: DoorLock.ClearUserRequest): MaybePromise;

        /**
         * Set a credential (e.g. PIN, RFID, Fingerprint, etc.) into the lock for a new user, existing user, or
         * ProgrammingUser.
         *
         * Fields used for different use cases:
         *
         *   - OperationType shall be set to Add.
         *
         *   - UserIndex shall be set to null and the lock will find a user record with a UserStatus value of Available
         *     and associate its UserIndex with the CredentialIndex in CredentialStruct provided.
         *
         *   - CredentialIndex in CredentialStruct shall be for an unoccupied credential slot.
         *
         *   - UserStatus may be null. If it is null, the new user record shall have UserStatus set to OccupiedEnabled.
         *     Otherwise the new user record shall have UserStatus set to the provided value.
         *
         *   - UserType may be null. If it is null, the new user record shall have UserType set to UnrestrictedUser.
         *     Otherwise the new user record shall have UserType set to the provided value.
         *
         *   - UserType shall NOT be set to ProgrammingUser for this use case.
         *
         * CreatorFabricIndex and LastModifiedFabricIndex in new user and credential records shall be set to the
         * accessing fabric index.
         *
         * A LockUserChange event shall be generated after successfully creating a new credential and anewuser. The
         * UserIndex of this LockUserChange event shall be the UserIndex that was used to createtheuser. The DataIndex
         * of this LockUserChange event shall be the CredentialIndex that was used to create the credential.
         *
         *   - OperationType shall be set to Add.
         *
         *   - UserIndex shall NOT be null and shall NOT already be associated with the CredentialIndex in
         *     CredentialStruct provided otherwise INVALID_COMMAND status response shall be returned.
         *
         *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in
         *     the user record pointed to by UserIndex.
         *
         *   - CredentialIndex in CredentialStruct provided shall be for an available credential slot.
         *
         *   - UserStatus shall be null.
         *
         *   - UserType shall be null.
         *
         * CreatorFabricIndex shall NOT be changed in the user record. LastModifiedFabricIndex in the user record shall
         * be set to the accessing fabric index.
         *
         * CreatorFabricIndex and LastModifiedFabricIndex in the new credential record shall be set to the accessing
         * fabric index.
         *
         * A LockUserChange event shall be generated after successfully adding a new credential.
         *
         *   - OperationType shall be set to Modify.
         *
         *   - UserIndex value shall already be associated with the CredentialIndex in CredentialStruct provided
         *     otherwise INVALID_COMMAND status response shall be returned.
         *
         *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in
         *     the user record pointed to by UserIndex.
         *
         *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in
         *     the credential record pointed to by the CredentialIndex field value of the Credential parameter.
         *
         *   - CredentialIndex in CredentialStruct provided shall be for an occupied credential slot
         *
         *   - UserStatus shall be null.
         *
         *   - UserType shall be null.
         *
         * CreatorFabricIndex shall NOT be changed in user and credential records. LastModifiedFabricIndex in user and
         * credential records shall be set to the accessing fabric index.
         *
         * A LockUserChange event shall be generated after successfully modifying a credential.
         *
         *   - OperationType shall be set to Modify.
         *
         *   - UserIndex shall be null.
         *
         *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in
         *     the credential record pointed to by the CredentialIndex field value of the Credential parameter.
         *
         *   - CredentialType in CredentialStruct shall be set to ProgrammingPIN.
         *
         *   - CredentialIndex in CredentialStruct shall be 0.
         *
         *   - UserStatus shall be null.
         *
         *   - UserType shall be set to ProgrammingUser.
         *
         * CreatorFabricIndex shall NOT be changed in the credential record. LastModifiedFabricIndex in the credential
         * record shall be set to the accessing fabric index.
         *
         * A LockUserChange event shall be generated after successfully modifying a ProgrammingUser PIN code.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36
         */
        setCredential(request: DoorLock.SetCredentialRequest): MaybePromise<DoorLock.SetCredentialResponse>;

        /**
         * Retrieve the status of a particular credential (e.g. PIN, RFID, Fingerprint, etc.) by index.
         *
         * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.) as
         * needed otherwise the GetCredentialStatusResponse command shall be sent implying a status of SUCCESS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.38
         */
        getCredentialStatus(request: DoorLock.GetCredentialStatusRequest): MaybePromise<DoorLock.GetCredentialStatusResponse>;

        /**
         * Clear one, one type, or all credentials except ProgrammingPIN credential.
         *
         * Fields used for different use cases:
         *
         *   - CredentialType in Credential structure shall be set to the credential type to be cleared.
         *
         *   - CredentialType in Credential structure shall NOT be set to ProgrammingPIN.
         *
         *   - CredentialIndex in Credential structure shall be set to the credential index to be cleared.
         *
         * A LockUserChange event shall be generated after successfully clearing a credential.
         *
         *   - CredentialType in Credential structure shall be set to the credential type to be cleared.
         *
         *   - CredentialType in Credential structure shall NOT be set to ProgrammingPIN.
         *
         *   - CredentialIndex in Credential structure shall be set to 0xFFFE to indicate all credentials of that type
         *     shall be cleared.
         *
         * A single LockUserChange event shall be generated after successfully clearing credentials. This event shall
         * have DataIndex set to the CredentialIndex in the Credential structure.
         *
         *   - Credential field shall be null.
         *
         * The ProgrammingPIN credential shall NOT be cleared.
         *
         * For each credential type cleared, a LockUserChange event with the corresponding LockDataType shall be
         * generated. This event shall have DataIndex set to 0xFFFE.
         *
         * For each credential cleared whose user doesn’t have another valid credential, the corresponding user record
         * shall be reset back to default values and its UserStatus value shall be set to Available and UserType value
         * shall be set to UnrestrictedUser and all schedules shall be cleared. In this case a LockUserChange event
         * shall be generated for the user being cleared.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.40
         */
        clearCredential(request: DoorLock.ClearCredentialRequest): MaybePromise;
    }

    export interface WeekDayAccessSchedules {
        /**
         * Set a weekly repeating schedule for a specified user.
         *
         * The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Week Day schedule is set.
         *
         * Return status shall be one of the following values:
         *
         * One or more fields violates constraints or is invalid.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12
         */
        setWeekDaySchedule(request: DoorLock.SetWeekDayScheduleRequest): MaybePromise;

        /**
         * Retrieve the specific weekly schedule for the specific user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.13
         */
        getWeekDaySchedule(request: DoorLock.GetWeekDayScheduleRequest): MaybePromise<DoorLock.GetWeekDayScheduleResponse>;

        /**
         * Clear the specific weekly schedule or all weekly schedules for the specific user.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.15
         */
        clearWeekDaySchedule(request: DoorLock.ClearWeekDayScheduleRequest): MaybePromise;
    }

    export interface YearDayAccessSchedules {
        /**
         * Set a time-specific schedule ID for a specified user.
         *
         * The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Year Day schedule is set.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16
         */
        setYearDaySchedule(request: DoorLock.SetYearDayScheduleRequest): MaybePromise;

        /**
         * Retrieve the specific year day schedule for the specific schedule and user indexes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.17
         */
        getYearDaySchedule(request: DoorLock.GetYearDayScheduleRequest): MaybePromise<DoorLock.GetYearDayScheduleResponse>;

        /**
         * Clears the specific year day schedule or all year day schedules for the specific user.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.19
         */
        clearYearDaySchedule(request: DoorLock.ClearYearDayScheduleRequest): MaybePromise;
    }

    export interface HolidaySchedules {
        /**
         * Set the holiday Schedule by specifying local start time and local end time with respect to any Lock Operating
         * Mode.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20
         */
        setHolidaySchedule(request: DoorLock.SetHolidayScheduleRequest): MaybePromise;

        /**
         * Get the holiday schedule for the specified index.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.21
         */
        getHolidaySchedule(request: DoorLock.GetHolidayScheduleRequest): MaybePromise<DoorLock.GetHolidayScheduleResponse>;

        /**
         * Clears the holiday schedule or all holiday schedules.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.23
         */
        clearHolidaySchedule(request: DoorLock.ClearHolidayScheduleRequest): MaybePromise;
    }

    export interface PinCredentialNotUser {
        /**
         * Set a PIN Code into the lock.
         *
         * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall
         * be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.4
         */
        setPinCode(request: DoorLock.SetPinCodeRequest): MaybePromise;

        /**
         * Retrieve a PIN Code.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.5
         */
        getPinCode(request: DoorLock.GetPinCodeRequest): MaybePromise<DoorLock.GetPinCodeResponse>;

        /**
         * Clear a PIN code or all PIN codes.
         *
         * For each PIN Code cleared whose user doesn’t have a RFID Code or other credential type, then corresponding
         * user record’s UserStatus value shall be set to Available, and UserType value shall be set to UnrestrictedUser
         * and all schedules shall be cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.7
         */
        clearPinCode(request: DoorLock.ClearPinCodeRequest): MaybePromise;

        /**
         * Clear out all PINs on the lock.
         *
         * > [!NOTE]
         *
         * > On the server, the clear all PIN codes command SHOULD have the same effect as the ClearPINCode command with
         *   respect to the setting of user status, user type and schedules.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.8
         */
        clearAllPinCodes(): MaybePromise;
    }

    export interface AliroProvisioning {
        /**
         * This command allows communicating an Aliro Reader configuration, as defined in [Aliro], to the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42
         */
        setAliroReaderConfig(request: DoorLock.SetAliroReaderConfigRequest): MaybePromise;

        /**
         * This command allows clearing an existing Aliro Reader configuration for the lock.
         *
         * Administrators shall NOT clear an Aliro Reader configuration without explicit user permission.
         *
         * > [!NOTE]
         *
         * > Using this command will revoke the ability of all existing Aliro user devices that have the old
         *   verification key to interact with the lock. This effect is not restricted to a single fabric or otherwise
         *   scoped in any way.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.43
         */
        clearAliroReaderConfig(): MaybePromise;
    }

    export interface PinCredentialAndRfidCredentialAndFingerCredentialsNotUser {
        /**
         * Set the status of a user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.9
         */
        setUserStatus(request: DoorLock.SetUserStatusRequest): MaybePromise;

        /**
         * Get the status of a user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.10
         */
        getUserStatus(request: DoorLock.GetUserStatusRequest): MaybePromise<DoorLock.GetUserStatusResponse>;

        /**
         * Set the user type for a specified user.
         *
         * For user type value please refer to User Type Value.
         *
         * Return status shall be one of the following values:
         *
         * One or more fields violates constraints or is invalid. Door lock is unable to switch from restricted to
         * unrestricted user (e.g. need to clear schedules to switch).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.24
         */
        setUserType(request: DoorLock.SetUserTypeRequest): MaybePromise;

        /**
         * Retrieve the user type for a specific user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.25
         */
        getUserType(request: DoorLock.GetUserTypeRequest): MaybePromise<DoorLock.GetUserTypeResponse>;
    }

    export interface RfidCredentialNotUser {
        /**
         * Set an ID for RFID access into the lock.
         *
         * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall
         * be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.27
         */
        setRfidCode(request: DoorLock.SetRfidCodeRequest): MaybePromise;

        /**
         * Retrieve an RFID code.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.28
         */
        getRfidCode(request: DoorLock.GetRfidCodeRequest): MaybePromise<DoorLock.GetRfidCodeResponse>;

        /**
         * Clear an RFID code or all RFID codes.
         *
         * For each RFID Code cleared whose user doesn’t have a PIN Code or other credential type, then the
         * corresponding user record’s UserStatus value shall be set to Available, and UserType value shall be set to
         * UnrestrictedUser and all schedules shall be cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.30
         */
        clearRfidCode(request: DoorLock.ClearRfidCodeRequest): MaybePromise;

        /**
         * Clear out all RFIDs on the lock. If you clear all RFID codes and this user didn’t have a PIN code, the user
         * status has to be set to "0 Available", the user type has to be set to the default value, and all schedules
         * which are supported have to be set to the default values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.31
         */
        clearAllRfidCodes(): MaybePromise;
    }

    export interface Unbolting {
        /**
         * This command causes the lock device to unlock the door without pulling the latch. This command includes an
         * optional code for the lock. The door lock may require a code depending on the value of the
         * RequirePINForRemoteOperation attribute.
         *
         * > [!NOTE]
         *
         * > If the attribute AutoRelockTime is supported, the lock will transition to the locked state when the auto
         *   relock time has expired.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.41
         */
        unboltDoor(request: DoorLock.UnboltDoorRequest): MaybePromise;
    }
}

export type DoorLockInterface = {
    components: [
        { flags: {}, methods: DoorLockInterface.Base },
        { flags: { user: true }, methods: DoorLockInterface.User },
        { flags: { weekDayAccessSchedules: true }, methods: DoorLockInterface.WeekDayAccessSchedules },
        { flags: { yearDayAccessSchedules: true }, methods: DoorLockInterface.YearDayAccessSchedules },
        { flags: { holidaySchedules: true }, methods: DoorLockInterface.HolidaySchedules },
        { flags: { pinCredential: true, user: false }, methods: DoorLockInterface.PinCredentialNotUser },
        { flags: { aliroProvisioning: true }, methods: DoorLockInterface.AliroProvisioning },
        {
            flags: { pinCredential: true, rfidCredential: true, fingerCredentials: true, user: false },
            methods: DoorLockInterface.PinCredentialAndRfidCredentialAndFingerCredentialsNotUser
        },
        { flags: { rfidCredential: true, user: false }, methods: DoorLockInterface.RfidCredentialNotUser },
        { flags: { unbolting: true }, methods: DoorLockInterface.Unbolting }
    ]
};

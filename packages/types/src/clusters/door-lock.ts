/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    OptionalWritableAttribute,
    Event,
    FixedAttribute,
    Command,
    TlvNoResponse,
    WritableAttribute,
    OptionalCommand,
    OptionalAttribute
} from "../cluster/Cluster.js";
import { TlvEnum, TlvUInt32, TlvUInt16, TlvUInt8, TlvBitmap, TlvEpochS } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "#model";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag, BitField } from "../schema/BitmapSchema.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { Status } from "../globals/Status.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvNodeId } from "../datatype/NodeId.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { ClusterType } from "../cluster/ClusterType.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace DoorLock {
    /**
     * These are optional features supported by DoorLockCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.4
     */
    export enum Feature {
        /**
         * PinCredential (PIN)
         *
         * If the User Feature is also supported then any PIN Code stored in the lock shall be associated with a User.
         *
         * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus and
         * Schedules are all associated with a User index and not directly with a PIN index. A User index may have
         * several credentials associated with it.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.1
         */
        PinCredential = "PinCredential",

        /**
         * RfidCredential (RID)
         *
         * If the User Feature is also supported then any RFID credential stored in the lock shall be associated with a
         * User.
         *
         * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus and
         * Schedules are all associated with a User index and not directly with a RFID index. A User Index may have
         * several credentials associated with it.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.2
         */
        RfidCredential = "RfidCredential",

        /**
         * FingerCredentials (FGP)
         *
         * Currently the cluster only defines the metadata format for notifications when a fingerprint/ finger vein
         * credential is used to access the lock and doesn’t describe how to create fingerprint/finger vein credentials.
         * If the Users feature is also supported then the User that a fingerprint/finger vein is associated with can
         * also have its UserType, UserStatus and Schedule modified.
         *
         * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus and
         * Schedules are all associated with a User index and not directly with a Finger index. A User Index may have
         * several credentials associated with it.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.3
         */
        FingerCredentials = "FingerCredentials",

        /**
         * WeekDayAccessSchedules (WDSCH)
         *
         * If the User feature is supported then Week Day Schedules are applied to a User and not a credential.
         *
         * Week Day Schedules are used to restrict access to a specified time window on certain days of the week. The
         * schedule is repeated each week.
         *
         * The lock may automatically adjust the UserType when a schedule is created or cleared.
         *
         * Support for WeekDayAccessSchedules requires that the lock has the capability of keeping track of local time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.4
         */
        WeekDayAccessSchedules = "WeekDayAccessSchedules",

        /**
         * DoorPositionSensor (DPS)
         *
         * If this feature is supported this indicates that the lock has the ability to determine the position of the
         * door which is separate from the state of the lock.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.5
         */
        DoorPositionSensor = "DoorPositionSensor",

        /**
         * FaceCredentials (FACE)
         *
         * Currently the cluster only defines the metadata format for notifications when a face recognition, iris, or
         * retina credential is used to access the lock and doesn’t describe how to create face recognition, iris, or
         * retina credentials. If the Users feature is also supported then the User that a face recognition, iris, or
         * retina credential is associated with can also have its UserType, UserStatus and Schedule modified.
         *
         * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus and
         * Schedules are all associated with a User and not directly with a credential.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.6
         */
        FaceCredentials = "FaceCredentials",

        /**
         * CredentialOverTheAirAccess (COTA)
         *
         * If this feature is supported then the lock supports the ability to verify a credential provided in a
         * lock/unlock command. Currently the cluster only supports providing the PIN credential to the lock/unlock
         * commands. If this feature is supported then the PIN Credential feature shall also be supported.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.7
         */
        CredentialOverTheAirAccess = "CredentialOverTheAirAccess",

        /**
         * User (USR)
         *
         * If the User Feature is supported then a lock employs a User database. A User within the User database is used
         * to associate credentials and schedules to single user record within the lock. This also means the UserType
         * and UserStatus fields are associated with a User and not a credential.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.8
         */
        User = "User",

        /**
         * YearDayAccessSchedules (YDSCH)
         *
         * If the User feature is supported then Year Day Schedules are applied to a User and not a credential. Year Day
         * Schedules are used to restrict access to a specified date and time window.
         *
         * The lock may automatically adjust the UserType when a schedule is created or cleared.
         *
         * Support for YearDayAccessSchedules requires that the lock has the capability of keeping track of local time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.9
         */
        YearDayAccessSchedules = "YearDayAccessSchedules",

        /**
         * HolidaySchedules (HDSCH)
         *
         * This feature is used to setup Holiday Schedule in the lock device. A Holiday Schedule sets a start and stop
         * end date/time for the lock to use the specified operating mode set by the Holiday Schedule.
         *
         * Support for HolidaySchedules requires that the lock has the capability of keeping track of local time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.10
         */
        HolidaySchedules = "HolidaySchedules",

        /**
         * Unbolting (UBOLT)
         *
         * Locks that support this feature differentiate between unbolting and unlocking. The Unbolt Door command
         * retracts the bolt without pulling the latch. The Unlock Door command fully unlocks the door by retracting the
         * bolt and briefly pulling the latch. While the latch is pulled, the lock state changes to Unlatched. Locks
         * without unbolting support don’t differentiate between unbolting and unlocking and perform the same operation
         * for both commands.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.11
         */
        Unbolting = "Unbolting",

        /**
         * AliroProvisioning (ALIRO)
         *
         * Locks that support this feature implement the Aliro specification as defined in [Aliro] and support Matter as
         * a method for provisioning Aliro credentials.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.12
         */
        AliroProvisioning = "AliroProvisioning",

        /**
         * AliroBleuwb (ALBU)
         *
         * Locks that support this feature implement the Bluetooth LE + UWB Access Control Flow as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.13
         */
        AliroBleuwb = "AliroBleuwb"
    }

    /**
     * This enumeration shall indicate the current door state.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.11
     */
    export enum DoorState {
        /**
         * Door state is open
         */
        DoorOpen = 0,

        /**
         * Door state is closed
         */
        DoorClosed = 1,

        /**
         * Door state is jammed
         */
        DoorJammed = 2,

        /**
         * Door state is currently forced open
         */
        DoorForcedOpen = 3,

        /**
         * Door state is invalid for unspecified reason
         */
        DoorUnspecifiedError = 4,

        /**
         * Door state is ajar
         */
        DoorAjar = 5
    }

    /**
     * Body of the DoorLock doorStateChange event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.2
     */
    export const TlvDoorStateChangeEvent = TlvObject({
        /**
         * This field shall indicate the new door state for this door event.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.2.1
         */
        doorState: TlvField(0, TlvEnum<DoorState>())
    });

    /**
     * Body of the DoorLock doorStateChange event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.2
     */
    export interface DoorStateChangeEvent extends TypeFromSchema<typeof TlvDoorStateChangeEvent> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.2
     */
    export const CredentialRules = {
        /**
         * Only one credential is required for lock operation
         */
        single: BitFlag(0),

        /**
         * Any two credentials are required for lock operation
         */
        dual: BitFlag(1),

        /**
         * Any three credentials are required for lock operation
         */
        tri: BitFlag(2)
    };

    /**
     * This enumeration shall indicate the data operation performed.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.10
     */
    export enum DataOperationType {
        /**
         * Data is being added or was added
         */
        Add = 0,

        /**
         * Data is being cleared or was cleared
         */
        Clear = 1,

        /**
         * Data is being modified or was modified
         */
        Modify = 2
    }

    /**
     * This enumeration shall indicate what the status is for a specific user ID.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.17
     */
    export enum UserStatus {
        /**
         * The user ID is available
         */
        Available = 0,

        /**
         * The user ID is occupied and enabled
         */
        OccupiedEnabled = 1,

        /**
         * The user ID is occupied and disabled
         */
        OccupiedDisabled = 3
    }

    /**
     * This enumeration shall indicate what the type is for a specific user ID.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18
     */
    export enum UserType {
        /**
         * The user ID type is unrestricted
         *
         * This value shall indicate the user has access 24/7 provided proper PIN or RFID is supplied (e.g., owner).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.1
         */
        UnrestrictedUser = 0,

        /**
         * The user ID type is schedule
         *
         * This value shall indicate the user has the ability to open lock within a specific time period (e.g., guest).
         *
         * When UserType is set to YearDayScheduleUser, user access shall be restricted as follows:
         *
         *   • If no YearDaySchedules are set for the user, then access shall be denied
         *
         *   • If one or more YearDaySchedules are set, user access shall be granted if and only if the current time
         *     falls within at least one of the YearDaySchedules. If current time is not known, user access shall NOT be
         *     granted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.2
         */
        YearDayScheduleUser = 1,

        /**
         * The user ID type is schedule
         *
         * This value shall indicate the user has the ability to open lock based on specific time period within a
         * reoccurring weekly schedule (e.g., cleaning worker).
         *
         * When UserType is set to WeekDayScheduleUser, user access shall be restricted as follows:
         *
         *   • If no WeekDaySchedules are set for the user, then access shall be denied
         *
         *   • If one or more WeekDaySchedules are set, user access shall be granted if and only if the current time
         *     falls within at least one of the WeekDaySchedules. If current time is not known, user access shall NOT be
         *     granted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.3
         */
        WeekDayScheduleUser = 2,

        /**
         * The user ID type is programming
         *
         * This value shall indicate the user has the ability to both program and operate the door lock. This user can
         * manage the users and user schedules. In all other respects this user matches the unrestricted (default) user.
         * ProgrammingUser is the only user that can disable the user interface (keypad, remote, etc…).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.4
         */
        ProgrammingUser = 3,

        /**
         * The user ID type is non access
         *
         * This value shall indicate the user is recognized by the lock but does not have the ability to open the lock.
         * This user will only cause the lock to generate the appropriate event notification to any bound devices.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.5
         */
        NonAccessUser = 4,

        /**
         * The user ID type is forced
         *
         * This value shall indicate the user has the ability to open lock but a ForcedUser LockOperationType and
         * ForcedUser silent alarm will be emitted to allow a notified Node to alert emergency services or contacts on
         * the user account when used.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.6
         */
        ForcedUser = 5,

        /**
         * The user ID type is disposable
         *
         * This value shall indicate the user has the ability to open lock once after which the lock shall change the
         * corresponding user record UserStatus value to OccupiedDisabled automatically.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.7
         */
        DisposableUser = 6,

        /**
         * The user ID type is expiring
         *
         * This value shall indicate the user has the ability to open lock for ExpiringUserTimeout attribute minutes
         * after the first use of the PIN code, RFID code, Fingerprint, or other credential. After ExpiringUserTimeout
         * minutes the corresponding user record UserStatus value shall be set to OccupiedDisabled automatically by the
         * lock. The lock shall persist the timeout across reboots such that the ExpiringUserTimeout is honored.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.8
         */
        ExpiringUser = 7,

        /**
         * The user ID type is schedule restricted
         *
         * This value shall indicate the user access is restricted by Week Day and/or Year Day schedule. When UserType
         * is set to ScheduleRestrictedUser, user access shall be restricted as follows:
         *
         *   • If no WeekDaySchedules and no YearDaySchedules are set for the user, then access shall be denied
         *
         *   • If one or more WeekDaySchedules are set, but no YearDaySchedules are set for the user, then user access
         *     shall be equivalent to the WeekDayScheduleUser UserType
         *
         *   • If one or more YearDaySchedules are set, but no WeekDaySchedules are set for the user, then user access
         *     shall be equivalent to the YearDayScheduleUser UserType
         *
         *   • If one or WeekDaySchedules are set AND one or more YearDaySchedules are set, then user access shall be
         *     granted if and only if the current time falls within at least one of the WeekDaySchedules AND the current
         *     time falls within at least one of the YearDaySchedules.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.9
         */
        ScheduleRestrictedUser = 8,

        /**
         * The user ID type is remote only
         *
         * This value shall indicate the user access and PIN code is restricted to remote lock/unlock commands only.
         * This type of user might be useful for regular delivery services or voice assistant unlocking operations to
         * prevent a PIN code credential created for them from being used at the keypad. The PIN code credential would
         * only be provided over-the-air for the lock/unlock commands.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.18.10
         */
        RemoteOnlyUser = 9
    }

    /**
     * This enumeration shall indicate the credential rule that can be applied to a particular user.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.8
     */
    export enum CredentialRule {
        /**
         * Only one credential is required for lock operation
         */
        Single = 0,

        /**
         * Any two credentials are required for lock operation
         */
        Dual = 1,

        /**
         * Any three credentials are required for lock operation
         */
        Tri = 2
    }

    /**
     * Input to the DoorLock setUser command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32
     */
    export const TlvSetUserRequest = TlvObject({
        /**
         * This field shall indicate the type of operation.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.1
         */
        operationType: TlvField(0, TlvEnum<DataOperationType>()),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall contain a string to use as a human readable identifier for the user. If UserName is null
         * then:
         *
         *   • If the OperationType is Add, the UserName in the resulting user record shall be set to an empty string.
         *
         *   • If the OperationType is Modify, the UserName in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserName is not null, the UserName in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.3
         */
        userName: TlvField(2, TlvNullable(TlvString.bound({ maxLength: 10 }))),

        /**
         * This field shall indicate the fabric assigned number to use for connecting this user to other users on other
         * devices from the fabric’s perspective.
         *
         * If UserUniqueID is null then:
         *
         *   • If the OperationType is Add, the UserUniqueID in the resulting user record shall be set to default value
         *     specified above.
         *
         *   • If the OperationType is Modify, the UserUniqueID in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserUniqueID is not null, the UserUniqueID in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.4
         */
        userUniqueId: TlvField(3, TlvNullable(TlvUInt32)),

        /**
         * This field shall indicate the UserStatus to assign to this user when created or modified. If UserStatus is
         * null then:
         *
         *   • If the OperationType is Add, the UserStatus in the resulting user record shall be set to default value
         *     specified above.
         *
         *   • If the OperationType is Modify, the UserStatus in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserStatus is not null, the UserStatus in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.5
         */
        userStatus: TlvField(4, TlvNullable(TlvEnum<UserStatus>())),

        /**
         * This field shall indicate the UserType to assign to this user when created or modified. If UserType is null
         * then:
         *
         *   • If the OperationType is Add, the UserType in the resulting user record shall be set to default value
         *     specified above.
         *
         *   • If the OperationType is Modify, the UserType in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserType is not null, the UserType in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.6
         */
        userType: TlvField(5, TlvNullable(TlvEnum<UserType>())),

        /**
         * This field shall indicate the CredentialRule to use for this user.
         *
         * The valid CredentialRule enumeration values depends on the bits in the CredentialRulesBitmap map. Each bit in
         * the map identifies a valid CredentialRule that can be used.
         *
         * If CredentialRule is null then:
         *
         *   • If the OperationType is Add, the CredentialRule in the resulting user record shall be set to default
         *     value specified above.
         *
         *   • If the OperationType is Modify, the CredentialRule in the user record shall NOT be changed from the
         *     current value.
         *
         * If CredentialRule is not null, the CredentialRule in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32.7
         */
        credentialRule: TlvField(6, TlvNullable(TlvEnum<CredentialRule>()))
    });

    /**
     * Input to the DoorLock setUser command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32
     */
    export interface SetUserRequest extends TypeFromSchema<typeof TlvSetUserRequest> {}

    /**
     * Input to the DoorLock getUser command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.33
     */
    export const TlvGetUserRequest = TlvObject({ userIndex: TlvField(0, TlvUInt16.bound({ min: 1 })) });

    /**
     * Input to the DoorLock getUser command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.33
     */
    export interface GetUserRequest extends TypeFromSchema<typeof TlvGetUserRequest> {}

    /**
     * This enumeration shall indicate the credential type.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.9
     */
    export enum CredentialType {
        /**
         * Programming PIN code credential type
         */
        ProgrammingPin = 0,

        /**
         * PIN code credential type
         */
        Pin = 1,

        /**
         * RFID identifier credential type
         */
        Rfid = 2,

        /**
         * Fingerprint identifier credential type
         */
        Fingerprint = 3,

        /**
         * Finger vein identifier credential type
         */
        FingerVein = 4,

        /**
         * Face identifier credential type
         */
        Face = 5,

        /**
         * A Credential Issuer public key as defined in [Aliro]
         *
         * Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in section 2.3.3
         * of SEC 1.
         *
         * Credentials of this type shall NOT be used to allow operating the lock. They shall be used, as defined in
         * [Aliro], to create new credentials of type AliroEvictableEndpointKey via a step-up transaction.
         *
         * When performing the step-up transaction, the lock shall request the data element with identifier "matter1",
         * and shall attempt to create a new credential of type AliroEvictableEndpointKey if and only if the data
         * element is returned and the Access Credential can be validated using the AliroCredentialIssuerKey.
         *
         * When a new credential of type AliroEvictableEndpointKey is added in this manner, it shall be associated with
         * the same user record as the AliroCredentialIssuerKey credential that allowed the new credential to be added.
         *
         * If there are no available credential slots to add a new AliroEvictableEndpointKey credential (i.e. either the
         * NumberOfCredentialsSupportedPerUser or the NumberOfAliroEndpointKeysSupported limit has been reached) but
         * there exist credentials of type AliroEvictableEndpointKey associated with the user record, the server shall
         * remove one of those credentials using the same procedure it would follow for the ClearCredential command
         * before adding the new credential.
         *
         * If there are no available credential slots to add a new AliroEvictableEndpointKey credential (i.e. either the
         * NumberOfCredentialsSupportedPerUser or the NumberOfAliroEndpointKeysSupported limit has been reached) and
         * there do not exist credentials of type AliroEvictableEndpointKey associated with the user record, a new
         * AliroEvictableEndpointKey credential shall NOT be created.
         *
         * If the step-up process results in addition of new credentials, the corresponding LockUserChange event shall
         * have OperationSource set to Aliro.
         *
         * If the step-up process results in the lock state changing (e.g. locking or unlocking), the credential
         * associated with those changes in the LockOperation events shall be the newly provisioned
         * AliroEvictableEndpointKey credential if one was created. If no new AliroEvictableEndpointKey credential was
         * created, the credential associated with the changes in the LockOperation events shall be the
         * AliroCredentialIssuerKey credential used for the step-up.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.9.1
         */
        AliroCredentialIssuerKey = 6,

        /**
         * An Endpoint public key as defined in [Aliro] which can be evicted if space is needed for another endpoint key
         *
         * Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in section 2.3.3
         * of SEC 1.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.9.2
         */
        AliroEvictableEndpointKey = 7,

        /**
         * An Endpoint public key as defined in [Aliro] which cannot be evicted if space is needed for another endpoint
         * key
         *
         * Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in section 2.3.3
         * of SEC 1.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.9.3
         */
        AliroNonEvictableEndpointKey = 8
    }

    /**
     * This struct shall indicate the credential types and their corresponding indices (if any) for the event or user
     * record.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.24
     */
    export const TlvCredential = TlvObject({
        /**
         * This field shall indicate the credential field used to authorize the lock operation.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.24.1
         */
        credentialType: TlvField(0, TlvEnum<CredentialType>()),

        /**
         * This field shall indicate the index of the specific credential used to authorize the lock operation in the
         * list of credentials identified by CredentialType (e.g. PIN, RFID, etc.). This field shall be set to 0 if
         * CredentialType is ProgrammingPIN or does not correspond to a list that can be indexed into.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.24.2
         */
        credentialIndex: TlvField(1, TlvUInt16)
    });

    /**
     * This struct shall indicate the credential types and their corresponding indices (if any) for the event or user
     * record.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.24
     */
    export interface Credential extends TypeFromSchema<typeof TlvCredential> {}

    /**
     * Returns the user for the specified UserIndex.
     *
     * If the requested UserIndex is valid and the UserStatus is Available for the requested UserIndex then UserName,
     * UserUniqueID, UserStatus, UserType, CredentialRule, Credentials, CreatorFabricIndex, and LastModifiedFabricIndex
     * shall all be null in the response.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34
     */
    export const TlvGetUserResponse = TlvObject({
        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.1
         */
        userIndex: TlvField(0, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall contain a string to use as a human readable identifier for the user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.2
         */
        userName: TlvField(1, TlvNullable(TlvString.bound({ maxLength: 10 }))),

        /**
         * See UserUniqueID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.3
         */
        userUniqueId: TlvField(2, TlvNullable(TlvUInt32)),

        /**
         * This field shall indicate the UserStatus assigned to the user when created or modified.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.4
         */
        userStatus: TlvField(3, TlvNullable(TlvEnum<UserStatus>())),

        /**
         * This field shall indicate the UserType assigned to this user when created or modified.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.5
         */
        userType: TlvField(4, TlvNullable(TlvEnum<UserType>())),

        /**
         * This field shall indicate the CredentialRule set for this user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.6
         */
        credentialRule: TlvField(5, TlvNullable(TlvEnum<CredentialRule>())),

        /**
         * This field shall contain a list of credentials for this user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.7
         */
        credentials: TlvField(6, TlvNullable(TlvArray(TlvCredential, { minLength: 0 }))),

        /**
         * This field shall indicate the user’s creator fabric index. CreatorFabricIndex shall be null if UserStatus is
         * set to Available or when the creator fabric cannot be determined (for example, when user was created outside
         * the Interaction Model) and shall NOT be null otherwise. This value shall be set to 0 if the original creator
         * fabric was deleted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.8
         */
        creatorFabricIndex: TlvField(7, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the user’s last modifier fabric index. LastModifiedFabricIndex shall be null if
         * UserStatus is set to Available or when the modifier fabric cannot be determined (for example, when user was
         * modified outside the Interaction Model) and shall NOT be null otherwise. This value shall be set to 0 if the
         * last modifier fabric was deleted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.9
         */
        lastModifiedFabricIndex: TlvField(8, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the next occupied UserIndex in the database which is useful for quickly identifying
         * occupied user slots in the database. This shall NOT be null if there is at least one occupied entry after the
         * requested UserIndex in the User database and shall be null if there are no more occupied entries.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34.10
         */
        nextUserIndex: TlvField(9, TlvNullable(TlvUInt16.bound({ min: 1 })))
    });

    /**
     * Returns the user for the specified UserIndex.
     *
     * If the requested UserIndex is valid and the UserStatus is Available for the requested UserIndex then UserName,
     * UserUniqueID, UserStatus, UserType, CredentialRule, Credentials, CreatorFabricIndex, and LastModifiedFabricIndex
     * shall all be null in the response.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.34
     */
    export interface GetUserResponse extends TypeFromSchema<typeof TlvGetUserResponse> {}

    /**
     * Input to the DoorLock clearUser command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.35
     */
    export const TlvClearUserRequest = TlvObject({
        /**
         * This field shall specify a valid User index or 0xFFFE to indicate all user slots shall be cleared.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.35.1
         */
        userIndex: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the DoorLock clearUser command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.35
     */
    export interface ClearUserRequest extends TypeFromSchema<typeof TlvClearUserRequest> {}

    /**
     * Input to the DoorLock setCredential command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36
     */
    export const TlvSetCredentialRequest = TlvObject({
        /**
         * This field shall indicate the set credential operation type requested.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36.1
         */
        operationType: TlvField(0, TlvEnum<DataOperationType>()),

        /**
         * This field shall contain a credential structure that contains the CredentialTypeEnum and the credential index
         * (if applicable or 0 if not) to set.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36.2
         */
        credential: TlvField(1, TlvCredential),

        /**
         * This field shall indicate the credential data to set for the credential being added or modified. The length
         * of the credential data shall conform to the limits of the CredentialType specified in the Credential
         * structure otherwise an INVALID_COMMAND status shall be returned in the SetCredentialResponse command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36.3
         */
        credentialData: TlvField(2, TlvByteString),

        /**
         * This field shall indicate the user index to the user record that corresponds to the credential being added or
         * modified. This shall be null if OperationType is add and a new credential and user is being added at the same
         * time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36.4
         */
        userIndex: TlvField(3, TlvNullable(TlvUInt16.bound({ min: 1 }))),

        /**
         * This field shall indicate the user status to use in the new user record if a new user is being created. This
         * shall be null if OperationType is Modify. This may be null when adding a new credential and user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36.5
         */
        userStatus: TlvField(4, TlvNullable(TlvEnum<UserStatus>())),

        /**
         * This field shall indicate the user type to use in the new user record if a new user is being created. This
         * shall be null if OperationType is Modify. This may be null when adding a new credential and user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36.6
         */
        userType: TlvField(5, TlvNullable(TlvEnum<UserType>()))
    });

    /**
     * Input to the DoorLock setCredential command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36
     */
    export interface SetCredentialRequest extends TypeFromSchema<typeof TlvSetCredentialRequest> {}

    /**
     * Returns the status for setting the specified credential.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.37
     */
    export const TlvSetCredentialResponse = TlvObject({
        /**
         * Status comes from the Status Codes table and shall be one of the following values:
         *
         *   • SUCCESS, if setting user credential was successful.
         *
         *   • FAILURE, if some unexpected internal error occurred setting user credential.
         *
         *   • OCCUPIED, if OperationType is Add and CredentialIndex in Credential structure points to an occupied slot.
         *
         *   • OCCUPIED, if OperationType is Modify and CredentialIndex in Credential structure does not match the
         *     CredentialIndex that is already associated with the provided UserIndex.
         *
         *   • DUPLICATE, if CredentialData provided is a duplicate of another credential with the same CredentialType
         *     (e.g. duplicate PIN code).
         *
         *   • RESOURCE_EXHAUSTED, if OperationType is Add and the new credential cannot be added due to resource
         *     constraints such as:
         *
         *     ◦ The user referred to by UserIndex already has NumberOfCredentialsSupportedPerUser credentials
         *       associated.
         *
         *     ◦ The credential is of type AliroEvictableEndpointKey or AliroNonEvictableEndpointKey, and adding it
         *       would cause the total number of credentials of those two types to exceed
         *       NumberOfAliroEndpointKeysSupported.
         *
         *   • INVALID_COMMAND, if one or more fields violate constraints or are invalid.
         *
         *   • INVALID_COMMAND, if the CredentialIndex in the Credential provided exceeds the number of credentials of
         *     the provided CredentialType supported by the lock.
         *
         *   • INVALID_COMMAND, if OperationType is Modify and UserIndex points to an available slot.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.37.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall indicate the user index that was created with the new credential. If the status being
         * returned is not success then this shall be null. This shall be null if OperationType was Modify; if the
         * OperationType was Add and a new User was created this shall NOT be null and shall provide the UserIndex
         * created. If the OperationType was Add and an existing User was associated with the new credential then this
         * shall be null.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.37.2
         */
        userIndex: TlvField(1, TlvNullable(TlvUInt16.bound({ min: 1 }))),

        /**
         * This field shall indicate the next available index in the database for the credential type set, which is
         * useful for quickly identifying available credential slots in the database. This shall NOT be null if there is
         * at least one available entry after the requested credential index in the corresponding database and shall be
         * null if there are no more available entries. The NextCredentialIndex reported shall NOT exceed the maximum
         * number of credentials for a particular credential type.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.37.3
         */
        nextCredentialIndex: TlvOptionalField(2, TlvNullable(TlvUInt16))
    });

    /**
     * Returns the status for setting the specified credential.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.37
     */
    export interface SetCredentialResponse extends TypeFromSchema<typeof TlvSetCredentialResponse> {}

    /**
     * Input to the DoorLock getCredentialStatus command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.38
     */
    export const TlvGetCredentialStatusRequest = TlvObject({
        /**
         * This field shall contain a credential structure that contains the CredentialTypeEnum and the credential index
         * (if applicable or 0 if not) to retrieve the status for.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.38.1
         */
        credential: TlvField(0, TlvCredential)
    });

    /**
     * Input to the DoorLock getCredentialStatus command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.38
     */
    export interface GetCredentialStatusRequest extends TypeFromSchema<typeof TlvGetCredentialStatusRequest> {}

    /**
     * Returns the status for the specified credential.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39
     */
    export const TlvGetCredentialStatusResponse = TlvObject({
        /**
         * This field shall indicate if the requested credential type and index exists and is populated for the
         * requested user index.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39.1
         */
        credentialExists: TlvField(0, TlvBoolean),

        /**
         * This field shall indicate the credential’s corresponding user index value if the credential exists. If
         * CredentialType requested was ProgrammingPIN then UserIndex shall be null; otherwise, UserIndex shall be null
         * if CredentialExists is set to False and shall NOT be null if CredentialExists is set to True.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39.2
         */
        userIndex: TlvField(1, TlvNullable(TlvUInt16.bound({ min: 1 }))),

        /**
         * This field shall indicate the credential’s creator fabric index. CreatorFabricIndex shall be null if
         * CredentialExists is set to False or when the creator fabric cannot be determined (for example, when
         * credential was created outside the Interaction Model) and shall NOT be null otherwise. This value shall be
         * set to 0 if the original creator fabric was deleted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39.3
         */
        creatorFabricIndex: TlvField(2, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the credential’s last modifier fabric index. LastModifiedFabricIndex shall be null
         * if CredentialExists is set to False or when the modifier fabric cannot be determined (for example, when
         * credential was modified outside the Interaction Model) and shall NOT be null otherwise. This value shall be
         * set to 0 if the last modifier fabric was deleted.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39.4
         */
        lastModifiedFabricIndex: TlvField(3, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the next occupied index in the database for the credential type requested, which is
         * useful for quickly identifying occupied credential slots in the database. This shall NOT be null if there is
         * at least one occupied entry after the requested credential index in the corresponding database and shall be
         * null if there are no more occupied entries. The NextCredentialIndex reported shall NOT exceed the maximum
         * number of credentials for a particular credential type.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39.5
         */
        nextCredentialIndex: TlvOptionalField(4, TlvNullable(TlvUInt16)),

        /**
         * This field shall indicate the credential data for the requested user index.
         *
         * If the CredentialType in the GetCredentialStatus command was not AliroCredentialIssuerKey,
         * AliroEvictableEndpointKey, or AliroNonEvictableEndpointKey, this field shall NOT be included.
         *
         * Otherwise, if CredentialExists is false this field shall be null.
         *
         * Otherwise, the value of this field shall be the value of the relevant credential, as a 65-byte uncompressed
         * elliptic curve public key as defined in section 2.3.3 of SEC 1.
         *
         * > [!NOTE]
         *
         * > Since the Aliro credentials are public keys, there is no security risk in allowing them to be read.
         *   Possession of the credential octet string does not allow operating the lock.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39.6
         */
        credentialData: TlvOptionalField(5, TlvNullable(TlvByteString))
    });

    /**
     * Returns the status for the specified credential.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.39
     */
    export interface GetCredentialStatusResponse extends TypeFromSchema<typeof TlvGetCredentialStatusResponse> {}

    /**
     * Input to the DoorLock clearCredential command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.40
     */
    export const TlvClearCredentialRequest = TlvObject({
        /**
         * This field shall contain a credential structure that contains the CredentialTypeEnum and the credential index
         * (0xFFFE for all credentials or 0 if not applicable) to clear. This shall be null if clearing all credential
         * types otherwise it shall NOT be null.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.40.1
         */
        credential: TlvField(0, TlvNullable(TlvCredential))
    });

    /**
     * Input to the DoorLock clearCredential command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.40
     */
    export interface ClearCredentialRequest extends TypeFromSchema<typeof TlvClearCredentialRequest> {}

    /**
     * This enumeration shall indicate the data type that is being or has changed.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.12
     */
    export enum LockDataType {
        /**
         * Unspecified or manufacturer specific lock user data added, cleared, or modified.
         */
        Unspecified = 0,

        /**
         * Lock programming PIN code was added, cleared, or modified.
         */
        ProgrammingCode = 1,

        /**
         * Lock user index was added, cleared, or modified.
         */
        UserIndex = 2,

        /**
         * Lock user week day schedule was added, cleared, or modified.
         */
        WeekDaySchedule = 3,

        /**
         * Lock user year day schedule was added, cleared, or modified.
         */
        YearDaySchedule = 4,

        /**
         * Lock holiday schedule was added, cleared, or modified.
         */
        HolidaySchedule = 5,

        /**
         * Lock user PIN code was added, cleared, or modified.
         */
        Pin = 6,

        /**
         * Lock user RFID code was added, cleared, or modified.
         */
        Rfid = 7,

        /**
         * Lock user fingerprint was added, cleared, or modified.
         */
        Fingerprint = 8,

        /**
         * Lock user finger-vein information was added, cleared, or modified.
         */
        FingerVein = 9,

        /**
         * Lock user face information was added, cleared, or modified.
         */
        Face = 10,

        /**
         * An Aliro credential issuer key credential was added, cleared, or modified.
         */
        AliroCredentialIssuerKey = 11,

        /**
         * An Aliro endpoint key credential which can be evicted credential was added, cleared, or modified.
         */
        AliroEvictableEndpointKey = 12,

        /**
         * An Aliro endpoint key credential which cannot be evicted was added, cleared, or modified.
         */
        AliroNonEvictableEndpointKey = 13
    }

    /**
     * This enumeration shall indicate the source of the Lock/Unlock or user change operation performed.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.16
     */
    export enum OperationSource {
        /**
         * Lock/unlock operation came from unspecified source
         */
        Unspecified = 0,

        /**
         * Lock/unlock operation came from manual operation (key, thumbturn, handle, etc).
         */
        Manual = 1,

        /**
         * Lock/unlock operation came from proprietary remote source (e.g. vendor app/cloud)
         */
        ProprietaryRemote = 2,

        /**
         * Lock/unlock operation came from keypad
         */
        Keypad = 3,

        /**
         * Lock/unlock operation came from lock automatically (e.g. relock timer)
         */
        Auto = 4,

        /**
         * Lock/unlock operation came from lock button (e.g. one touch or button)
         */
        Button = 5,

        /**
         * Lock/unlock operation came from lock due to a schedule
         */
        Schedule = 6,

        /**
         * Lock/unlock operation came from remote node
         */
        Remote = 7,

        /**
         * Lock/unlock operation came from RFID card
         */
        Rfid = 8,

        /**
         * Lock/unlock operation came from biometric source (e.g. face, fingerprint/fingervein)
         */
        Biometric = 9,

        /**
         * Lock/unlock operation came from an interaction defined in [Aliro], or user change operation was a step-up
         * credential provisioning as defined in [Aliro]
         */
        Aliro = 10
    }

    /**
     * Body of the DoorLock lockUserChange event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5
     */
    export const TlvLockUserChangeEvent = TlvObject({
        /**
         * This field shall indicate the lock data type that was changed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.1
         */
        lockDataType: TlvField(0, TlvEnum<LockDataType>()),

        /**
         * This field shall indicate the data operation performed on the lock data type changed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.2
         */
        dataOperationType: TlvField(1, TlvEnum<DataOperationType>()),

        /**
         * This field shall indicate the source of the user data change.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.3
         */
        operationSource: TlvField(2, TlvEnum<OperationSource>()),

        /**
         * This field shall indicate the lock UserIndex associated with the change (if any). This shall be null if there
         * is no specific user associated with the data operation. This shall be 0xFFFE if all users are affected (e.g.
         * Clear Users).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.4
         */
        userIndex: TlvField(3, TlvNullable(TlvUInt16)),

        /**
         * This field shall indicate the fabric index of the fabric that performed the change (if any). This shall be
         * null if there is no fabric that can be determined to have caused the change. This shall NOT be null if the
         * operation source is "Remote".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.5
         */
        fabricIndex: TlvField(4, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the Node ID that performed the change (if any). The Node ID of the node that
         * performed the change. This shall be null if there was no Node involved in the change. This shall NOT be null
         * if the operation source is "Remote".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.6
         */
        sourceNode: TlvField(5, TlvNullable(TlvNodeId)),

        /**
         * This field shall indicate the index of the specific item that was changed (e.g. schedule, PIN, RFID, etc.) in
         * the list of items identified by LockDataType. This shall be null if the LockDataType does not correspond to a
         * list that can be indexed into (e.g. ProgrammingUser). This shall be 0xFFFE if all indices are affected (e.g.
         * ClearPINCode, ClearRFIDCode, ClearWeekDaySchedule, ClearYearDaySchedule, etc.).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5.7
         */
        dataIndex: TlvField(6, TlvNullable(TlvUInt16))
    });

    /**
     * Body of the DoorLock lockUserChange event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5
     */
    export interface LockUserChangeEvent extends TypeFromSchema<typeof TlvLockUserChangeEvent> {}

    /**
     * This bitmap shall indicate the days of the week the Week Day schedule applies for.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.1
     */
    export const DaysMask = {
        /**
         * Schedule is applied on Sunday
         */
        sunday: BitFlag(0),

        /**
         * Schedule is applied on Monday
         */
        monday: BitFlag(1),

        /**
         * Schedule is applied on Tuesday
         */
        tuesday: BitFlag(2),

        /**
         * Schedule is applied on Wednesday
         */
        wednesday: BitFlag(3),

        /**
         * Schedule is applied on Thursday
         */
        thursday: BitFlag(4),

        /**
         * Schedule is applied on Friday
         */
        friday: BitFlag(5),

        /**
         * Schedule is applied on Saturday
         */
        saturday: BitFlag(6)
    };

    /**
     * Input to the DoorLock setWeekDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12
     */
    export const TlvSetWeekDayScheduleRequest = TlvObject({
        /**
         * This field shall indicate the index of the Week Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.1
         */
        weekDayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate which week days the schedule is active.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.3
         */
        daysMask: TlvField(2, TlvBitmap(TlvUInt8, DaysMask)),

        /**
         * This field shall indicate the starting hour for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.4
         */
        startHour: TlvField(3, TlvUInt8.bound({ max: 23 })),

        /**
         * This field shall indicate the starting minute for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.5
         */
        startMinute: TlvField(4, TlvUInt8.bound({ max: 59 })),

        /**
         * This field shall indicate the ending hour for the Week Day schedule. EndHour shall be equal to or greater
         * than StartHour.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.6
         */
        endHour: TlvField(5, TlvUInt8.bound({ max: 23 })),

        /**
         * This field shall indicate the ending minute for the Week Day schedule. If EndHour is equal to StartHour then
         * EndMinute shall be greater than StartMinute.
         *
         * If the EndHour is equal to 23 and the EndMinute is equal to 59 the Lock shall grant access to the user up
         * until 23:59:59.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12.7
         */
        endMinute: TlvField(6, TlvUInt8.bound({ max: 59 }))
    });

    /**
     * Input to the DoorLock setWeekDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12
     */
    export interface SetWeekDayScheduleRequest extends TypeFromSchema<typeof TlvSetWeekDayScheduleRequest> {}

    /**
     * Input to the DoorLock getWeekDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.13
     */
    export const TlvGetWeekDayScheduleRequest = TlvObject({
        weekDayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * Input to the DoorLock getWeekDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.13
     */
    export interface GetWeekDayScheduleRequest extends TypeFromSchema<typeof TlvGetWeekDayScheduleRequest> {}

    /**
     * Returns the weekly repeating schedule data for the specified schedule index.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14
     */
    export const TlvGetWeekDayScheduleResponse = TlvObject({
        /**
         * This field shall indicate the index of the Week Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.1
         */
        weekDayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * Status shall be one of the following values:
         *
         *   • SUCCESS if both WeekDayIndex and UserIndex are valid and there is a corresponding schedule entry.
         *
         *   • INVALID_COMMAND if either WeekDayIndex and/or UserIndex values are not within valid range
         *
         *   • NOT_FOUND if no corresponding schedule entry found for WeekDayIndex.
         *
         *   • NOT_FOUND if no corresponding user entry found for UserIndex.
         *
         * If this field is SUCCESS, the optional fields for this command shall be present. For other (error) status
         * values, only the fields up to the status field shall be present.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.3
         */
        status: TlvField(2, TlvEnum<Status>()),

        daysMask: TlvOptionalField(3, TlvBitmap(TlvUInt8, DaysMask)),

        /**
         * This field shall indicate the starting hour for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.4
         */
        startHour: TlvOptionalField(4, TlvUInt8.bound({ max: 23 })),

        /**
         * This field shall indicate the starting minute for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.5
         */
        startMinute: TlvOptionalField(5, TlvUInt8.bound({ max: 59 })),

        /**
         * This field shall indicate the ending hour for the Week Day schedule. EndHour shall be equal to or greater
         * than StartHour.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.6
         */
        endHour: TlvOptionalField(6, TlvUInt8.bound({ max: 23 })),

        /**
         * This field shall indicate the ending minute for the Week Day schedule. If EndHour is equal to StartHour then
         * EndMinute shall be greater than StartMinute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14.7
         */
        endMinute: TlvOptionalField(7, TlvUInt8.bound({ max: 59 }))
    });

    /**
     * Returns the weekly repeating schedule data for the specified schedule index.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.14
     */
    export interface GetWeekDayScheduleResponse extends TypeFromSchema<typeof TlvGetWeekDayScheduleResponse> {}

    /**
     * Input to the DoorLock clearWeekDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.15
     */
    export const TlvClearWeekDayScheduleRequest = TlvObject({
        /**
         * This field shall indicate the Week Day schedule index to clear or 0xFE to clear all Week Day schedules for
         * the specified user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.15.1
         */
        weekDayIndex: TlvField(0, TlvUInt8),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.15.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * Input to the DoorLock clearWeekDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.15
     */
    export interface ClearWeekDayScheduleRequest extends TypeFromSchema<typeof TlvClearWeekDayScheduleRequest> {}

    /**
     * Input to the DoorLock setYearDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16
     */
    export const TlvSetYearDayScheduleRequest = TlvObject({
        /**
         * This field shall indicate the index of the Year Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16.1
         */
        yearDayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the starting time for the Year Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16.3
         */
        localStartTime: TlvField(2, TlvEpochS),

        /**
         * This field shall indicate the ending time for the Year Day schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime shall be
         * greater than LocalStartTime.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16.4
         */
        localEndTime: TlvField(3, TlvEpochS)
    });

    /**
     * Input to the DoorLock setYearDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16
     */
    export interface SetYearDayScheduleRequest extends TypeFromSchema<typeof TlvSetYearDayScheduleRequest> {}

    /**
     * Input to the DoorLock getYearDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.17
     */
    export const TlvGetYearDayScheduleRequest = TlvObject({
        yearDayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * Input to the DoorLock getYearDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.17
     */
    export interface GetYearDayScheduleRequest extends TypeFromSchema<typeof TlvGetYearDayScheduleRequest> {}

    /**
     * Returns the year day schedule data for the specified schedule and user indexes.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18
     */
    export const TlvGetYearDayScheduleResponse = TlvObject({
        /**
         * This field shall indicate the index of the Year Day schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18.1
         */
        yearDayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * Status shall be one of the following values:
         *
         *   • SUCCESS if both YearDayIndex and UserIndex are valid and there is a corresponding schedule entry.
         *
         *   • INVALID_COMMAND if either YearDayIndex and/or UserIndex values are not within valid range
         *
         *   • NOT_FOUND if no corresponding schedule entry found for YearDayIndex.
         *
         *   • NOT_FOUND if no corresponding user entry found for UserIndex.
         *
         * If this field is SUCCESS, the optional fields for this command shall be present. For other (error) status
         * values, only the fields up to the status field shall be present.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18.3
         */
        status: TlvField(2, TlvEnum<Status>()),

        /**
         * This field shall indicate the starting time for the Year Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value. This shall be
         * null if the schedule is not set for the YearDayIndex and UserIndex provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18.4
         */
        localStartTime: TlvOptionalField(3, TlvEpochS),

        /**
         * This field shall indicate the ending time for the Year Day schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime shall be
         * greater than LocalStartTime. This shall be null if the schedule is not set for the YearDayIndex and UserIndex
         * provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18.5
         */
        localEndTime: TlvOptionalField(4, TlvEpochS)
    });

    /**
     * Returns the year day schedule data for the specified schedule and user indexes.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.18
     */
    export interface GetYearDayScheduleResponse extends TypeFromSchema<typeof TlvGetYearDayScheduleResponse> {}

    /**
     * Input to the DoorLock clearYearDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.19
     */
    export const TlvClearYearDayScheduleRequest = TlvObject({
        /**
         * This field shall indicate the Year Day schedule index to clear or 0xFE to clear all Year Day schedules for
         * the specified user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.19.1
         */
        yearDayIndex: TlvField(0, TlvUInt8),

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.19.2
         */
        userIndex: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * Input to the DoorLock clearYearDaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.19
     */
    export interface ClearYearDayScheduleRequest extends TypeFromSchema<typeof TlvClearYearDayScheduleRequest> {}

    /**
     * This enumeration shall indicate the lock operating mode.
     *
     * The table below shows the operating mode and which interfaces are enabled, if supported, for each mode.
     *
     * * Interface Operational: Yes, No or N/A
     *
     * > [!NOTE]
     *
     * > For modes that disable the remote interface, the door lock shall respond to Lock, Unlock, Toggle, and Unlock
     *   with Timeout commands with a response status Failure and not take the action requested by those commands. The
     *   door lock shall NOT disable the radio or otherwise unbind or leave the network. It shall still respond to all
     *   other commands and requests.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.15
     */
    export enum OperatingMode {
        /**
         * The lock operates normally. All interfaces are enabled.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.15.1
         */
        Normal = 0,

        /**
         * Only remote interaction is enabled. The keypad shall only be operable by the master user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.15.2
         */
        Vacation = 1,

        /**
         * This mode is only possible if the door is locked. Manual unlocking changes the mode to Normal operating mode.
         * All external interaction with the door lock is disabled. This mode is intended to be used so that users,
         * presumably inside the property, will have control over the entrance.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.15.3
         */
        Privacy = 2,

        /**
         * This mode only disables remote interaction with the lock. This does not apply to any remote proprietary means
         * of communication. It specifically applies to the Lock, Unlock, Toggle, and Unlock with Timeout Commands.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.15.4
         */
        NoRemoteLockUnlock = 3,

        /**
         * The lock is open or can be opened or closed at will without the use of a Keypad or other means of user
         * validation (e.g. a lock for a business during work hours).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.15.5
         */
        Passage = 4
    }

    /**
     * Input to the DoorLock setHolidaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20
     */
    export const TlvSetHolidayScheduleRequest = TlvObject({
        /**
         * This field shall indicate the index of the Holiday schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20.1
         */
        holidayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * This field shall indicate the starting time for the Holiday Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20.2
         */
        localStartTime: TlvField(1, TlvEpochS),

        /**
         * This field shall indicate the ending time for the Holiday Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime
         * shall be greater than LocalStartTime.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20.3
         */
        localEndTime: TlvField(2, TlvEpochS),

        /**
         * This field shall indicate the operating mode to use during this Holiday schedule start/end time.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20.4
         */
        operatingMode: TlvField(3, TlvEnum<OperatingMode>())
    });

    /**
     * Input to the DoorLock setHolidaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20
     */
    export interface SetHolidayScheduleRequest extends TypeFromSchema<typeof TlvSetHolidayScheduleRequest> {}

    /**
     * Input to the DoorLock getHolidaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.21
     */
    export const TlvGetHolidayScheduleRequest = TlvObject({ holidayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })) });

    /**
     * Input to the DoorLock getHolidaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.21
     */
    export interface GetHolidayScheduleRequest extends TypeFromSchema<typeof TlvGetHolidayScheduleRequest> {}

    /**
     * Returns the Holiday Schedule Entry for the specified Holiday ID.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22
     */
    export const TlvGetHolidayScheduleResponse = TlvObject({
        /**
         * This field shall indicate the index of the Holiday schedule.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22.1
         */
        holidayIndex: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * Status shall be one of the following values:
         *
         *   • FAILURE if the attribute NumberOfHolidaySchedulesSupported is zero.
         *
         *   • SUCCESS if the HolidayIndex is valid and there is a corresponding schedule entry.
         *
         *   • INVALID_COMMAND if the HolidayIndex is not within valid range
         *
         *   • NOT_FOUND if the HolidayIndex is within the valid range, however, there is not corresponding schedule
         *     entry found.
         *
         * If this field is SUCCESS, the optional fields for this command shall be present. For other (error) status
         * values, only the fields up to the status field shall be present.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22.2
         */
        status: TlvField(1, TlvEnum<Status>()),

        /**
         * This field shall indicate the starting time for the Holiday schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. This shall be null if
         * the schedule is not set for the HolidayIndex provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22.3
         */
        localStartTime: TlvOptionalField(2, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the ending time for the Holiday schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime shall be
         * greater than LocalStartTime. This shall be null if the schedule is not set for the HolidayIndex provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22.4
         */
        localEndTime: TlvOptionalField(3, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the operating mode to use during this Holiday schedule start/end time. This shall
         * be null if the schedule is not set for the HolidayIndex provided.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22.5
         */
        operatingMode: TlvOptionalField(4, TlvNullable(TlvEnum<OperatingMode>()))
    });

    /**
     * Returns the Holiday Schedule Entry for the specified Holiday ID.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.22
     */
    export interface GetHolidayScheduleResponse extends TypeFromSchema<typeof TlvGetHolidayScheduleResponse> {}

    /**
     * Input to the DoorLock clearHolidaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.23
     */
    export const TlvClearHolidayScheduleRequest = TlvObject({
        /**
         * This field shall indicate the Holiday schedule index to clear or 0xFE to clear all Holiday schedules.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.23.1
         */
        holidayIndex: TlvField(0, TlvUInt8)
    });

    /**
     * Input to the DoorLock clearHolidaySchedule command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.23
     */
    export interface ClearHolidayScheduleRequest extends TypeFromSchema<typeof TlvClearHolidayScheduleRequest> {}

    /**
     * Input to the DoorLock setPinCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.4
     */
    export const TlvSetPinCodeRequest = TlvObject({
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.4.1
         */
        userId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the user status. Only the values 1 (Occupied/Enabled) and 3 (Occupied/Disabled) are
         * allowed for UserStatus.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.4.2
         */
        userStatus: TlvField(1, TlvNullable(TlvEnum<UserStatus>())),

        userType: TlvField(2, TlvNullable(TlvEnum<UserType>())),
        pin: TlvField(3, TlvByteString)
    });

    /**
     * Input to the DoorLock setPinCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.4
     */
    export interface SetPinCodeRequest extends TypeFromSchema<typeof TlvSetPinCodeRequest> {}

    /**
     * Input to the DoorLock getPinCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.5
     */
    export const TlvGetPinCodeRequest = TlvObject({
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.5.1
         */
        userId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the DoorLock getPinCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.5
     */
    export interface GetPinCodeRequest extends TypeFromSchema<typeof TlvGetPinCodeRequest> {}

    /**
     * Returns the PIN for the specified user ID.
     *
     * If the requested UserID is valid and the Code doesn’t exist, Get RFID Code Response shall have the following
     * format:
     *
     * UserID = requested User ID UserStatus = 0 (Available) UserType = Null (Not supported) PINCode = 0 (zero length)
     *
     * If the requested UserID is invalid, send Default Response with an error status. The error status shall be equal
     * to CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and NOT_FOUND if greater than or
     * equal to the max number of users supported.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.6
     */
    export const TlvGetPinCodeResponse = TlvObject({
        userId: TlvField(0, TlvUInt16),
        userStatus: TlvField(1, TlvNullable(TlvEnum<UserStatus>())),
        userType: TlvField(2, TlvNullable(TlvEnum<UserType>())),
        pinCode: TlvField(3, TlvNullable(TlvByteString))
    });

    /**
     * Returns the PIN for the specified user ID.
     *
     * If the requested UserID is valid and the Code doesn’t exist, Get RFID Code Response shall have the following
     * format:
     *
     * UserID = requested User ID UserStatus = 0 (Available) UserType = Null (Not supported) PINCode = 0 (zero length)
     *
     * If the requested UserID is invalid, send Default Response with an error status. The error status shall be equal
     * to CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and NOT_FOUND if greater than or
     * equal to the max number of users supported.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.6
     */
    export interface GetPinCodeResponse extends TypeFromSchema<typeof TlvGetPinCodeResponse> {}

    /**
     * Input to the DoorLock clearPinCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.7
     */
    export const TlvClearPinCodeRequest = TlvObject({
        /**
         * This field shall specify a valid PIN code slot index or 0xFFFE to indicate all PIN code slots shall be
         * cleared.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.7.1
         */
        pinSlotIndex: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the DoorLock clearPinCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.7
     */
    export interface ClearPinCodeRequest extends TypeFromSchema<typeof TlvClearPinCodeRequest> {}

    /**
     * Input to the DoorLock setAliroReaderConfig command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42
     */
    export const TlvSetAliroReaderConfigRequest = TlvObject({
        /**
         * This field shall indicate the signing key component of the Reader’s key pair.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42.1
         */
        signingKey: TlvField(0, TlvByteString.bound({ length: 32 })),

        /**
         * This field shall indicate the verification key component of the Reader’s key pair. This shall be an
         * uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42.2
         */
        verificationKey: TlvField(1, TlvByteString.bound({ length: 65 })),

        /**
         * This field shall indicate the reader group identifier for the lock.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42.3
         */
        groupIdentifier: TlvField(2, TlvByteString.bound({ length: 16 })),

        /**
         * This field shall indicate the group resolving key for the lock.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42.4
         */
        groupResolvingKey: TlvOptionalField(3, TlvByteString.bound({ length: 16 }))
    });

    /**
     * Input to the DoorLock setAliroReaderConfig command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42
     */
    export interface SetAliroReaderConfigRequest extends TypeFromSchema<typeof TlvSetAliroReaderConfigRequest> {}

    /**
     * Input to the DoorLock setUserStatus command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.9
     */
    export const TlvSetUserStatusRequest = TlvObject({
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.9.1
         */
        userId: TlvField(0, TlvUInt16),

        /**
         * UserStatus value of Available is not allowed. In order to clear a user id, the ClearUser Command shall be
         * used. For user status value please refer to UserStatusEnum.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.9.2
         */
        userStatus: TlvField(1, TlvEnum<UserStatus>())
    });

    /**
     * Input to the DoorLock setUserStatus command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.9
     */
    export interface SetUserStatusRequest extends TypeFromSchema<typeof TlvSetUserStatusRequest> {}

    /**
     * Input to the DoorLock getUserStatus command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.10
     */
    export const TlvGetUserStatusRequest = TlvObject({
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.10.1
         */
        userId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the DoorLock getUserStatus command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.10
     */
    export interface GetUserStatusRequest extends TypeFromSchema<typeof TlvGetUserStatusRequest> {}

    /**
     * Returns the user status for the specified user ID.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.11
     */
    export const TlvGetUserStatusResponse = TlvObject({
        /**
         * This field shall indicate the user ID provided in the request.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.11.1
         */
        userId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the current status of the requested user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.11.2
         */
        userStatus: TlvField(1, TlvEnum<UserStatus>())
    });

    /**
     * Returns the user status for the specified user ID.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.11
     */
    export interface GetUserStatusResponse extends TypeFromSchema<typeof TlvGetUserStatusResponse> {}

    /**
     * Input to the DoorLock setUserType command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.24
     */
    export const TlvSetUserTypeRequest = TlvObject({
        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.24.1
         */
        userId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the user type.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.24.2
         */
        userType: TlvField(1, TlvEnum<UserType>())
    });

    /**
     * Input to the DoorLock setUserType command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.24
     */
    export interface SetUserTypeRequest extends TypeFromSchema<typeof TlvSetUserTypeRequest> {}

    /**
     * Input to the DoorLock getUserType command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.25
     */
    export const TlvGetUserTypeRequest = TlvObject({ userId: TlvField(0, TlvUInt16) });

    /**
     * Input to the DoorLock getUserType command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.25
     */
    export interface GetUserTypeRequest extends TypeFromSchema<typeof TlvGetUserTypeRequest> {}

    /**
     * Returns the user type for the specified user ID. If the requested User ID is invalid, send Default Response with
     * an error status equal to FAILURE.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.26
     */
    export const TlvGetUserTypeResponse = TlvObject({
        userId: TlvField(0, TlvUInt16),
        userType: TlvField(1, TlvEnum<UserType>())
    });

    /**
     * Returns the user type for the specified user ID. If the requested User ID is invalid, send Default Response with
     * an error status equal to FAILURE.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.26
     */
    export interface GetUserTypeResponse extends TypeFromSchema<typeof TlvGetUserTypeResponse> {}

    /**
     * Input to the DoorLock setRfidCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.27
     */
    export const TlvSetRfidCodeRequest = TlvObject({
        /**
         * This field shall indicate the user ID.
         *
         * The value of the UserID field shall be between 0 and the value of the NumberOfRFIDUsersSup ported attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.27.1
         */
        userId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate what the status is for a specific user ID. The values are according to “Set PIN”
         * while not all are supported.
         *
         * Only the values 1 (Occupied/Enabled) and 3 (Occupied/Disabled) are allowed for UserStatus.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.27.2
         */
        userStatus: TlvField(1, TlvNullable(TlvEnum<UserStatus>())),

        /**
         * The values are the same as used for SetPINCode command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.27.3
         */
        userType: TlvField(2, TlvNullable(TlvEnum<UserType>())),

        rfidCode: TlvField(3, TlvByteString)
    });

    /**
     * Input to the DoorLock setRfidCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.27
     */
    export interface SetRfidCodeRequest extends TypeFromSchema<typeof TlvSetRfidCodeRequest> {}

    /**
     * Input to the DoorLock getRfidCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.28
     */
    export const TlvGetRfidCodeRequest = TlvObject({
        /**
         * This field shall indicate the user ID.
         *
         * The value of the UserID field shall be between 0 and the value of the NumberOfRFIDUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.28.1
         */
        userId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the DoorLock getRfidCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.28
     */
    export interface GetRfidCodeRequest extends TypeFromSchema<typeof TlvGetRfidCodeRequest> {}

    /**
     * Returns the RFID code for the specified user ID.
     *
     * If the requested User ID is valid and the Code doesn’t exist, Get RFID Code Response shall have the following
     * format:
     *
     * User ID = requested User ID UserStatus = 0 (available) UserType = 0xFF (not supported)
     *
     * RFID Code = 0 (zero length)
     *
     * If requested User ID is invalid, send Default Response with an error status. The error status shall be equal to
     * CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and NOT_FOUND if greater than or
     * equal to the max number of users supported.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.29
     */
    export const TlvGetRfidCodeResponse = TlvObject({
        userId: TlvField(0, TlvUInt16),
        userStatus: TlvField(1, TlvNullable(TlvEnum<UserStatus>())),
        userType: TlvField(2, TlvNullable(TlvEnum<UserType>())),
        rfidCode: TlvField(3, TlvNullable(TlvByteString))
    });

    /**
     * Returns the RFID code for the specified user ID.
     *
     * If the requested User ID is valid and the Code doesn’t exist, Get RFID Code Response shall have the following
     * format:
     *
     * User ID = requested User ID UserStatus = 0 (available) UserType = 0xFF (not supported)
     *
     * RFID Code = 0 (zero length)
     *
     * If requested User ID is invalid, send Default Response with an error status. The error status shall be equal to
     * CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and NOT_FOUND if greater than or
     * equal to the max number of users supported.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.29
     */
    export interface GetRfidCodeResponse extends TypeFromSchema<typeof TlvGetRfidCodeResponse> {}

    /**
     * Input to the DoorLock clearRfidCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.30
     */
    export const TlvClearRfidCodeRequest = TlvObject({
        /**
         * This field shall indicate a valid RFID code slot index or 0xFFFE to indicate all RFID code slots shall be
         * cleared.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.30.1
         */
        rfidSlotIndex: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the DoorLock clearRfidCode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.30
     */
    export interface ClearRfidCodeRequest extends TypeFromSchema<typeof TlvClearRfidCodeRequest> {}

    /**
     * Input to the DoorLock unboltDoor command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.41
     */
    export const TlvUnboltDoorRequest = TlvObject({
        /**
         * See Section 5.2.10.1.1, “PINCode Field”.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.41.1
         */
        pinCode: TlvOptionalField(0, TlvByteString)
    });

    /**
     * Input to the DoorLock unboltDoor command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.41
     */
    export interface UnboltDoorRequest extends TypeFromSchema<typeof TlvUnboltDoorRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.19
     */
    export enum LockState {
        /**
         * Lock state is not fully locked
         */
        NotFullyLocked = 0,

        /**
         * Lock state is fully locked
         */
        Locked = 1,

        /**
         * Lock state is fully unlocked
         */
        Unlocked = 2,

        /**
         * Lock state is fully unlocked and the latch is pulled
         */
        Unlatched = 3
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.20
     */
    export enum LockType {
        /**
         * Physical lock type is dead bolt
         */
        DeadBolt = 0,

        /**
         * Physical lock type is magnetic
         */
        Magnetic = 1,

        /**
         * Physical lock type is other
         */
        Other = 2,

        /**
         * Physical lock type is mortise
         */
        Mortise = 3,

        /**
         * Physical lock type is rim
         */
        Rim = 4,

        /**
         * Physical lock type is latch bolt
         */
        LatchBolt = 5,

        /**
         * Physical lock type is cylindrical lock
         */
        CylindricalLock = 6,

        /**
         * Physical lock type is tubular lock
         */
        TubularLock = 7,

        /**
         * Physical lock type is interconnected lock
         */
        InterconnectedLock = 8,

        /**
         * Physical lock type is dead latch
         */
        DeadLatch = 9,

        /**
         * Physical lock type is door furniture
         */
        DoorFurniture = 10,

        /**
         * Physical lock type is euro cylinder
         */
        Eurocylinder = 11
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.21
     */
    export enum LedSetting {
        /**
         * Never use LED for signalization
         */
        NoLedSignal = 0,

        /**
         * Use LED signalization except for access allowed events
         */
        NoLedSignalAccessAllowed = 1,

        /**
         * Use LED signalization for all events
         */
        LedSignalAll = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.22
     */
    export enum SoundVolume {
        /**
         * Silent Mode
         */
        Silent = 0,

        /**
         * Low Volume
         */
        Low = 1,

        /**
         * High Volume
         */
        High = 2,

        /**
         * Medium Volume
         */
        Medium = 3
    }

    /**
     * For the OperatingModesBitmap, a bit SET indicates that the operating mode IS NOT supported. A bit CLEAR indicates
     * that the operating mode IS supported. This is the inverse of most bitmaps in this specification, and it is
     * RECOMMENDED that clients carefully take this into consideration.
     *
     * ### WARNING
     *
     * For the OperatingModesBitmap, a bit SET indicates that the operating mode IS NOT supported. A bit CLEAR indicates
     * that the operating mode IS supported. This is the inverse of most bitmaps in this specification, and it is
     * recommended that clients carefully take this into consideration. See SupportedOperatingModes.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.3
     */
    export const OperatingModes = {
        /**
         * Normal operation mode is NOT supported
         */
        normal: BitFlag(0),

        /**
         * Vacation operation mode is NOT supported
         */
        vacation: BitFlag(1),

        /**
         * Privacy operation mode is NOT supported
         */
        privacy: BitFlag(2),

        /**
         * No remote lock and unlock operation mode is NOT supported
         */
        noRemoteLockUnlock: BitFlag(3),

        /**
         * Passage operation mode is NOT supported
         */
        passage: BitFlag(4),

        /**
         * This needs always be set because this bitmap is inverse.!
         */
        alwaysSet: BitField(5, 11)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4
     */
    export const ConfigurationRegister = {
        /**
         * The state of local programming functionality
         *
         * This bit shall indicate the state related to local programming:
         *
         *   • 0 = Local programming is disabled
         *
         *   • 1 = Local programming is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4.1
         */
        localProgramming: BitFlag(0),

        /**
         * The state of the keypad interface
         *
         * This bit shall indicate the state related to keypad interface:
         *
         *   • 0 = Keypad interface is disabled
         *
         *   • 1 = Keypad interface is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4.2
         */
        keypadInterface: BitFlag(1),

        /**
         * The state of the remote interface
         *
         * This bit shall indicate the state related to remote interface:
         *
         *   • 0 = Remote interface is disabled
         *
         *   • 1 = Remote interface is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4.3
         */
        remoteInterface: BitFlag(2),

        /**
         * Sound volume is set to Silent value
         *
         * This bit shall indicate the state related to sound volume:
         *
         *   • 0 = Sound volume value is 0 (Silent)
         *
         *   • 1 = Sound volume value is equal to something other than 0
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4.4
         */
        soundVolume: BitFlag(5),

        /**
         * Auto relock time it set to 0
         *
         * This bit shall indicate the state related to auto relock time:
         *
         *   • 0 = Auto relock time value is 0
         *
         *   • 1 = Auto relock time value is equal to something other than 0
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4.5
         */
        autoRelockTime: BitFlag(6),

        /**
         * LEDs is disabled
         *
         * This bit shall indicate the state related to LED settings:
         *
         *   • 0 = LED settings value is 0 (NoLEDSignal)
         *
         *   • 1 = LED settings value is equal to something other than 0
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.4.6
         */
        ledSettings: BitFlag(7)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.5
     */
    export const LocalProgrammingFeatures = {
        /**
         * The state of the ability to add users, credentials or schedules on the device
         *
         * This bit shall indicate whether the door lock is able to add Users/Credentials/Schedules locally:
         *
         *   • 0 = This ability is disabled
         *
         *   • 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.5.1
         */
        addUsersCredentialsSchedules: BitFlag(0),

        /**
         * The state of the ability to modify users, credentials or schedules on the device
         *
         * This bit shall indicate whether the door lock is able to modify Users/Credentials/Schedules locally:
         *
         *   • 0 = This ability is disabled
         *
         *   • 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.5.2
         */
        modifyUsersCredentialsSchedules: BitFlag(1),

        /**
         * The state of the ability to clear users, credentials or schedules on the device
         *
         * This bit shall indicate whether the door lock is able to clear Users/Credentials/Schedules locally:
         *
         *   • 0 = This ability is disabled
         *
         *   • 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.5.3
         */
        clearUsersCredentialsSchedules: BitFlag(2),

        /**
         * The state of the ability to adjust settings on the device
         *
         * This bit shall indicate whether the door lock is able to adjust lock settings locally:
         *
         *   • 0 = This ability is disabled
         *
         *   • 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.5.4
         */
        adjustSettings: BitFlag(3)
    };

    /**
     * Input to the DoorLock lockDoor command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.1
     */
    export const TlvLockDoorRequest = TlvObject({
        /**
         * If the RequirePINforRemoteOperation attribute is True then PINCode field shall be provided and the door lock
         * shall NOT grant access if it is not provided.
         *
         * If the PINCode field is provided, the door lock shall verify PINCode before granting access regardless of the
         * value of RequirePINForRemoteOperation attribute.
         *
         * When the PINCode field is provided an invalid PIN will count towards the WrongCodeEntryLimit and the
         * UserCodeTemporaryDisableTime will be triggered if the WrongCodeEntryLimit is exceeded. The lock shall ignore
         * any attempts to lock/unlock the door until the UserCodeTemporaryDisableTime expires.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.1.1
         */
        pinCode: TlvOptionalField(0, TlvByteString)
    });

    /**
     * Input to the DoorLock lockDoor command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.1
     */
    export interface LockDoorRequest extends TypeFromSchema<typeof TlvLockDoorRequest> {}

    /**
     * Input to the DoorLock unlockDoor command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.2
     */
    export const TlvUnlockDoorRequest = TlvObject({
        /**
         * See Section 5.2.10.1.1, “PINCode Field”.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.2.1
         */
        pinCode: TlvOptionalField(0, TlvByteString)
    });

    /**
     * Input to the DoorLock unlockDoor command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.2
     */
    export interface UnlockDoorRequest extends TypeFromSchema<typeof TlvUnlockDoorRequest> {}

    /**
     * Input to the DoorLock unlockWithTimeout command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.3
     */
    export const TlvUnlockWithTimeoutRequest = TlvObject({
        /**
         * This field shall indicate the timeout in seconds to wait before relocking the door lock. This value is
         * independent of the AutoRelockTime attribute value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.3.1
         */
        timeout: TlvField(0, TlvUInt16),

        /**
         * See Section 5.2.10.1.1, “PINCode Field”.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.3.2
         */
        pinCode: TlvOptionalField(1, TlvByteString)
    });

    /**
     * Input to the DoorLock unlockWithTimeout command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.3
     */
    export interface UnlockWithTimeoutRequest extends TypeFromSchema<typeof TlvUnlockWithTimeoutRequest> {}

    /**
     * This enumeration shall indicate the alarm type.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.7
     */
    export enum AlarmCode {
        /**
         * Locking Mechanism Jammed
         */
        LockJammed = 0,

        /**
         * Lock Reset to Factory Defaults
         */
        LockFactoryReset = 1,

        /**
         * Lock Radio Power Cycled
         */
        LockRadioPowerCycled = 3,

        /**
         * Tamper Alarm - wrong code entry limit
         */
        WrongCodeEntryLimit = 4,

        /**
         * Tamper Alarm - front escutcheon removed from main
         */
        FrontEsceutcheonRemoved = 5,

        /**
         * Forced Door Open under Door Locked Condition
         */
        DoorForcedOpen = 6,

        /**
         * Door ajar
         */
        DoorAjar = 7,

        /**
         * Force User SOS alarm
         */
        ForcedUser = 8
    }

    /**
     * Body of the DoorLock doorLockAlarm event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.1
     */
    export const TlvDoorLockAlarmEvent = TlvObject({
        /**
         * This field shall indicate the alarm code of the event that has happened.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.1.1
         */
        alarmCode: TlvField(0, TlvEnum<AlarmCode>())
    });

    /**
     * Body of the DoorLock doorLockAlarm event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.1
     */
    export interface DoorLockAlarmEvent extends TypeFromSchema<typeof TlvDoorLockAlarmEvent> {}

    /**
     * This enumeration shall indicate the type of Lock operation performed.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.13
     */
    export enum LockOperationType {
        /**
         * Lock operation
         */
        Lock = 0,

        /**
         * Unlock operation
         */
        Unlock = 1,

        /**
         * Triggered by keypad entry for user with User Type set to Non Access User
         */
        NonAccessUserEvent = 2,

        /**
         * Triggered by using a user with UserType set to Forced User
         */
        ForcedUserEvent = 3,

        /**
         * Unlatch operation
         */
        Unlatch = 4
    }

    /**
     * Body of the DoorLock lockOperation event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3
     */
    export const TlvLockOperationEvent = TlvObject({
        /**
         * This field shall indicate the type of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3.1
         */
        lockOperationType: TlvField(0, TlvEnum<LockOperationType>()),

        /**
         * This field shall indicate the source of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3.2
         */
        operationSource: TlvField(1, TlvEnum<OperationSource>()),

        /**
         * This field shall indicate the UserIndex who performed the lock operation. This shall be null if there is no
         * user index that can be determined for the given operation source. This shall NOT be null if a user index can
         * be determined. In particular, this shall NOT be null if the operation was associated with a valid credential.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3.3
         */
        userIndex: TlvField(2, TlvNullable(TlvUInt16)),

        /**
         * This field shall indicate the fabric index of the fabric that performed the lock operation. This shall be
         * null if there is no fabric that can be determined for the given operation source. This shall NOT be null if
         * the operation source is "Remote".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3.4
         */
        fabricIndex: TlvField(3, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the Node ID of the node that performed the lock operation. This shall be null if
         * there is no Node associated with the given operation source. This shall NOT be null if the operation source
         * is "Remote".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3.5
         */
        sourceNode: TlvField(4, TlvNullable(TlvNodeId)),

        /**
         * This field shall indicate the list of credentials used in performing the lock operation. This shall be null
         * if no credentials were involved.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3.6
         */
        credentials: TlvOptionalField(5, TlvNullable(TlvArray(TlvCredential, { minLength: 1 })))
    });

    /**
     * Body of the DoorLock lockOperation event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3
     */
    export interface LockOperationEvent extends TypeFromSchema<typeof TlvLockOperationEvent> {}

    /**
     * This enumeration shall indicate the error cause of the Lock/Unlock operation performed.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.14
     */
    export enum OperationError {
        /**
         * Lock/unlock error caused by unknown or unspecified source
         */
        Unspecified = 0,

        /**
         * Lock/unlock error caused by invalid PIN, RFID, fingerprint or other credential
         */
        InvalidCredential = 1,

        /**
         * Lock/unlock error caused by disabled USER or credential
         */
        DisabledUserDenied = 2,

        /**
         * Lock/unlock error caused by schedule restriction
         */
        Restricted = 3,

        /**
         * Lock/unlock error caused by insufficient battery power left to safely actuate the lock
         */
        InsufficientBattery = 4
    }

    /**
     * Body of the DoorLock lockOperationError event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4
     */
    export const TlvLockOperationErrorEvent = TlvObject({
        /**
         * This field shall indicate the type of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.1
         */
        lockOperationType: TlvField(0, TlvEnum<LockOperationType>()),

        /**
         * This field shall indicate the source of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.2
         */
        operationSource: TlvField(1, TlvEnum<OperationSource>()),

        /**
         * This field shall indicate the lock operation error triggered when the operation was performed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.3
         */
        operationError: TlvField(2, TlvEnum<OperationError>()),

        /**
         * This field shall indicate the lock UserIndex who performed the lock operation. This shall be null if there is
         * no user id that can be determined for the given operation source.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.4
         */
        userIndex: TlvField(3, TlvNullable(TlvUInt16)),

        /**
         * This field shall indicate the fabric index of the fabric that performed the lock operation. This shall be
         * null if there is no fabric that can be determined for the given operation source. This shall NOT be null if
         * the operation source is "Remote".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.5
         */
        fabricIndex: TlvField(4, TlvNullable(TlvFabricIndex)),

        /**
         * This field shall indicate the Node ID of the node that performed the lock operation. This shall be null if
         * there is no Node associated with the given operation source. This shall NOT be null if the operation source
         * is "Remote".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.6
         */
        sourceNode: TlvField(5, TlvNullable(TlvNodeId)),

        /**
         * This field shall indicate the list of credentials used in performing the lock operation. This shall be null
         * if no credentials were involved.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4.7
         */
        credentials: TlvOptionalField(6, TlvNullable(TlvArray(TlvCredential, { minLength: 1 })))
    });

    /**
     * Body of the DoorLock lockOperationError event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4
     */
    export interface LockOperationErrorEvent extends TypeFromSchema<typeof TlvLockOperationErrorEvent> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.6
     */
    export const AlarmMask = {
        /**
         * Locking Mechanism Jammed
         */
        lockJammed: BitFlag(0),

        /**
         * Lock Reset to Factory Defaults
         */
        lockFactoryReset: BitFlag(1),

        /**
         * RF Module Power Cycled
         */
        lockRadioPowerCycled: BitFlag(3),

        /**
         * Tamper Alarm - wrong code entry limit
         */
        wrongCodeEntryLimit: BitFlag(4),

        /**
         * Tamper Alarm - front escutcheon removed from main
         */
        frontEscutcheonRemoved: BitFlag(5),

        /**
         * Forced Door Open under Door Locked Condition
         */
        doorForcedOpen: BitFlag(6)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.6.23
     */
    export enum EventType {
        /**
         * Event type is operation
         */
        Operation = 0,

        /**
         * Event type is programming
         */
        Programming = 1,

        /**
         * Event type is alarm
         */
        Alarm = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.7.1
     */
    export enum StatusCode {
        /**
         * Entry would cause a duplicate credential/ID.
         */
        Duplicate = 2,

        /**
         * Entry would replace an occupied slot.
         */
        Occupied = 3
    }

    /**
     * Thrown for cluster status code {@link StatusCode.Duplicate}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.7.1
     */
    export class DuplicateError extends StatusResponseError {
        constructor(
            message = "Entry would cause a duplicate credential/ID",
            code = Status.Failure,
            clusterCode = StatusCode.Duplicate
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.Occupied}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2.7.1
     */
    export class OccupiedError extends StatusResponseError {
        constructor(
            message = "Entry would replace an occupied slot",
            code = Status.Failure,
            clusterCode = StatusCode.Occupied
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * A DoorLockCluster supports these elements if it supports feature DoorPositionSensor.
     */
    export const DoorPositionSensorComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the current door state as defined in DoorStateEnum.
             *
             * Null only if an internal error prevents the retrieval of the current door state.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.4
             */
            doorState: Attribute(0x3, TlvNullable(TlvEnum<DoorState>())),

            /**
             * This attribute shall hold the number of door open events that have occurred since it was last zeroed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.5
             */
            doorOpenEvents: OptionalWritableAttribute(0x4, TlvUInt32, { writeAcl: AccessLevel.Manage }),

            /**
             * This attribute shall hold the number of door closed events that have occurred since it was last zeroed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.6
             */
            doorClosedEvents: OptionalWritableAttribute(0x5, TlvUInt32, { writeAcl: AccessLevel.Manage }),

            /**
             * This attribute shall hold the number of minutes the door has been open since the last time it
             * transitioned from closed to open.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.7
             */
            openPeriod: OptionalWritableAttribute(0x6, TlvUInt16, { writeAcl: AccessLevel.Manage })
        },

        events: {
            /**
             * The door lock server sends out a DoorStateChange event when the door lock door state changes.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.2
             */
            doorStateChange: Event(0x1, Priority.Critical, TlvDoorStateChangeEvent)
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature User.
     */
    export const UserComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of total users supported by the lock.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.8
             */
            numberOfTotalUsersSupported: FixedAttribute(0x11, TlvUInt16),

            /**
             * This attribute shall contain a bitmap with the bits set for the values of CredentialRuleEnum supported on
             * this device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.18
             */
            credentialRulesSupport: FixedAttribute(0x1b, TlvBitmap(TlvUInt8, CredentialRules)),

            /**
             * Indicates the number of credentials that could be assigned for each user.
             *
             * Depending on the value of NumberOfRFIDUsersSupported and NumberOfPINUsersSupported it may not be possible
             * to assign that number of credentials for a user.
             *
             * For example, if the device supports only PIN and RFID credential types,
             * NumberOfCredentialsSupportedPerUser is set to 10, NumberOfPINUsersSupported is set to 5 and
             * NumberOfRFIDUsersSupported is set to 3, it will not be possible to actually assign 10 credentials for a
             * user because maximum number of credentials in the database is 8.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.19
             */
            numberOfCredentialsSupportedPerUser: FixedAttribute(0x1c, TlvUInt8),

            /**
             * Indicates the number of minutes a PIN, RFID, Fingerprint, or other credential associated with a user of
             * type ExpiringUser shall remain valid after its first use before expiring. When the credential expires the
             * UserStatus for the corresponding user record shall be set to OccupiedDisabled.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.36
             */
            expiringUserTimeout: OptionalWritableAttribute(
                0x35,
                TlvUInt16.bound({ min: 1, max: 2880 }),
                { writeAcl: AccessLevel.Administer }
            )
        },

        commands: {
            /**
             * Set user into the lock.
             *
             * Fields used for different use cases:
             *
             * Return status is a global status code or a cluster-specific status code from the Status Codes table and
             * shall be one of the following values:
             *
             *   • SUCCESS, if setting User was successful.
             *
             *   • FAILURE, if some unexpected internal error occurred setting User.
             *
             *   • OCCUPIED, if OperationType is Add and UserIndex points to an occupied slot.
             *
             *   • INVALID_COMMAND, if one or more fields violate constraints or are invalid or if OperationType is
             *     Modify and UserIndex points to an available slot.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.32
             */
            setUser: Command(
                0x1a,
                TlvSetUserRequest,
                0x1a,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Retrieve user.
             *
             * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_ COMMAND, etc.)
             * as needed otherwise the GetUserResponse Command shall be sent implying a status of SUCCESS.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.33
             */
            getUser: Command(0x1b, TlvGetUserRequest, 0x1c, TlvGetUserResponse, { invokeAcl: AccessLevel.Administer }),

            /**
             * Clears a user or all Users.
             *
             * For each user to clear, all associated credentials (e.g. PIN, RFID, fingerprint, etc.) shall be cleared
             * and the user entry values shall be reset to their default values (e.g. UserStatus shall be Available,
             * UserType shall be UnrestrictedUser) and all associated schedules shall be cleared.
             *
             * A LockUserChange event with the provided UserIndex shall be generated after successfully clearing users.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.35
             */
            clearUser: Command(
                0x1d,
                TlvClearUserRequest,
                0x1d,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Set a credential (e.g. PIN, RFID, Fingerprint, etc.) into the lock for a new user, existing user, or
             * ProgrammingUser.
             *
             * Fields used for different use cases:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.36
             */
            setCredential: Command(
                0x22,
                TlvSetCredentialRequest,
                0x23,
                TlvSetCredentialResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Retrieve the status of a particular credential (e.g. PIN, RFID, Fingerprint, etc.) by index.
             *
             * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.)
             * as needed otherwise the GetCredentialStatusResponse command shall be sent implying a status of SUCCESS.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.38
             */
            getCredentialStatus: Command(
                0x24,
                TlvGetCredentialStatusRequest,
                0x25,
                TlvGetCredentialStatusResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Clear one, one type, or all credentials except ProgrammingPIN credential.
             *
             * Fields used for different use cases:
             *
             * For each credential cleared whose user doesn’t have another valid credential, the corresponding user
             * record shall be reset back to default values and its UserStatus value shall be set to Available and
             * UserType value shall be set to UnrestrictedUser and all schedules shall be cleared. In this case a
             * LockUserChange event shall be generated for the user being cleared.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.40
             */
            clearCredential: Command(
                0x26,
                TlvClearCredentialRequest,
                0x26,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            )
        },

        events: {
            /**
             * The door lock server sends out a LockUserChange event when a lock user, schedule, or credential change
             * has occurred.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.5
             */
            lockUserChange: Event(0x4, Priority.Info, TlvLockUserChangeEvent)
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature PinCredential.
     */
    export const PinCredentialComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of PIN users supported.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.9
             */
            numberOfPinUsersSupported: FixedAttribute(0x12, TlvUInt16),

            /**
             * Indicates the maximum length in bytes of a PIN Code on this device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.14
             */
            maxPinCodeLength: FixedAttribute(0x17, TlvUInt8),

            /**
             * Indicates the minimum length in bytes of a PIN Code on this device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.15
             */
            minPinCodeLength: FixedAttribute(0x18, TlvUInt8)
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature RfidCredential.
     */
    export const RfidCredentialComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of RFID users supported.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.10
             */
            numberOfRfidUsersSupported: FixedAttribute(0x13, TlvUInt16),

            /**
             * Indicates the maximum length in bytes of a RFID Code on this device. The value depends on the RFID code
             * range specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID code, a
             * value of 20 (equals 10 Byte ISO 14443A UID) is recommended.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.16
             */
            maxRfidCodeLength: FixedAttribute(0x19, TlvUInt8),

            /**
             * Indicates the minimum length in bytes of a RFID Code on this device. The value depends on the RFID code
             * range specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID code, a
             * value of 8 (equals 4 Byte ISO 14443A UID) is recommended.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.17
             */
            minRfidCodeLength: FixedAttribute(0x1a, TlvUInt8)
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature WeekDayAccessSchedules.
     */
    export const WeekDayAccessSchedulesComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of configurable week day schedule supported per user.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.11
             */
            numberOfWeekDaySchedulesSupportedPerUser: FixedAttribute(0x14, TlvUInt8.bound({ max: 253 }))
        },

        commands: {
            /**
             * Set a weekly repeating schedule for a specified user.
             *
             * The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Week Day schedule is
             * set.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.12
             */
            setWeekDaySchedule: Command(
                0xb,
                TlvSetWeekDayScheduleRequest,
                0xb,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Retrieve the specific weekly schedule for the specific user.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.13
             */
            getWeekDaySchedule: Command(
                0xc,
                TlvGetWeekDayScheduleRequest,
                0xc,
                TlvGetWeekDayScheduleResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Clear the specific weekly schedule or all weekly schedules for the specific user.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.15
             */
            clearWeekDaySchedule: Command(
                0xd,
                TlvClearWeekDayScheduleRequest,
                0xd,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature YearDayAccessSchedules.
     */
    export const YearDayAccessSchedulesComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of configurable year day schedule supported per user.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.12
             */
            numberOfYearDaySchedulesSupportedPerUser: FixedAttribute(0x15, TlvUInt8.bound({ max: 253 }))
        },

        commands: {
            /**
             * Set a time-specific schedule ID for a specified user.
             *
             * The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Year Day schedule is
             * set.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.16
             */
            setYearDaySchedule: Command(
                0xe,
                TlvSetYearDayScheduleRequest,
                0xe,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Retrieve the specific year day schedule for the specific schedule and user indexes.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.17
             */
            getYearDaySchedule: Command(
                0xf,
                TlvGetYearDayScheduleRequest,
                0xf,
                TlvGetYearDayScheduleResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Clears the specific year day schedule or all year day schedules for the specific user.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.19
             */
            clearYearDaySchedule: Command(
                0x10,
                TlvClearYearDayScheduleRequest,
                0x10,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature HolidaySchedules.
     */
    export const HolidaySchedulesComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of holiday schedules supported for the entire door lock device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.13
             */
            numberOfHolidaySchedulesSupported: FixedAttribute(0x16, TlvUInt8.bound({ max: 253 }))
        },

        commands: {
            /**
             * Set the holiday Schedule by specifying local start time and local end time with respect to any Lock
             * Operating Mode.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.20
             */
            setHolidaySchedule: Command(
                0x11,
                TlvSetHolidayScheduleRequest,
                0x11,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Get the holiday schedule for the specified index.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.21
             */
            getHolidaySchedule: Command(
                0x12,
                TlvGetHolidayScheduleRequest,
                0x12,
                TlvGetHolidayScheduleResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Clears the holiday schedule or all holiday schedules.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.23
             */
            clearHolidaySchedule: Command(
                0x13,
                TlvClearHolidayScheduleRequest,
                0x13,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports features PinCredential or RfidCredential.
     */
    export const PinCredentialOrRfidCredentialComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of incorrect Pin codes or RFID presentment attempts a user is allowed to enter
             * before the lock will enter a lockout state. The value of this attribute is compared to all failing forms
             * of credential presentation, including Pin codes used in an Unlock Command when
             * RequirePINforRemoteOperation is set to true. Valid range is 1-255 incorrect attempts. The lockout state
             * will be for the duration of UserCodeTemporaryDisableTime. If the attribute accepts writes and an attempt
             * to write the value 0 is made, the device shall respond with CONSTRAINT_ERROR.
             *
             * The lock may reset the counter used to track incorrect credential presentations as required by internal
             * logic, environmental events, or other reasons. The lock shall reset the counter if a valid credential is
             * presented.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.32
             */
            wrongCodeEntryLimit: WritableAttribute(
                0x30,
                TlvUInt8.bound({ min: 1 }),
                { writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the number of seconds that the lock shuts down following wrong code entry. Valid range is 1-255
             * seconds. Device can shut down to lock user out for specified amount of time. (Makes it difficult to try
             * and guess a PIN for the device.) If the attribute accepts writes and an attempt to write the attribute to
             * 0 is made, the device shall respond with CONSTRAINT_ERROR.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.33
             */
            userCodeTemporaryDisableTime: WritableAttribute(
                0x31,
                TlvUInt8.bound({ min: 1 }),
                { writeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature PinCredential and it doesn't support feature
     * USR.
     */
    export const PinCredentialNotUserComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the door locks ability to send PINs over the air. If the attribute is True it is ok for the
             * door lock server to send PINs over the air. This attribute determines the behavior of the server’s TX
             * operation. If it is false, then it is not ok for the device to send PIN in any messages over the air.
             *
             * The PIN field within any door lock cluster message shall keep the first octet unchanged and masks the
             * actual code by replacing with 0xFF. For example (PIN "1234" ): If the attribute value is True, 0x04 0x31
             * 0x32 0x33 0x34 shall be used in the PIN field in any door lock cluster message payload. If the attribute
             * value is False, 0x04 0xFF 0xFF 0xFF 0xFF shall be used.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.34
             */
            sendPinOverTheAir: OptionalWritableAttribute(
                0x32,
                TlvBoolean,
                { default: true, writeAcl: AccessLevel.Administer }
            )
        },

        commands: {
            /**
             * Set a PIN Code into the lock.
             *
             * Return status is a global status code or a cluster-specific status code from the Status Codes table and
             * shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.4
             */
            setPinCode: Command(
                0x5,
                TlvSetPinCodeRequest,
                0x5,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Retrieve a PIN Code.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.5
             */
            getPinCode: Command(
                0x6,
                TlvGetPinCodeRequest,
                0x6,
                TlvGetPinCodeResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Clear a PIN code or all PIN codes.
             *
             * For each PIN Code cleared whose user doesn’t have a RFID Code or other credential type, then
             * corresponding user record’s UserStatus value shall be set to Available, and UserType value shall be set
             * to UnrestrictedUser and all schedules shall be cleared.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.7
             */
            clearPinCode: Command(
                0x7,
                TlvClearPinCodeRequest,
                0x7,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Clear out all PINs on the lock.
             *
             * > [!NOTE]
             *
             * > On the server, the clear all PIN codes command SHOULD have the same effect as the ClearPINCode command
             *   with respect to the setting of user status, user type and schedules.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.8
             */
            clearAllPinCodes: Command(
                0x8,
                TlvNoArguments,
                0x8,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports features CredentialOverTheAirAccess and PinCredential.
     */
    export const CredentialOverTheAirAccessAndPinCredentialComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates if the door lock requires an optional PIN. If this attribute is set to True, the door lock
             * server requires that an optional PINs be included in the payload of remote lock operation events like
             * Lock, Unlock, Unlock with Timeout and Toggle in order to function.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.35
             */
            requirePinForRemoteOperation: WritableAttribute(0x33, TlvBoolean, { writeAcl: AccessLevel.Administer })
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature AliroProvisioning.
     */
    export const AliroProvisioningComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the verification key component of the Reader’s key pair as defined in [Aliro]. The value, if
             * not null, shall be an uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1.
             *
             * Null if no Reader key pair has been configured on the lock. See Section 5.2.10.42, “SetAliroReaderConfig
             * Command”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.37
             */
            aliroReaderVerificationKey: Attribute(
                0x80,
                TlvNullable(TlvByteString.bound({ length: 65 })),
                { readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the reader_group_identifier as defined in [Aliro].
             *
             * Null if no reader_group_identifier has been configured on the lock. See Section 5.2.10.42,
             * “SetAliroReaderConfig Command”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.38
             */
            aliroReaderGroupIdentifier: Attribute(
                0x81,
                TlvNullable(TlvByteString.bound({ length: 16 })),
                { readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the reader_group_sub_identifier as defined in [Aliro].
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.39
             */
            aliroReaderGroupSubIdentifier: FixedAttribute(
                0x82,
                TlvByteString.bound({ length: 16 }),
                { readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the list of protocol versions supported for expedited transactions as defined in [Aliro].
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.40
             */
            aliroExpeditedTransactionSupportedProtocolVersions: FixedAttribute(
                0x83,
                TlvArray(TlvByteString, { maxLength: 16 }),
                { default: [], readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the maximum number of AliroCredentialIssuerKey credentials that can be stored on the lock.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.44
             */
            numberOfAliroCredentialIssuerKeysSupported: FixedAttribute(0x87, TlvUInt16),

            /**
             * Indicates the maximum number of endpoint key credentials that can be stored on the lock. This limit
             * applies to the sum of the number of AliroEvictableEndpointKey credentials and the number of
             * AliroNonEvictableEndpointKey credentials.
             *
             * > [!NOTE]
             *
             * > The credential indices used for these two credential types are independent of each other, similar to
             *   all other credential types. As long as NumberOfAliroEndpointKeysSupported is at least 2 a client could
             *   add a credential of type AliroEvictableEndpointKey at any index from 1 to
             *   NumberOfAliroEndpointKeysSupported and also add a credential of type AliroNonEvictableEndpointKey at
             *   the same index, and both credentials would exist on the server.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.45
             */
            numberOfAliroEndpointKeysSupported: FixedAttribute(0x88, TlvUInt16)
        },

        commands: {
            /**
             * This command allows communicating an Aliro Reader configuration, as defined in [Aliro], to the lock.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.42
             */
            setAliroReaderConfig: Command(
                0x28,
                TlvSetAliroReaderConfigRequest,
                0x28,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * This command allows clearing an existing Aliro Reader configuration for the lock. Administrators shall
             * NOT clear an Aliro Reader configuration without explicit user permission.
             *
             * > [!NOTE]
             *
             * > Using this command will revoke the ability of all existing Aliro user devices that have the old
             *   verification key to interact with the lock. This effect is not restricted to a single fabric or
             *   otherwise scoped in any way.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.43
             */
            clearAliroReaderConfig: Command(
                0x29,
                TlvNoArguments,
                0x29,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature AliroBleuwb.
     */
    export const AliroBleuwbComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the Group Resolving Key as defined in [Aliro].
             *
             * Null if no group resolving key has been configured on the lock. See Section 5.2.10.42,
             * “SetAliroReaderConfig Command”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.41
             */
            aliroGroupResolvingKey: Attribute(
                0x84,
                TlvNullable(TlvByteString.bound({ length: 16 })),
                { readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the list of protocol versions supported for the Bluetooth LE + UWB Access Control Flow as
             * defined in [Aliro].
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.42
             */
            aliroSupportedBleuwbProtocolVersions: FixedAttribute(
                0x85,
                TlvArray(TlvByteString, { maxLength: 16 }),
                { default: [], readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            ),

            /**
             * Indicates the version of the Bluetooth LE advertisement as defined in [Aliro].
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.43
             */
            aliroBleAdvertisingVersion: FixedAttribute(
                0x86,
                TlvUInt8,
                { readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports features PinCredential, RfidCredential and
     * FingerCredentials and it doesn't support feature USR.
     */
    export const PinCredentialAndRfidCredentialAndFingerCredentialsNotUserComponent = MutableCluster.Component({
        commands: {
            /**
             * Set the status of a user ID.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.9
             */
            setUserStatus: OptionalCommand(
                0x9,
                TlvSetUserStatusRequest,
                0x9,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Get the status of a user.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.10
             */
            getUserStatus: OptionalCommand(
                0xa,
                TlvGetUserStatusRequest,
                0xa,
                TlvGetUserStatusResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Set the user type for a specified user.
             *
             * For user type value please refer to User Type Value.
             *
             * Return status shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.24
             */
            setUserType: OptionalCommand(
                0x14,
                TlvSetUserTypeRequest,
                0x14,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Retrieve the user type for a specific user.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.25
             */
            getUserType: OptionalCommand(
                0x15,
                TlvGetUserTypeRequest,
                0x15,
                TlvGetUserTypeResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if doesn't support feature USR.
     */
    export const NotUserComponent = MutableCluster.Component({});

    /**
     * A DoorLockCluster supports these elements if it supports feature RfidCredential and it doesn't support feature
     * USR.
     */
    export const RfidCredentialNotUserComponent = MutableCluster.Component({
        commands: {
            /**
             * Set an ID for RFID access into the lock.
             *
             * Return status is a global status code or a cluster-specific status code from the Status Codes table and
             * shall be one of the following values:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.27
             */
            setRfidCode: Command(
                0x16,
                TlvSetRfidCodeRequest,
                0x16,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Retrieve an RFID code.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.28
             */
            getRfidCode: Command(
                0x17,
                TlvGetRfidCodeRequest,
                0x17,
                TlvGetRfidCodeResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * Clear an RFID code or all RFID codes.
             *
             * For each RFID Code cleared whose user doesn’t have a PIN Code or other credential type, then the
             * corresponding user record’s UserStatus value shall be set to Available, and UserType value shall be set
             * to UnrestrictedUser and all schedules shall be cleared.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.30
             */
            clearRfidCode: Command(
                0x18,
                TlvClearRfidCodeRequest,
                0x18,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * Clear out all RFIDs on the lock. If you clear all RFID codes and this user didn’t have a PIN code, the
             * user status has to be set to "0 Available", the user type has to be set to the default value, and all
             * schedules which are supported have to be set to the default values.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.31
             */
            clearAllRfidCodes: Command(
                0x19,
                TlvNoArguments,
                0x19,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            )
        }
    });

    /**
     * A DoorLockCluster supports these elements if it supports feature Unbolting.
     */
    export const UnboltingComponent = MutableCluster.Component({
        commands: {
            /**
             * This command causes the lock device to unlock the door without pulling the latch. This command includes
             * an optional code for the lock. The door lock may require a code depending on the value of the
             * RequirePINForRemoteOperation attribute.
             *
             * > [!NOTE]
             *
             * > If the attribute AutoRelockTime is supported, the lock will transition to the locked state when the
             *   auto relock time has expired.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.41
             */
            unboltDoor: Command(0x27, TlvUnboltDoorRequest, 0x27, TlvNoResponse, { timed: true })
        }
    });

    /**
     * These elements and properties are present in all DoorLock clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x101,
        name: "DoorLock",
        revision: 9,

        features: {
            /**
             * If the User Feature is also supported then any PIN Code stored in the lock shall be associated with a
             * User.
             *
             * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus
             * and Schedules are all associated with a User index and not directly with a PIN index. A User index may
             * have several credentials associated with it.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.1
             */
            pinCredential: BitFlag(0),

            /**
             * If the User Feature is also supported then any RFID credential stored in the lock shall be associated
             * with a User.
             *
             * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus
             * and Schedules are all associated with a User index and not directly with a RFID index. A User Index may
             * have several credentials associated with it.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.2
             */
            rfidCredential: BitFlag(1),

            /**
             * Currently the cluster only defines the metadata format for notifications when a fingerprint/ finger vein
             * credential is used to access the lock and doesn’t describe how to create fingerprint/finger vein
             * credentials. If the Users feature is also supported then the User that a fingerprint/finger vein is
             * associated with can also have its UserType, UserStatus and Schedule modified.
             *
             * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus
             * and Schedules are all associated with a User index and not directly with a Finger index. A User Index may
             * have several credentials associated with it.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.3
             */
            fingerCredentials: BitFlag(2),

            /**
             * If the User feature is supported then Week Day Schedules are applied to a User and not a credential.
             *
             * Week Day Schedules are used to restrict access to a specified time window on certain days of the week.
             * The schedule is repeated each week.
             *
             * The lock may automatically adjust the UserType when a schedule is created or cleared.
             *
             * Support for WeekDayAccessSchedules requires that the lock has the capability of keeping track of local
             * time.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.4
             */
            weekDayAccessSchedules: BitFlag(4),

            /**
             * If this feature is supported this indicates that the lock has the ability to determine the position of
             * the door which is separate from the state of the lock.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.5
             */
            doorPositionSensor: BitFlag(5),

            /**
             * Currently the cluster only defines the metadata format for notifications when a face recognition, iris,
             * or retina credential is used to access the lock and doesn’t describe how to create face recognition,
             * iris, or retina credentials. If the Users feature is also supported then the User that a face
             * recognition, iris, or retina credential is associated with can also have its UserType, UserStatus and
             * Schedule modified.
             *
             * A lock may support multiple credential types so if the User feature is supported the UserType, UserStatus
             * and Schedules are all associated with a User and not directly with a credential.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.6
             */
            faceCredentials: BitFlag(6),

            /**
             * If this feature is supported then the lock supports the ability to verify a credential provided in a
             * lock/unlock command. Currently the cluster only supports providing the PIN credential to the lock/unlock
             * commands. If this feature is supported then the PIN Credential feature shall also be supported.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.7
             */
            credentialOverTheAirAccess: BitFlag(7),

            /**
             * If the User Feature is supported then a lock employs a User database. A User within the User database is
             * used to associate credentials and schedules to single user record within the lock. This also means the
             * UserType and UserStatus fields are associated with a User and not a credential.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.8
             */
            user: BitFlag(8),

            /**
             * If the User feature is supported then Year Day Schedules are applied to a User and not a credential. Year
             * Day Schedules are used to restrict access to a specified date and time window.
             *
             * The lock may automatically adjust the UserType when a schedule is created or cleared.
             *
             * Support for YearDayAccessSchedules requires that the lock has the capability of keeping track of local
             * time.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.9
             */
            yearDayAccessSchedules: BitFlag(10),

            /**
             * This feature is used to setup Holiday Schedule in the lock device. A Holiday Schedule sets a start and
             * stop end date/time for the lock to use the specified operating mode set by the Holiday Schedule.
             *
             * Support for HolidaySchedules requires that the lock has the capability of keeping track of local time.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.10
             */
            holidaySchedules: BitFlag(11),

            /**
             * Locks that support this feature differentiate between unbolting and unlocking. The Unbolt Door command
             * retracts the bolt without pulling the latch. The Unlock Door command fully unlocks the door by retracting
             * the bolt and briefly pulling the latch. While the latch is pulled, the lock state changes to Unlatched.
             * Locks without unbolting support don’t differentiate between unbolting and unlocking and perform the same
             * operation for both commands.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.11
             */
            unbolting: BitFlag(12),

            /**
             * Locks that support this feature implement the Aliro specification as defined in [Aliro] and support
             * Matter as a method for provisioning Aliro credentials.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.12
             */
            aliroProvisioning: BitFlag(13),

            /**
             * Locks that support this feature implement the Bluetooth LE + UWB Access Control Flow as defined in
             * [Aliro].
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.4.13
             */
            aliroBleuwb: BitFlag(14)
        },

        attributes: {
            /**
             * This attribute may be NULL if the lock hardware does not currently know the status of the locking
             * mechanism. For example, a lock may not know the LockState status after a power cycle until the first lock
             * actuation is completed.
             *
             * The Not Fully Locked value is used by a lock to indicate that the state of the lock is somewhere between
             * Locked and Unlocked so it is only partially secured. For example, a deadbolt could be partially extended
             * and not in a dead latched state.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.1
             */
            lockState: Attribute(0x0, TlvNullable(TlvEnum<LockState>())),

            /**
             * Indicates the type of door lock as defined in LockTypeEnum.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.2
             */
            lockType: Attribute(0x1, TlvEnum<LockType>()),

            /**
             * Indicates if the lock is currently able to (Enabled) or not able to (Disabled) process remote Lock,
             * Unlock, or Unlock with Timeout commands.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.3
             */
            actuatorEnabled: Attribute(0x2, TlvBoolean),

            /**
             * Indicates the language for the on-screen or audible user interface using a 2- byte language code from
             * ISO-639-1.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.20
             */
            language: OptionalWritableAttribute(
                0x21,
                TlvString.bound({ maxLength: 3 }),
                { writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the settings for the LED support, as defined by LEDSettingEnum.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.21
             */
            ledSettings: OptionalWritableAttribute(
                0x22,
                TlvEnum<LedSetting>(),
                { default: LedSetting.NoLedSignal, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the number of seconds to wait after unlocking a lock before it automatically locks again.
             * 0=disabled. If set, unlock operations from any source will be timed. For one time unlock with timeout use
             * the specific command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.22
             */
            autoRelockTime: OptionalWritableAttribute(0x23, TlvUInt32, { writeAcl: AccessLevel.Manage }),

            /**
             * Indicates the sound volume on a door lock as defined by SoundVolumeEnum.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.23
             */
            soundVolume: OptionalWritableAttribute(
                0x24,
                TlvEnum<SoundVolume>(),
                { default: SoundVolume.Silent, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the current operating mode of the lock as defined in OperatingModeEnum.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.24
             */
            operatingMode: WritableAttribute(0x25, TlvEnum<OperatingMode>(), { writeAcl: AccessLevel.Manage }),

            /**
             * This attribute shall contain a bitmap with all operating bits of the OperatingMode attribute supported by
             * the lock.
             *
             * A bit position set to zero shall indicate that the mode is supported. A bit position set to one shall
             * indicate that the mode is not supported.
             *
             * Any bit that is not yet defined in OperatingModesBitmap shall be set to 1.
             *
             * The values considered valid to read or write in the OperatingMode attribute shall be the enum values from
             * DoorLockOperatingModeEnum whose equivalent same-named bit from OperatingModesBitmap is set to zero in
             * this attribute. WARNING: This is the opposite of most other semantically similar bitmaps in this
             * specification.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.25
             */
            supportedOperatingModes: FixedAttribute(0x26, TlvBitmap(TlvUInt16, OperatingModes)),

            /**
             * Indicates the default configurations as they are physically set on the device (example: hardware dip
             * switch setting, etc…) and represents the default setting for some of the attributes within this cluster
             * (for example: LED, Auto Lock, Sound Volume, and Operating Mode attributes).
             *
             * This is a read-only attribute and is intended to allow clients to determine what changes may need to be
             * made without having to query all the included attributes. It may be beneficial for the clients to know
             * what the device’s original settings were in the event that the device needs to be restored to factory
             * default settings.
             *
             * If the Client device would like to query and modify the door lock server’s operating settings, it SHOULD
             * send read and write attribute requests to the specific attributes.
             *
             * For example, the Sound Volume attribute default value is Silent Mode. However, it is possible that the
             * current Sound Volume is High Volume. Therefore, if the client wants to query/modify the current Sound
             * Volume setting on the server, the client SHOULD read/write to the Sound Volume attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.26
             */
            defaultConfigurationRegister: OptionalAttribute(0x27, TlvBitmap(TlvUInt16, ConfigurationRegister)),

            /**
             * This attribute shall enable/disable local programming on the door lock of certain features (see
             * LocalProgrammingFeatures attribute). If this value is set to TRUE then local programming is enabled on
             * the door lock for all features. If it is set to FALSE then local programming is disabled on the door lock
             * for those features whose bit is set to 0 in the LocalProgrammingFeatures attribute. Local programming
             * shall be enabled by default.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.27
             */
            enableLocalProgramming: OptionalWritableAttribute(
                0x28,
                TlvBoolean,
                { default: true, writeAcl: AccessLevel.Administer }
            ),

            /**
             * This attribute shall enable/disable the ability to lock the door lock with a single touch on the door
             * lock.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.28
             */
            enableOneTouchLocking: OptionalWritableAttribute(
                0x29,
                TlvBoolean,
                { default: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall enable/disable an inside LED that allows the user to see at a glance if the door is
             * locked.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.29
             */
            enableInsideStatusLed: OptionalWritableAttribute(
                0x2a,
                TlvBoolean,
                { default: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall enable/disable a button inside the door that is used to put the lock into privacy
             * mode. When the lock is in privacy mode it cannot be manipulated from the outside.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.30
             */
            enablePrivacyModeButton: OptionalWritableAttribute(
                0x2b,
                TlvBoolean,
                { default: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the local programming features that will be disabled when EnableLocalProgramming attribute is
             * set to False. If a door lock doesn’t support disabling one aspect of local programming it shall return
             * CONSTRAINT_ERROR during a write operation of this attribute. If the EnableLocalProgramming attribute is
             * set to True then all local programming features shall be enabled regardless of the bits set to 0 in this
             * attribute.
             *
             * The features that can be disabled from local programming are defined in LocalProgrammingFeaturesBitmap.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.9.31
             */
            localProgrammingFeatures: OptionalWritableAttribute(
                0x2c,
                TlvBitmap(TlvUInt8, LocalProgrammingFeatures),
                { writeAcl: AccessLevel.Administer }
            )
        },

        commands: {
            /**
             * This command causes the lock device to lock the door. This command includes an optional code for the
             * lock. The door lock may require a PIN depending on the value of the RequirePINForRemoteOperation
             * attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.1
             */
            lockDoor: Command(0x0, TlvLockDoorRequest, 0x0, TlvNoResponse, { timed: true }),

            /**
             * This command causes the lock device to unlock the door. This command includes an optional code for the
             * lock. The door lock may require a code depending on the value of the RequirePINForRemoteOperation
             * attribute.
             *
             * > [!NOTE]
             *
             * > If the attribute AutoRelockTime is supported the lock will transition to the locked state when the auto
             *   relock time has expired.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.2
             */
            unlockDoor: Command(0x1, TlvUnlockDoorRequest, 0x1, TlvNoResponse, { timed: true }),

            /**
             * This command causes the lock device to unlock the door with a timeout parameter. After the time in
             * seconds specified in the timeout field, the lock device will relock itself automatically. This timeout
             * parameter is only temporary for this message transition and overrides the default relock time as
             * specified in the AutoRelockTime attribute. If the door lock device is not capable of or does not want to
             * support temporary Relock Timeout, it SHOULD NOT support this optional command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.10.3
             */
            unlockWithTimeout: OptionalCommand(0x3, TlvUnlockWithTimeoutRequest, 0x3, TlvNoResponse, { timed: true })
        },

        events: {
            /**
             * The door lock server provides several alarms which can be sent when there is a critical state on the door
             * lock. The alarms available for the door lock server are listed in AlarmCodeEnum.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.1
             */
            doorLockAlarm: Event(0x0, Priority.Critical, TlvDoorLockAlarmEvent),

            /**
             * The door lock server sends out a LockOperation event when the event is triggered by the various lock
             * operation sources.
             *
             *   • If the door lock server supports the Unbolt Door command, it shall generate a LockOperation event
             *     with LockOperationType set to Unlock after an Unbolt Door command succeeds.
             *
             *   • If the door lock server supports the Unbolting feature and an Unlock Door command is performed, it
             *     shall generate a LockOperation event with LockOperationType set to Unlatch when the unlatched state
             *     is reached and a LockOperation event with LockOperationType set to Unlock when the lock successfully
             *     completes the unlock → hold latch → release latch and return to unlock state operation.
             *
             *   • If the command fails during holding or releasing the latch but after passing the unlocked state, the
             *     door lock server shall generate a LockOperationError event with LockOperationType set to Unlatch and
             *     a LockOperation event with LockOperationType set to Unlock.
             *
             *     ◦ If it fails before reaching the unlocked state, the door lock server shall generate only a
             *       LockOperationError event with LockOperationType set to Unlock.
             *
             *   • Upon manual actuation, a door lock server that supports the Unbolting feature:
             *
             *     ◦ shall generate a LockOperation event of LockOperationType Unlatch when it is actuated from the
             *       outside.
             *
             *     ◦ may generate a LockOperation event of LockOperationType Unlatch when it is actuated
             *
             * from the inside.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.3
             */
            lockOperation: Event(0x2, Priority.Critical, TlvLockOperationEvent),

            /**
             * The door lock server sends out a LockOperationError event when a lock operation fails for various
             * reasons.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.2.11.4
             */
            lockOperationError: Event(0x3, Priority.Critical, TlvLockOperationErrorEvent)
        },

        /**
         * This metadata controls which DoorLockCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { doorPositionSensor: true }, component: DoorPositionSensorComponent },
            { flags: { user: true }, component: UserComponent },
            { flags: { pinCredential: true }, component: PinCredentialComponent },
            { flags: { rfidCredential: true }, component: RfidCredentialComponent },
            { flags: { weekDayAccessSchedules: true }, component: WeekDayAccessSchedulesComponent },
            { flags: { yearDayAccessSchedules: true }, component: YearDayAccessSchedulesComponent },
            { flags: { holidaySchedules: true }, component: HolidaySchedulesComponent },
            { flags: { pinCredential: true }, component: PinCredentialOrRfidCredentialComponent },
            { flags: { rfidCredential: true }, component: PinCredentialOrRfidCredentialComponent },
            { flags: { pinCredential: true, user: false }, component: PinCredentialNotUserComponent },
            {
                flags: { credentialOverTheAirAccess: true, pinCredential: true },
                component: CredentialOverTheAirAccessAndPinCredentialComponent
            },
            { flags: { aliroProvisioning: true }, component: AliroProvisioningComponent },
            { flags: { aliroBleuwb: true }, component: AliroBleuwbComponent },
            {
                flags: { pinCredential: true, rfidCredential: true, fingerCredentials: true, user: false },
                component: PinCredentialAndRfidCredentialAndFingerCredentialsNotUserComponent
            },
            { flags: { user: false }, component: NotUserComponent },
            { flags: { rfidCredential: true, user: false }, component: RfidCredentialNotUserComponent },
            { flags: { unbolting: true }, component: UnboltingComponent },
            { flags: { aliroProvisioning: true, user: false }, component: false },

            {
                flags: {
                    aliroProvisioning: false,
                    user: true,
                    pinCredential: true,
                    rfidCredential: true,
                    fingerCredentials: true,
                    faceCredentials: true
                },

                component: false
            },

            { flags: { aliroBleuwb: true, aliroProvisioning: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({ ...Base, base: ClusterType(Base) }, NotUserComponent);

    /**
     * The door lock cluster provides an interface to a generic way to secure a door. The physical object that provides
     * the locking functionality is abstracted from the cluster. The cluster has a small list of mandatory attributes
     * and functions and a list of optional features.
     *
     * DoorLockCluster supports optional features that you can enable with the DoorLockCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const DPS = { doorPositionSensor: true };
    const USR = { user: true };
    const PIN = { pinCredential: true };
    const RID = { rfidCredential: true };
    const WDSCH = { weekDayAccessSchedules: true };
    const YDSCH = { yearDayAccessSchedules: true };
    const HDSCH = { holidaySchedules: true };
    const PIN_NOT_USR = { pinCredential: true, user: false };
    const COTA_PIN = { credentialOverTheAirAccess: true, pinCredential: true };
    const ALIRO = { aliroProvisioning: true };
    const ALBU = { aliroBleuwb: true };
    const PIN_RID_FGP_NOT_USR = { pinCredential: true, rfidCredential: true, fingerCredentials: true, user: false };
    const RID_NOT_USR = { rfidCredential: true, user: false };
    const UBOLT = { unbolting: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            doorState: MutableCluster.AsConditional(
                DoorPositionSensorComponent.attributes.doorState,
                { mandatoryIf: [DPS] }
            ),
            doorOpenEvents: MutableCluster.AsConditional(
                DoorPositionSensorComponent.attributes.doorOpenEvents,
                { optionalIf: [DPS] }
            ),
            doorClosedEvents: MutableCluster.AsConditional(
                DoorPositionSensorComponent.attributes.doorClosedEvents,
                { optionalIf: [DPS] }
            ),
            openPeriod: MutableCluster.AsConditional(
                DoorPositionSensorComponent.attributes.openPeriod,
                { optionalIf: [DPS] }
            ),
            numberOfTotalUsersSupported: MutableCluster.AsConditional(
                UserComponent.attributes.numberOfTotalUsersSupported,
                { mandatoryIf: [USR] }
            ),
            numberOfPinUsersSupported: MutableCluster.AsConditional(
                PinCredentialComponent.attributes.numberOfPinUsersSupported,
                { mandatoryIf: [PIN] }
            ),
            numberOfRfidUsersSupported: MutableCluster.AsConditional(
                RfidCredentialComponent.attributes.numberOfRfidUsersSupported,
                { mandatoryIf: [RID] }
            ),
            numberOfWeekDaySchedulesSupportedPerUser: MutableCluster.AsConditional(
                WeekDayAccessSchedulesComponent.attributes.numberOfWeekDaySchedulesSupportedPerUser,
                { mandatoryIf: [WDSCH] }
            ),
            numberOfYearDaySchedulesSupportedPerUser: MutableCluster.AsConditional(
                YearDayAccessSchedulesComponent.attributes.numberOfYearDaySchedulesSupportedPerUser,
                { mandatoryIf: [YDSCH] }
            ),
            numberOfHolidaySchedulesSupported: MutableCluster.AsConditional(
                HolidaySchedulesComponent.attributes.numberOfHolidaySchedulesSupported,
                { mandatoryIf: [HDSCH] }
            ),
            maxPinCodeLength: MutableCluster.AsConditional(
                PinCredentialComponent.attributes.maxPinCodeLength,
                { mandatoryIf: [PIN] }
            ),
            minPinCodeLength: MutableCluster.AsConditional(
                PinCredentialComponent.attributes.minPinCodeLength,
                { mandatoryIf: [PIN] }
            ),
            maxRfidCodeLength: MutableCluster.AsConditional(
                RfidCredentialComponent.attributes.maxRfidCodeLength,
                { mandatoryIf: [RID] }
            ),
            minRfidCodeLength: MutableCluster.AsConditional(
                RfidCredentialComponent.attributes.minRfidCodeLength,
                { mandatoryIf: [RID] }
            ),
            credentialRulesSupport: MutableCluster.AsConditional(
                UserComponent.attributes.credentialRulesSupport,
                { mandatoryIf: [USR] }
            ),
            numberOfCredentialsSupportedPerUser: MutableCluster.AsConditional(
                UserComponent.attributes.numberOfCredentialsSupportedPerUser,
                { mandatoryIf: [USR] }
            ),
            wrongCodeEntryLimit: MutableCluster.AsConditional(
                PinCredentialOrRfidCredentialComponent.attributes.wrongCodeEntryLimit,
                { mandatoryIf: [PIN, RID] }
            ),
            userCodeTemporaryDisableTime: MutableCluster.AsConditional(
                PinCredentialOrRfidCredentialComponent.attributes.userCodeTemporaryDisableTime,
                { mandatoryIf: [PIN, RID] }
            ),
            sendPinOverTheAir: MutableCluster.AsConditional(
                PinCredentialNotUserComponent.attributes.sendPinOverTheAir,
                { optionalIf: [PIN_NOT_USR] }
            ),
            requirePinForRemoteOperation: MutableCluster.AsConditional(
                CredentialOverTheAirAccessAndPinCredentialComponent.attributes.requirePinForRemoteOperation,
                { mandatoryIf: [COTA_PIN] }
            ),
            expiringUserTimeout: MutableCluster.AsConditional(
                UserComponent.attributes.expiringUserTimeout,
                { optionalIf: [USR] }
            ),
            aliroReaderVerificationKey: MutableCluster.AsConditional(
                AliroProvisioningComponent.attributes.aliroReaderVerificationKey,
                { mandatoryIf: [ALIRO] }
            ),
            aliroReaderGroupIdentifier: MutableCluster.AsConditional(
                AliroProvisioningComponent.attributes.aliroReaderGroupIdentifier,
                { mandatoryIf: [ALIRO] }
            ),
            aliroReaderGroupSubIdentifier: MutableCluster.AsConditional(
                AliroProvisioningComponent.attributes.aliroReaderGroupSubIdentifier,
                { mandatoryIf: [ALIRO] }
            ),
            aliroExpeditedTransactionSupportedProtocolVersions: MutableCluster.AsConditional(
                AliroProvisioningComponent.attributes.aliroExpeditedTransactionSupportedProtocolVersions,
                { mandatoryIf: [ALIRO] }
            ),
            aliroGroupResolvingKey: MutableCluster.AsConditional(
                AliroBleuwbComponent.attributes.aliroGroupResolvingKey,
                { mandatoryIf: [ALBU] }
            ),
            aliroSupportedBleuwbProtocolVersions: MutableCluster.AsConditional(
                AliroBleuwbComponent.attributes.aliroSupportedBleuwbProtocolVersions,
                { mandatoryIf: [ALBU] }
            ),
            aliroBleAdvertisingVersion: MutableCluster.AsConditional(
                AliroBleuwbComponent.attributes.aliroBleAdvertisingVersion,
                { mandatoryIf: [ALBU] }
            ),
            numberOfAliroCredentialIssuerKeysSupported: MutableCluster.AsConditional(
                AliroProvisioningComponent.attributes.numberOfAliroCredentialIssuerKeysSupported,
                { mandatoryIf: [ALIRO] }
            ),
            numberOfAliroEndpointKeysSupported: MutableCluster.AsConditional(
                AliroProvisioningComponent.attributes.numberOfAliroEndpointKeysSupported,
                { mandatoryIf: [ALIRO] }
            )
        },

        commands: {
            ...Cluster.commands,
            setPinCode: MutableCluster.AsConditional(
                PinCredentialNotUserComponent.commands.setPinCode,
                { mandatoryIf: [PIN_NOT_USR] }
            ),
            getPinCode: MutableCluster.AsConditional(
                PinCredentialNotUserComponent.commands.getPinCode,
                { mandatoryIf: [PIN_NOT_USR] }
            ),
            clearPinCode: MutableCluster.AsConditional(
                PinCredentialNotUserComponent.commands.clearPinCode,
                { mandatoryIf: [PIN_NOT_USR] }
            ),
            clearAllPinCodes: MutableCluster.AsConditional(
                PinCredentialNotUserComponent.commands.clearAllPinCodes,
                { mandatoryIf: [PIN_NOT_USR] }
            ),
            setUserStatus: MutableCluster.AsConditional(
                PinCredentialAndRfidCredentialAndFingerCredentialsNotUserComponent.commands.setUserStatus,
                { optionalIf: [PIN_RID_FGP_NOT_USR] }
            ),
            getUserStatus: MutableCluster.AsConditional(
                PinCredentialAndRfidCredentialAndFingerCredentialsNotUserComponent.commands.getUserStatus,
                { optionalIf: [PIN_RID_FGP_NOT_USR] }
            ),
            setWeekDaySchedule: MutableCluster.AsConditional(
                WeekDayAccessSchedulesComponent.commands.setWeekDaySchedule,
                { mandatoryIf: [WDSCH] }
            ),
            getWeekDaySchedule: MutableCluster.AsConditional(
                WeekDayAccessSchedulesComponent.commands.getWeekDaySchedule,
                { mandatoryIf: [WDSCH] }
            ),
            clearWeekDaySchedule: MutableCluster.AsConditional(
                WeekDayAccessSchedulesComponent.commands.clearWeekDaySchedule,
                { mandatoryIf: [WDSCH] }
            ),
            setYearDaySchedule: MutableCluster.AsConditional(
                YearDayAccessSchedulesComponent.commands.setYearDaySchedule,
                { mandatoryIf: [YDSCH] }
            ),
            getYearDaySchedule: MutableCluster.AsConditional(
                YearDayAccessSchedulesComponent.commands.getYearDaySchedule,
                { mandatoryIf: [YDSCH] }
            ),
            clearYearDaySchedule: MutableCluster.AsConditional(
                YearDayAccessSchedulesComponent.commands.clearYearDaySchedule,
                { mandatoryIf: [YDSCH] }
            ),
            setHolidaySchedule: MutableCluster.AsConditional(
                HolidaySchedulesComponent.commands.setHolidaySchedule,
                { mandatoryIf: [HDSCH] }
            ),
            getHolidaySchedule: MutableCluster.AsConditional(
                HolidaySchedulesComponent.commands.getHolidaySchedule,
                { mandatoryIf: [HDSCH] }
            ),
            clearHolidaySchedule: MutableCluster.AsConditional(
                HolidaySchedulesComponent.commands.clearHolidaySchedule,
                { mandatoryIf: [HDSCH] }
            ),
            setUserType: MutableCluster.AsConditional(
                PinCredentialAndRfidCredentialAndFingerCredentialsNotUserComponent.commands.setUserType,
                { optionalIf: [PIN_RID_FGP_NOT_USR] }
            ),
            getUserType: MutableCluster.AsConditional(
                PinCredentialAndRfidCredentialAndFingerCredentialsNotUserComponent.commands.getUserType,
                { optionalIf: [PIN_RID_FGP_NOT_USR] }
            ),
            setRfidCode: MutableCluster.AsConditional(
                RfidCredentialNotUserComponent.commands.setRfidCode,
                { mandatoryIf: [RID_NOT_USR] }
            ),
            getRfidCode: MutableCluster.AsConditional(
                RfidCredentialNotUserComponent.commands.getRfidCode,
                { mandatoryIf: [RID_NOT_USR] }
            ),
            clearRfidCode: MutableCluster.AsConditional(
                RfidCredentialNotUserComponent.commands.clearRfidCode,
                { mandatoryIf: [RID_NOT_USR] }
            ),
            clearAllRfidCodes: MutableCluster.AsConditional(
                RfidCredentialNotUserComponent.commands.clearAllRfidCodes,
                { mandatoryIf: [RID_NOT_USR] }
            ),
            setUser: MutableCluster.AsConditional(UserComponent.commands.setUser, { mandatoryIf: [USR] }),
            getUser: MutableCluster.AsConditional(UserComponent.commands.getUser, { mandatoryIf: [USR] }),
            clearUser: MutableCluster.AsConditional(UserComponent.commands.clearUser, { mandatoryIf: [USR] }),
            setCredential: MutableCluster.AsConditional(UserComponent.commands.setCredential, { mandatoryIf: [USR] }),
            getCredentialStatus: MutableCluster.AsConditional(
                UserComponent.commands.getCredentialStatus,
                { mandatoryIf: [USR] }
            ),
            clearCredential: MutableCluster.AsConditional(
                UserComponent.commands.clearCredential,
                { mandatoryIf: [USR] }
            ),
            unboltDoor: MutableCluster.AsConditional(UnboltingComponent.commands.unboltDoor, { mandatoryIf: [UBOLT] }),
            setAliroReaderConfig: MutableCluster.AsConditional(
                AliroProvisioningComponent.commands.setAliroReaderConfig,
                { mandatoryIf: [ALIRO] }
            ),
            clearAliroReaderConfig: MutableCluster.AsConditional(
                AliroProvisioningComponent.commands.clearAliroReaderConfig,
                { mandatoryIf: [ALIRO] }
            )
        },

        events: {
            ...Cluster.events,
            doorStateChange: MutableCluster.AsConditional(
                DoorPositionSensorComponent.events.doorStateChange,
                { mandatoryIf: [DPS] }
            ),
            lockUserChange: MutableCluster.AsConditional(UserComponent.events.lockUserChange, { mandatoryIf: [USR] })
        }
    });

    /**
     * This cluster supports all DoorLock features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type DoorLockCluster = DoorLock.Cluster;
export const DoorLockCluster = DoorLock.Cluster;
ClusterRegistry.register(DoorLock.Complete);

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { Status } from "../globals/Status.js";
import type { NodeId } from "../datatype/NodeId.js";
import type { StatusResponseError } from "../common/StatusResponseError.js";

/**
 * Definitions for the DoorLock cluster.
 *
 * The door lock cluster provides an interface to a generic way to secure a door. The physical object that provides the
 * locking functionality is abstracted from the cluster. The cluster has a small list of mandatory attributes and
 * functions and a list of optional features.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 5.2
 */
export declare namespace DoorLock {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0101;

    /**
     * Textual cluster identifier.
     */
    export const name: "DoorLock";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 9;

    /**
     * Canonical metadata for the DoorLock cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link DoorLock} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute may be NULL if the lock hardware does not currently know the status of the locking mechanism.
         * For example, a lock may not know the LockState status after a power cycle until the first lock actuation is
         * completed.
         *
         * The Not Fully Locked value is used by a lock to indicate that the state of the lock is somewhere between
         * Locked and Unlocked so it is only partially secured. For example, a deadbolt could be partially extended and
         * not in a dead latched state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.1
         */
        lockState: LockState | null;

        /**
         * Indicates the type of door lock as defined in LockTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.2
         */
        lockType: LockType;

        /**
         * Indicates if the lock is currently able to (Enabled) or not able to (Disabled) process remote Lock, Unlock,
         * or Unlock with Timeout commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.3
         */
        actuatorEnabled: boolean;

        /**
         * Indicates the current operating mode of the lock as defined in OperatingModeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.24
         */
        operatingMode: OperatingMode;

        /**
         * This attribute shall contain a bitmap with all operating bits of the OperatingMode attribute supported by the
         * lock.
         *
         * A bit position set to zero shall indicate that the mode is supported. A bit position set to one shall
         * indicate that the mode is not supported.
         *
         * Any bit that is not yet defined in OperatingModesBitmap shall be set to 1.
         *
         * The values considered valid to read or write in the OperatingMode attribute shall be the enum values from
         * DoorLockOperatingModeEnum whose equivalent same-named bit from OperatingModesBitmap is set to zero in this
         * attribute. WARNING: This is the opposite of most other semantically similar bitmaps in this specification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.25
         */
        supportedOperatingModes: OperatingModes;

        /**
         * Indicates the language for the on-screen or audible user interface using a 2-byte language code from
         * ISO-639-1.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.20
         */
        language?: string;

        /**
         * Indicates the settings for the LED support, as defined by LEDSettingEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.21
         */
        ledSettings?: LedSetting;

        /**
         * Indicates the number of seconds to wait after unlocking a lock before it automatically locks again.
         * 0=disabled. If set, unlock operations from any source will be timed. For one time unlock with timeout use the
         * specific command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.22
         */
        autoRelockTime?: number;

        /**
         * Indicates the sound volume on a door lock as defined by SoundVolumeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.23
         */
        soundVolume?: SoundVolume;

        /**
         * Indicates the default configurations as they are physically set on the device (example: hardware dip switch
         * setting, etc…) and represents the default setting for some of the attributes within this cluster (for
         * example: LED, Auto Lock, Sound Volume, and Operating Mode attributes).
         *
         * This is a read-only attribute and is intended to allow clients to determine what changes may need to be made
         * without having to query all the included attributes. It may be beneficial for the clients to know what the
         * device’s original settings were in the event that the device needs to be restored to factory default
         * settings.
         *
         * If the Client device would like to query and modify the door lock server’s operating settings, it SHOULD send
         * read and write attribute requests to the specific attributes.
         *
         * For example, the Sound Volume attribute default value is Silent Mode. However, it is possible that the
         * current Sound Volume is High Volume. Therefore, if the client wants to query/modify the current Sound Volume
         * setting on the server, the client SHOULD read/write to the Sound Volume attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.26
         */
        defaultConfigurationRegister?: ConfigurationRegister;

        /**
         * This attribute shall enable/disable local programming on the door lock of certain features (see
         * LocalProgrammingFeatures attribute). If this value is set to TRUE then local programming is enabled on the
         * door lock for all features. If it is set to FALSE then local programming is disabled on the door lock for
         * those features whose bit is set to 0 in the LocalProgrammingFeatures attribute. Local programming shall be
         * enabled by default.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.27
         */
        enableLocalProgramming?: boolean;

        /**
         * This attribute shall enable/disable the ability to lock the door lock with a single touch on the door lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.28
         */
        enableOneTouchLocking?: boolean;

        /**
         * This attribute shall enable/disable an inside LED that allows the user to see at a glance if the door is
         * locked.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.29
         */
        enableInsideStatusLed?: boolean;

        /**
         * This attribute shall enable/disable a button inside the door that is used to put the lock into privacy mode.
         * When the lock is in privacy mode it cannot be manipulated from the outside.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.30
         */
        enablePrivacyModeButton?: boolean;

        /**
         * Indicates the local programming features that will be disabled when EnableLocalProgramming attribute is set
         * to False. If a door lock doesn’t support disabling one aspect of local programming it shall return
         * CONSTRAINT_ERROR during a write operation of this attribute. If the EnableLocalProgramming attribute is set
         * to True then all local programming features shall be enabled regardless of the bits set to 0 in this
         * attribute.
         *
         * The features that can be disabled from local programming are defined in LocalProgrammingFeaturesBitmap.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.31
         */
        localProgrammingFeatures?: LocalProgrammingFeatures;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9
         * @deprecated
         */
        securityLevel?: any;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "DoorPositionSensor".
     */
    export interface DoorPositionSensorAttributes {
        /**
         * Indicates the current door state as defined in DoorStateEnum.
         *
         * Null only if an internal error prevents the retrieval of the current door state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.4
         */
        doorState: DoorState | null;

        /**
         * This attribute shall hold the number of door open events that have occurred since it was last zeroed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.5
         */
        doorOpenEvents?: number;

        /**
         * This attribute shall hold the number of door closed events that have occurred since it was last zeroed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.6
         */
        doorClosedEvents?: number;

        /**
         * This attribute shall hold the number of minutes the door has been open since the last time it transitioned
         * from closed to open.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.7
         */
        openPeriod?: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "User".
     */
    export interface UserAttributes {
        /**
         * Indicates the number of total users supported by the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.8
         */
        numberOfTotalUsersSupported: number;

        /**
         * This attribute shall contain a bitmap with the bits set for the values of CredentialRuleEnum supported on
         * this device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.18
         */
        credentialRulesSupport: CredentialRules;

        /**
         * Indicates the number of credentials that could be assigned for each user.
         *
         * Depending on the value of NumberOfRFIDUsersSupported and NumberOfPINUsersSupported it may not be possible to
         * assign that number of credentials for a user.
         *
         * For example, if the device supports only PIN and RFID credential types, NumberOfCredentialsSupportedPerUser
         * is set to 10, NumberOfPINUsersSupported is set to 5 and NumberOfRFIDUsersSupported is set to 3, it will not
         * be possible to actually assign 10 credentials for a user because maximum number of credentials in the
         * database is 8.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.19
         */
        numberOfCredentialsSupportedPerUser: number;

        /**
         * Indicates the number of minutes a PIN, RFID, Fingerprint, or other credential associated with a user of type
         * ExpiringUser shall remain valid after its first use before expiring. When the credential expires the
         * UserStatus for the corresponding user record shall be set to OccupiedDisabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.36
         */
        expiringUserTimeout?: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "PinCredential".
     */
    export interface PinCredentialAttributes {
        /**
         * Indicates the number of PIN users supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.9
         */
        numberOfPinUsersSupported: number;

        /**
         * Indicates the maximum length in bytes of a PIN Code on this device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.14
         */
        maxPinCodeLength: number;

        /**
         * Indicates the minimum length in bytes of a PIN Code on this device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.15
         */
        minPinCodeLength: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "RfidCredential".
     */
    export interface RfidCredentialAttributes {
        /**
         * Indicates the number of RFID users supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.10
         */
        numberOfRfidUsersSupported: number;

        /**
         * Indicates the maximum length in bytes of a RFID Code on this device. The value depends on the RFID code range
         * specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID code, a value of 20
         * (equals 10 Byte ISO 14443A UID) is recommended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.16
         */
        maxRfidCodeLength: number;

        /**
         * Indicates the minimum length in bytes of a RFID Code on this device. The value depends on the RFID code range
         * specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID code, a value of 8
         * (equals 4 Byte ISO 14443A UID) is recommended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.17
         */
        minRfidCodeLength: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "WeekDayAccessSchedules".
     */
    export interface WeekDayAccessSchedulesAttributes {
        /**
         * Indicates the number of configurable week day schedule supported per user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.11
         */
        numberOfWeekDaySchedulesSupportedPerUser: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "YearDayAccessSchedules".
     */
    export interface YearDayAccessSchedulesAttributes {
        /**
         * Indicates the number of configurable year day schedule supported per user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.12
         */
        numberOfYearDaySchedulesSupportedPerUser: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "HolidaySchedules".
     */
    export interface HolidaySchedulesAttributes {
        /**
         * Indicates the number of holiday schedules supported for the entire door lock device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.13
         */
        numberOfHolidaySchedulesSupported: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "PinCredentialOrRfidCredential".
     */
    export interface PinCredentialOrRfidCredentialAttributes {
        /**
         * Indicates the number of incorrect Pin codes or RFID presentment attempts a user is allowed to enter before
         * the lock will enter a lockout state. The value of this attribute is compared to all failing forms of
         * credential presentation, including Pin codes used in an Unlock Command when RequirePINforRemoteOperation is
         * set to true. Valid range is 1-255 incorrect attempts. The lockout state will be for the duration of
         * UserCodeTemporaryDisableTime. If the attribute accepts writes and an attempt to write the value 0 is made,
         * the device shall respond with CONSTRAINT_ERROR.
         *
         * The lock may reset the counter used to track incorrect credential presentations as required by internal
         * logic, environmental events, or other reasons. The lock shall reset the counter if a valid credential is
         * presented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.32
         */
        wrongCodeEntryLimit: number;

        /**
         * Indicates the number of seconds that the lock shuts down following wrong code entry. Valid range is 1-255
         * seconds. Device can shut down to lock user out for specified amount of time. (Makes it difficult to try and
         * guess a PIN for the device.) If the attribute accepts writes and an attempt to write the attribute to 0 is
         * made, the device shall respond with CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.33
         */
        userCodeTemporaryDisableTime: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "PinCredentialNotUser".
     */
    export interface PinCredentialNotUserAttributes {
        /**
         * Indicates the door locks ability to send PINs over the air. If the attribute is True it is ok for the door
         * lock server to send PINs over the air. This attribute determines the behavior of the server’s TX operation.
         * If it is false, then it is not ok for the device to send PIN in any messages over the air.
         *
         * The PIN field within any door lock cluster message shall keep the first octet unchanged and masks the actual
         * code by replacing with 0xFF. For example (PIN "1234" ): If the attribute value is True, 0x04 0x31 0x32 0x33
         * 0x34 shall be used in the PIN field in any door lock cluster message payload. If the attribute value is
         * False, 0x04 0xFF 0xFF 0xFF 0xFF shall be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.34
         */
        sendPinOverTheAir?: boolean;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "CredentialOverTheAirAccessAndPinCredential".
     */
    export interface CredentialOverTheAirAccessAndPinCredentialAttributes {
        /**
         * Indicates if the door lock requires an optional PIN. If this attribute is set to True, the door lock server
         * requires that an optional PINs be included in the payload of remote lock operation events like Lock, Unlock,
         * Unlock with Timeout and Toggle in order to function.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.35
         */
        requirePinForRemoteOperation: boolean;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "AliroProvisioning".
     */
    export interface AliroProvisioningAttributes {
        /**
         * Indicates the verification key component of the Reader’s key pair as defined in [Aliro]. The value, if not
         * null, shall be an uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1.
         *
         * Null if no Reader key pair has been configured on the lock. See Section 5.2.10.42, “SetAliroReaderConfig
         * Command”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.37
         */
        aliroReaderVerificationKey: Bytes | null;

        /**
         * Indicates the reader_group_identifier as defined in [Aliro].
         *
         * Null if no reader_group_identifier has been configured on the lock. See Section 5.2.10.42,
         * “SetAliroReaderConfig Command”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.38
         */
        aliroReaderGroupIdentifier: Bytes | null;

        /**
         * Indicates the reader_group_sub_identifier as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.39
         */
        aliroReaderGroupSubIdentifier: Bytes;

        /**
         * Indicates the list of protocol versions supported for expedited transactions as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.40
         */
        aliroExpeditedTransactionSupportedProtocolVersions: Bytes[];

        /**
         * Indicates the maximum number of AliroCredentialIssuerKey credentials that can be stored on the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.44
         */
        numberOfAliroCredentialIssuerKeysSupported: number;

        /**
         * Indicates the maximum number of endpoint key credentials that can be stored on the lock. This limit applies
         * to the sum of the number of AliroEvictableEndpointKey credentials and the number of
         * AliroNonEvictableEndpointKey credentials.
         *
         * > [!NOTE]
         *
         * > The credential indices used for these two credential types are independent of each other, similar to all
         *   other credential types. As long as NumberOfAliroEndpointKeysSupported is at least 2 a client could add a
         *   credential of type AliroEvictableEndpointKey at any index from 1 to NumberOfAliroEndpointKeysSupported and
         *   also add a credential of type AliroNonEvictableEndpointKey at the same index, and both credentials would
         *   exist on the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.45
         */
        numberOfAliroEndpointKeysSupported: number;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "AliroBleuwb".
     */
    export interface AliroBleuwbAttributes {
        /**
         * Indicates the Group Resolving Key as defined in [Aliro].
         *
         * Null if no group resolving key has been configured on the lock. See Section 5.2.10.42, “SetAliroReaderConfig
         * Command”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.41
         */
        aliroGroupResolvingKey: Bytes | null;

        /**
         * Indicates the list of protocol versions supported for the Bluetooth LE + UWB Access Control Flow as defined
         * in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.42
         */
        aliroSupportedBleuwbProtocolVersions: Bytes[];

        /**
         * Indicates the version of the Bluetooth LE advertisement as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.43
         */
        aliroBleAdvertisingVersion: number;
    }

    /**
     * Attributes that may appear in {@link DoorLock}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute may be NULL if the lock hardware does not currently know the status of the locking mechanism.
         * For example, a lock may not know the LockState status after a power cycle until the first lock actuation is
         * completed.
         *
         * The Not Fully Locked value is used by a lock to indicate that the state of the lock is somewhere between
         * Locked and Unlocked so it is only partially secured. For example, a deadbolt could be partially extended and
         * not in a dead latched state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.1
         */
        lockState: LockState | null;

        /**
         * Indicates the type of door lock as defined in LockTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.2
         */
        lockType: LockType;

        /**
         * Indicates if the lock is currently able to (Enabled) or not able to (Disabled) process remote Lock, Unlock,
         * or Unlock with Timeout commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.3
         */
        actuatorEnabled: boolean;

        /**
         * Indicates the current operating mode of the lock as defined in OperatingModeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.24
         */
        operatingMode: OperatingMode;

        /**
         * This attribute shall contain a bitmap with all operating bits of the OperatingMode attribute supported by the
         * lock.
         *
         * A bit position set to zero shall indicate that the mode is supported. A bit position set to one shall
         * indicate that the mode is not supported.
         *
         * Any bit that is not yet defined in OperatingModesBitmap shall be set to 1.
         *
         * The values considered valid to read or write in the OperatingMode attribute shall be the enum values from
         * DoorLockOperatingModeEnum whose equivalent same-named bit from OperatingModesBitmap is set to zero in this
         * attribute. WARNING: This is the opposite of most other semantically similar bitmaps in this specification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.25
         */
        supportedOperatingModes: OperatingModes;

        /**
         * Indicates the language for the on-screen or audible user interface using a 2-byte language code from
         * ISO-639-1.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.20
         */
        language: string;

        /**
         * Indicates the settings for the LED support, as defined by LEDSettingEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.21
         */
        ledSettings: LedSetting;

        /**
         * Indicates the number of seconds to wait after unlocking a lock before it automatically locks again.
         * 0=disabled. If set, unlock operations from any source will be timed. For one time unlock with timeout use the
         * specific command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.22
         */
        autoRelockTime: number;

        /**
         * Indicates the sound volume on a door lock as defined by SoundVolumeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.23
         */
        soundVolume: SoundVolume;

        /**
         * Indicates the default configurations as they are physically set on the device (example: hardware dip switch
         * setting, etc…) and represents the default setting for some of the attributes within this cluster (for
         * example: LED, Auto Lock, Sound Volume, and Operating Mode attributes).
         *
         * This is a read-only attribute and is intended to allow clients to determine what changes may need to be made
         * without having to query all the included attributes. It may be beneficial for the clients to know what the
         * device’s original settings were in the event that the device needs to be restored to factory default
         * settings.
         *
         * If the Client device would like to query and modify the door lock server’s operating settings, it SHOULD send
         * read and write attribute requests to the specific attributes.
         *
         * For example, the Sound Volume attribute default value is Silent Mode. However, it is possible that the
         * current Sound Volume is High Volume. Therefore, if the client wants to query/modify the current Sound Volume
         * setting on the server, the client SHOULD read/write to the Sound Volume attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.26
         */
        defaultConfigurationRegister: ConfigurationRegister;

        /**
         * This attribute shall enable/disable local programming on the door lock of certain features (see
         * LocalProgrammingFeatures attribute). If this value is set to TRUE then local programming is enabled on the
         * door lock for all features. If it is set to FALSE then local programming is disabled on the door lock for
         * those features whose bit is set to 0 in the LocalProgrammingFeatures attribute. Local programming shall be
         * enabled by default.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.27
         */
        enableLocalProgramming: boolean;

        /**
         * This attribute shall enable/disable the ability to lock the door lock with a single touch on the door lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.28
         */
        enableOneTouchLocking: boolean;

        /**
         * This attribute shall enable/disable an inside LED that allows the user to see at a glance if the door is
         * locked.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.29
         */
        enableInsideStatusLed: boolean;

        /**
         * This attribute shall enable/disable a button inside the door that is used to put the lock into privacy mode.
         * When the lock is in privacy mode it cannot be manipulated from the outside.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.30
         */
        enablePrivacyModeButton: boolean;

        /**
         * Indicates the local programming features that will be disabled when EnableLocalProgramming attribute is set
         * to False. If a door lock doesn’t support disabling one aspect of local programming it shall return
         * CONSTRAINT_ERROR during a write operation of this attribute. If the EnableLocalProgramming attribute is set
         * to True then all local programming features shall be enabled regardless of the bits set to 0 in this
         * attribute.
         *
         * The features that can be disabled from local programming are defined in LocalProgrammingFeaturesBitmap.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.31
         */
        localProgrammingFeatures: LocalProgrammingFeatures;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9
         * @deprecated
         */
        securityLevel: any;

        /**
         * Indicates the current door state as defined in DoorStateEnum.
         *
         * Null only if an internal error prevents the retrieval of the current door state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.4
         */
        doorState: DoorState | null;

        /**
         * This attribute shall hold the number of door open events that have occurred since it was last zeroed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.5
         */
        doorOpenEvents: number;

        /**
         * This attribute shall hold the number of door closed events that have occurred since it was last zeroed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.6
         */
        doorClosedEvents: number;

        /**
         * This attribute shall hold the number of minutes the door has been open since the last time it transitioned
         * from closed to open.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.7
         */
        openPeriod: number;

        /**
         * Indicates the number of total users supported by the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.8
         */
        numberOfTotalUsersSupported: number;

        /**
         * This attribute shall contain a bitmap with the bits set for the values of CredentialRuleEnum supported on
         * this device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.18
         */
        credentialRulesSupport: CredentialRules;

        /**
         * Indicates the number of credentials that could be assigned for each user.
         *
         * Depending on the value of NumberOfRFIDUsersSupported and NumberOfPINUsersSupported it may not be possible to
         * assign that number of credentials for a user.
         *
         * For example, if the device supports only PIN and RFID credential types, NumberOfCredentialsSupportedPerUser
         * is set to 10, NumberOfPINUsersSupported is set to 5 and NumberOfRFIDUsersSupported is set to 3, it will not
         * be possible to actually assign 10 credentials for a user because maximum number of credentials in the
         * database is 8.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.19
         */
        numberOfCredentialsSupportedPerUser: number;

        /**
         * Indicates the number of minutes a PIN, RFID, Fingerprint, or other credential associated with a user of type
         * ExpiringUser shall remain valid after its first use before expiring. When the credential expires the
         * UserStatus for the corresponding user record shall be set to OccupiedDisabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.36
         */
        expiringUserTimeout: number;

        /**
         * Indicates the number of PIN users supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.9
         */
        numberOfPinUsersSupported: number;

        /**
         * Indicates the maximum length in bytes of a PIN Code on this device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.14
         */
        maxPinCodeLength: number;

        /**
         * Indicates the minimum length in bytes of a PIN Code on this device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.15
         */
        minPinCodeLength: number;

        /**
         * Indicates the number of RFID users supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.10
         */
        numberOfRfidUsersSupported: number;

        /**
         * Indicates the maximum length in bytes of a RFID Code on this device. The value depends on the RFID code range
         * specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID code, a value of 20
         * (equals 10 Byte ISO 14443A UID) is recommended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.16
         */
        maxRfidCodeLength: number;

        /**
         * Indicates the minimum length in bytes of a RFID Code on this device. The value depends on the RFID code range
         * specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID code, a value of 8
         * (equals 4 Byte ISO 14443A UID) is recommended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.17
         */
        minRfidCodeLength: number;

        /**
         * Indicates the number of configurable week day schedule supported per user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.11
         */
        numberOfWeekDaySchedulesSupportedPerUser: number;

        /**
         * Indicates the number of configurable year day schedule supported per user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.12
         */
        numberOfYearDaySchedulesSupportedPerUser: number;

        /**
         * Indicates the number of holiday schedules supported for the entire door lock device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.13
         */
        numberOfHolidaySchedulesSupported: number;

        /**
         * Indicates the number of incorrect Pin codes or RFID presentment attempts a user is allowed to enter before
         * the lock will enter a lockout state. The value of this attribute is compared to all failing forms of
         * credential presentation, including Pin codes used in an Unlock Command when RequirePINforRemoteOperation is
         * set to true. Valid range is 1-255 incorrect attempts. The lockout state will be for the duration of
         * UserCodeTemporaryDisableTime. If the attribute accepts writes and an attempt to write the value 0 is made,
         * the device shall respond with CONSTRAINT_ERROR.
         *
         * The lock may reset the counter used to track incorrect credential presentations as required by internal
         * logic, environmental events, or other reasons. The lock shall reset the counter if a valid credential is
         * presented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.32
         */
        wrongCodeEntryLimit: number;

        /**
         * Indicates the number of seconds that the lock shuts down following wrong code entry. Valid range is 1-255
         * seconds. Device can shut down to lock user out for specified amount of time. (Makes it difficult to try and
         * guess a PIN for the device.) If the attribute accepts writes and an attempt to write the attribute to 0 is
         * made, the device shall respond with CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.33
         */
        userCodeTemporaryDisableTime: number;

        /**
         * Indicates the door locks ability to send PINs over the air. If the attribute is True it is ok for the door
         * lock server to send PINs over the air. This attribute determines the behavior of the server’s TX operation.
         * If it is false, then it is not ok for the device to send PIN in any messages over the air.
         *
         * The PIN field within any door lock cluster message shall keep the first octet unchanged and masks the actual
         * code by replacing with 0xFF. For example (PIN "1234" ): If the attribute value is True, 0x04 0x31 0x32 0x33
         * 0x34 shall be used in the PIN field in any door lock cluster message payload. If the attribute value is
         * False, 0x04 0xFF 0xFF 0xFF 0xFF shall be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.34
         */
        sendPinOverTheAir: boolean;

        /**
         * Indicates if the door lock requires an optional PIN. If this attribute is set to True, the door lock server
         * requires that an optional PINs be included in the payload of remote lock operation events like Lock, Unlock,
         * Unlock with Timeout and Toggle in order to function.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.35
         */
        requirePinForRemoteOperation: boolean;

        /**
         * Indicates the verification key component of the Reader’s key pair as defined in [Aliro]. The value, if not
         * null, shall be an uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1.
         *
         * Null if no Reader key pair has been configured on the lock. See Section 5.2.10.42, “SetAliroReaderConfig
         * Command”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.37
         */
        aliroReaderVerificationKey: Bytes | null;

        /**
         * Indicates the reader_group_identifier as defined in [Aliro].
         *
         * Null if no reader_group_identifier has been configured on the lock. See Section 5.2.10.42,
         * “SetAliroReaderConfig Command”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.38
         */
        aliroReaderGroupIdentifier: Bytes | null;

        /**
         * Indicates the reader_group_sub_identifier as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.39
         */
        aliroReaderGroupSubIdentifier: Bytes;

        /**
         * Indicates the list of protocol versions supported for expedited transactions as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.40
         */
        aliroExpeditedTransactionSupportedProtocolVersions: Bytes[];

        /**
         * Indicates the maximum number of AliroCredentialIssuerKey credentials that can be stored on the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.44
         */
        numberOfAliroCredentialIssuerKeysSupported: number;

        /**
         * Indicates the maximum number of endpoint key credentials that can be stored on the lock. This limit applies
         * to the sum of the number of AliroEvictableEndpointKey credentials and the number of
         * AliroNonEvictableEndpointKey credentials.
         *
         * > [!NOTE]
         *
         * > The credential indices used for these two credential types are independent of each other, similar to all
         *   other credential types. As long as NumberOfAliroEndpointKeysSupported is at least 2 a client could add a
         *   credential of type AliroEvictableEndpointKey at any index from 1 to NumberOfAliroEndpointKeysSupported and
         *   also add a credential of type AliroNonEvictableEndpointKey at the same index, and both credentials would
         *   exist on the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.45
         */
        numberOfAliroEndpointKeysSupported: number;

        /**
         * Indicates the Group Resolving Key as defined in [Aliro].
         *
         * Null if no group resolving key has been configured on the lock. See Section 5.2.10.42, “SetAliroReaderConfig
         * Command”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.41
         */
        aliroGroupResolvingKey: Bytes | null;

        /**
         * Indicates the list of protocol versions supported for the Bluetooth LE + UWB Access Control Flow as defined
         * in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.42
         */
        aliroSupportedBleuwbProtocolVersions: Bytes[];

        /**
         * Indicates the version of the Bluetooth LE advertisement as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.9.43
         */
        aliroBleAdvertisingVersion: number;
    }

    /**
     * {@link DoorLock} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command causes the lock device to lock the door. This command includes an optional code for the lock.
         * The door lock may require a PIN depending on the value of the RequirePINForRemoteOperation attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.1
         */
        lockDoor(request: LockDoorRequest): MaybePromise;

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
        unlockDoor(request: UnlockDoorRequest): MaybePromise;

        /**
         * This command causes the lock device to unlock the door with a timeout parameter. After the time in seconds
         * specified in the timeout field, the lock device will relock itself automatically. This timeout parameter is
         * only temporary for this message transition and overrides the default relock time as specified in the
         * AutoRelockTime attribute. If the door lock device is not capable of or does not want to support temporary
         * Relock Timeout, it SHOULD NOT support this optional command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.3
         */
        unlockWithTimeout(request: UnlockWithTimeoutRequest): MaybePromise;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "User".
     */
    export interface UserCommands {
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
        setUser(request: SetUserRequest): MaybePromise;

        /**
         * Retrieve user.
         *
         * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.) as
         * needed otherwise the GetUserResponse Command shall be sent implying a status of SUCCESS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.33
         */
        getUser(request: GetUserRequest): MaybePromise<GetUserResponse>;

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
        clearUser(request: ClearUserRequest): MaybePromise;

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
         * A LockUserChange event shall be generated after successfully creating a new credential and a new user. The
         * UserIndex of this LockUserChange event shall be the UserIndex that was used to create the user. The DataIndex
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
        setCredential(request: SetCredentialRequest): MaybePromise<SetCredentialResponse>;

        /**
         * Retrieve the status of a particular credential (e.g. PIN, RFID, Fingerprint, etc.) by index.
         *
         * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.) as
         * needed otherwise the GetCredentialStatusResponse command shall be sent implying a status of SUCCESS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.38
         */
        getCredentialStatus(request: GetCredentialStatusRequest): MaybePromise<GetCredentialStatusResponse>;

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
        clearCredential(request: ClearCredentialRequest): MaybePromise;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "WeekDayAccessSchedules".
     */
    export interface WeekDayAccessSchedulesCommands {
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
        setWeekDaySchedule(request: SetWeekDayScheduleRequest): MaybePromise;

        /**
         * Retrieve the specific weekly schedule for the specific user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.13
         */
        getWeekDaySchedule(request: GetWeekDayScheduleRequest): MaybePromise<GetWeekDayScheduleResponse>;

        /**
         * Clear the specific weekly schedule or all weekly schedules for the specific user.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.15
         */
        clearWeekDaySchedule(request: ClearWeekDayScheduleRequest): MaybePromise;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "YearDayAccessSchedules".
     */
    export interface YearDayAccessSchedulesCommands {
        /**
         * Set a time-specific schedule ID for a specified user.
         *
         * The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Year Day schedule is set.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16
         */
        setYearDaySchedule(request: SetYearDayScheduleRequest): MaybePromise;

        /**
         * Retrieve the specific year day schedule for the specific schedule and user indexes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.17
         */
        getYearDaySchedule(request: GetYearDayScheduleRequest): MaybePromise<GetYearDayScheduleResponse>;

        /**
         * Clears the specific year day schedule or all year day schedules for the specific user.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.19
         */
        clearYearDaySchedule(request: ClearYearDayScheduleRequest): MaybePromise;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "HolidaySchedules".
     */
    export interface HolidaySchedulesCommands {
        /**
         * Set the holiday Schedule by specifying local start time and local end time with respect to any Lock Operating
         * Mode.
         *
         * Return status shall be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20
         */
        setHolidaySchedule(request: SetHolidayScheduleRequest): MaybePromise;

        /**
         * Get the holiday schedule for the specified index.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.21
         */
        getHolidaySchedule(request: GetHolidayScheduleRequest): MaybePromise<GetHolidayScheduleResponse>;

        /**
         * Clears the holiday schedule or all holiday schedules.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.23
         */
        clearHolidaySchedule(request: ClearHolidayScheduleRequest): MaybePromise;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "PinCredentialNotUser".
     */
    export interface PinCredentialNotUserCommands {
        /**
         * Set a PIN Code into the lock.
         *
         * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall
         * be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.4
         */
        setPinCode(request: SetPinCodeRequest): MaybePromise;

        /**
         * Retrieve a PIN Code.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.5
         */
        getPinCode(request: GetPinCodeRequest): MaybePromise<GetPinCodeResponse>;

        /**
         * Clear a PIN code or all PIN codes.
         *
         * For each PIN Code cleared whose user doesn’t have a RFID Code or other credential type, then corresponding
         * user record’s UserStatus value shall be set to Available, and UserType value shall be set to UnrestrictedUser
         * and all schedules shall be cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.7
         */
        clearPinCode(request: ClearPinCodeRequest): MaybePromise;

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

    /**
     * {@link DoorLock} supports these elements if it supports feature "AliroProvisioning".
     */
    export interface AliroProvisioningCommands {
        /**
         * This command allows communicating an Aliro Reader configuration, as defined in [Aliro], to the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42
         */
        setAliroReaderConfig(request: SetAliroReaderConfigRequest): MaybePromise;

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

    /**
     * {@link DoorLock} supports these elements if it supports feature
     * "PinCredentialAndRfidCredentialAndFingerCredentialsNotUser".
     */
    export interface PinCredentialAndRfidCredentialAndFingerCredentialsNotUserCommands {
        /**
         * Set the status of a user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.9
         */
        setUserStatus(request: SetUserStatusRequest): MaybePromise;

        /**
         * Get the status of a user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.10
         */
        getUserStatus(request: GetUserStatusRequest): MaybePromise<GetUserStatusResponse>;

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
        setUserType(request: SetUserTypeRequest): MaybePromise;

        /**
         * Retrieve the user type for a specific user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.25
         */
        getUserType(request: GetUserTypeRequest): MaybePromise<GetUserTypeResponse>;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "RfidCredentialNotUser".
     */
    export interface RfidCredentialNotUserCommands {
        /**
         * Set an ID for RFID access into the lock.
         *
         * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall
         * be one of the following values:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.27
         */
        setRfidCode(request: SetRfidCodeRequest): MaybePromise;

        /**
         * Retrieve an RFID code.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.28
         */
        getRfidCode(request: GetRfidCodeRequest): MaybePromise<GetRfidCodeResponse>;

        /**
         * Clear an RFID code or all RFID codes.
         *
         * For each RFID Code cleared whose user doesn’t have a PIN Code or other credential type, then the
         * corresponding user record’s UserStatus value shall be set to Available, and UserType value shall be set to
         * UnrestrictedUser and all schedules shall be cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.30
         */
        clearRfidCode(request: ClearRfidCodeRequest): MaybePromise;

        /**
         * Clear out all RFIDs on the lock. If you clear all RFID codes and this user didn’t have a PIN code, the user
         * status has to be set to "0 Available", the user type has to be set to the default value, and all schedules
         * which are supported have to be set to the default values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.31
         */
        clearAllRfidCodes(): MaybePromise;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "Unbolting".
     */
    export interface UnboltingCommands {
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
        unboltDoor(request: UnboltDoorRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link DoorLock}.
     */
    export interface Commands extends
        BaseCommands,
        UserCommands,
        WeekDayAccessSchedulesCommands,
        YearDayAccessSchedulesCommands,
        HolidaySchedulesCommands,
        PinCredentialNotUserCommands,
        AliroProvisioningCommands,
        PinCredentialAndRfidCredentialAndFingerCredentialsNotUserCommands,
        RfidCredentialNotUserCommands,
        UnboltingCommands
    {}

    /**
     * {@link DoorLock} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * The door lock server provides several alarms which can be sent when there is a critical state on the door
         * lock. The alarms available for the door lock server are listed in AlarmCodeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.1
         */
        doorLockAlarm: DoorLockAlarmEvent;

        /**
         * The door lock server sends out a LockOperation event when the event is triggered by the various lock
         * operation sources.
         *
         *   - If the door lock server supports the Unbolt Door command, it shall generate a LockOperation event with
         *     LockOperationType set to Unlock after an Unbolt Door command succeeds.
         *
         *   - If the door lock server supports the Unbolting feature and an Unlock Door command is performed, it shall
         *     generate a LockOperation event with LockOperationType set to Unlatch when the unlatched state is reached
         *     and a LockOperation event with LockOperationType set to Unlock when the lock successfully completes the
         *     unlock → hold latch → release latch and return to unlock state operation.
         *
         *   - If the command fails during holding or releasing the latch but after passing the unlocked state, the door
         *     lock server shall generate a LockOperationError event with LockOperationType set to Unlatch and a
         *     LockOperation event with LockOperationType set to Unlock.
         *
         *     - If it fails before reaching the unlocked state, the door lock server shall generate only a
         *       LockOperationError event with LockOperationType set to Unlock.
         *
         *   - Upon manual actuation, a door lock server that supports the Unbolting feature:
         *
         *     - shall generate a LockOperation event of LockOperationType Unlatch when it is actuated from the outside.
         *
         *     - may generate a LockOperation event of LockOperationType Unlatch when it is actuated from the inside.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3
         */
        lockOperation: LockOperationEvent;

        /**
         * The door lock server sends out a LockOperationError event when a lock operation fails for various reasons.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4
         */
        lockOperationError: LockOperationErrorEvent;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "DoorPositionSensor".
     */
    export interface DoorPositionSensorEvents {
        /**
         * The door lock server sends out a DoorStateChange event when the door lock door state changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.2
         */
        doorStateChange: DoorStateChangeEvent;
    }

    /**
     * {@link DoorLock} supports these elements if it supports feature "User".
     */
    export interface UserEvents {
        /**
         * The door lock server sends out a LockUserChange event when a lock user, schedule, or credential change has
         * occurred.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5
         */
        lockUserChange: LockUserChangeEvent;
    }

    /**
     * Events that may appear in {@link DoorLock}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * The door lock server provides several alarms which can be sent when there is a critical state on the door
         * lock. The alarms available for the door lock server are listed in AlarmCodeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.1
         */
        doorLockAlarm: DoorLockAlarmEvent;

        /**
         * The door lock server sends out a LockOperation event when the event is triggered by the various lock
         * operation sources.
         *
         *   - If the door lock server supports the Unbolt Door command, it shall generate a LockOperation event with
         *     LockOperationType set to Unlock after an Unbolt Door command succeeds.
         *
         *   - If the door lock server supports the Unbolting feature and an Unlock Door command is performed, it shall
         *     generate a LockOperation event with LockOperationType set to Unlatch when the unlatched state is reached
         *     and a LockOperation event with LockOperationType set to Unlock when the lock successfully completes the
         *     unlock → hold latch → release latch and return to unlock state operation.
         *
         *   - If the command fails during holding or releasing the latch but after passing the unlocked state, the door
         *     lock server shall generate a LockOperationError event with LockOperationType set to Unlatch and a
         *     LockOperation event with LockOperationType set to Unlock.
         *
         *     - If it fails before reaching the unlocked state, the door lock server shall generate only a
         *       LockOperationError event with LockOperationType set to Unlock.
         *
         *   - Upon manual actuation, a door lock server that supports the Unbolting feature:
         *
         *     - shall generate a LockOperation event of LockOperationType Unlatch when it is actuated from the outside.
         *
         *     - may generate a LockOperation event of LockOperationType Unlatch when it is actuated from the inside.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3
         */
        lockOperation: LockOperationEvent;

        /**
         * The door lock server sends out a LockOperationError event when a lock operation fails for various reasons.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4
         */
        lockOperationError: LockOperationErrorEvent;

        /**
         * The door lock server sends out a DoorStateChange event when the door lock door state changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.2
         */
        doorStateChange: DoorStateChangeEvent;

        /**
         * The door lock server sends out a LockUserChange event when a lock user, schedule, or credential change has
         * occurred.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5
         */
        lockUserChange: LockUserChangeEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        {
            flags: { doorPositionSensor: true },
            attributes: DoorPositionSensorAttributes,
            events: DoorPositionSensorEvents
        },
        { flags: { user: true }, attributes: UserAttributes, commands: UserCommands, events: UserEvents },
        { flags: { pinCredential: true }, attributes: PinCredentialAttributes },
        { flags: { rfidCredential: true }, attributes: RfidCredentialAttributes },
        {
            flags: { weekDayAccessSchedules: true },
            attributes: WeekDayAccessSchedulesAttributes,
            commands: WeekDayAccessSchedulesCommands
        },
        {
            flags: { yearDayAccessSchedules: true },
            attributes: YearDayAccessSchedulesAttributes,
            commands: YearDayAccessSchedulesCommands
        },
        {
            flags: { holidaySchedules: true },
            attributes: HolidaySchedulesAttributes,
            commands: HolidaySchedulesCommands
        },
        { flags: { pinCredential: true }, attributes: PinCredentialOrRfidCredentialAttributes },
        { flags: { rfidCredential: true }, attributes: PinCredentialOrRfidCredentialAttributes },
        {
            flags: { pinCredential: true, user: false },
            attributes: PinCredentialNotUserAttributes,
            commands: PinCredentialNotUserCommands
        },
        {
            flags: { credentialOverTheAirAccess: true, pinCredential: true },
            attributes: CredentialOverTheAirAccessAndPinCredentialAttributes
        },
        {
            flags: { aliroProvisioning: true },
            attributes: AliroProvisioningAttributes,
            commands: AliroProvisioningCommands
        },
        { flags: { aliroBleuwb: true }, attributes: AliroBleuwbAttributes },
        {
            flags: { pinCredential: true, rfidCredential: true, fingerCredentials: true, user: false },
            commands: PinCredentialAndRfidCredentialAndFingerCredentialsNotUserCommands
        },
        { flags: { rfidCredential: true, user: false }, commands: RfidCredentialNotUserCommands },
        { flags: { unbolting: true }, commands: UnboltingCommands }
    ];

    export type Features = "PinCredential" | "RfidCredential" | "FingerCredentials" | "WeekDayAccessSchedules" | "DoorPositionSensor" | "FaceCredentials" | "CredentialOverTheAirAccess" | "User" | "YearDayAccessSchedules" | "HolidaySchedules" | "Unbolting" | "AliroProvisioning" | "AliroBleuwb";

    /**
     * These are optional features supported by DoorLockCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.4
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.1
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.2
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.3
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.4
         */
        WeekDayAccessSchedules = "WeekDayAccessSchedules",

        /**
         * DoorPositionSensor (DPS)
         *
         * If this feature is supported this indicates that the lock has the ability to determine the position of the
         * door which is separate from the state of the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.5
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.6
         */
        FaceCredentials = "FaceCredentials",

        /**
         * CredentialOverTheAirAccess (COTA)
         *
         * If this feature is supported then the lock supports the ability to verify a credential provided in a
         * lock/unlock command. Currently the cluster only supports providing the PIN credential to the lock/unlock
         * commands. If this feature is supported then the PIN Credential feature shall also be supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.7
         */
        CredentialOverTheAirAccess = "CredentialOverTheAirAccess",

        /**
         * User (USR)
         *
         * If the User Feature is supported then a lock employs a User database. A User within the User database is used
         * to associate credentials and schedules to single user record within the lock. This also means the UserType
         * and UserStatus fields are associated with a User and not a credential.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.8
         */
        User = "User",

        /**
         * YearDayAccessSchedules (YDSCH)
         *
         * If the User feature is supported then Year Day Schedules are applied to a User and not a credential.
         *
         * Year Day Schedules are used to restrict access to a specified date and time window.
         *
         * The lock may automatically adjust the UserType when a schedule is created or cleared.
         *
         * Support for YearDayAccessSchedules requires that the lock has the capability of keeping track of local time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.9
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.10
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.11
         */
        Unbolting = "Unbolting",

        /**
         * AliroProvisioning (ALIRO)
         *
         * Locks that support this feature implement the Aliro specification as defined in [Aliro] and support Matter as
         * a method for provisioning Aliro credentials.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.12
         */
        AliroProvisioning = "AliroProvisioning",

        /**
         * AliroBleuwb (ALBU)
         *
         * Locks that support this feature implement the Bluetooth LE + UWB Access Control Flow as defined in [Aliro].
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.4.13
         */
        AliroBleuwb = "AliroBleuwb"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.19
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.20
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.15
     */
    export enum OperatingMode {
        /**
         * The lock operates normally. All interfaces are enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.15.1
         */
        Normal = 0,

        /**
         * Only remote interaction is enabled. The keypad shall only be operable by the master user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.15.2
         */
        Vacation = 1,

        /**
         * This mode is only possible if the door is locked. Manual unlocking changes the mode to Normal operating mode.
         * All external interaction with the door lock is disabled. This mode is intended to be used so that users,
         * presumably inside the property, will have control over the entrance.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.15.3
         */
        Privacy = 2,

        /**
         * This mode only disables remote interaction with the lock. This does not apply to any remote proprietary means
         * of communication. It specifically applies to the Lock, Unlock, Toggle, and Unlock with Timeout Commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.15.4
         */
        NoRemoteLockUnlock = 3,

        /**
         * The lock is open or can be opened or closed at will without the use of a Keypad or other means of user
         * validation (e.g. a lock for a business during work hours).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.15.5
         */
        Passage = 4
    }

    /**
     * For the OperatingModesBitmap, a bit SET indicates that the operating mode IS NOT supported. A bit CLEAR indicates
     * that the operating mode IS supported. This is the inverse of most bitmaps in this specification, and it is
     * RECOMMENDED that clients carefully take this into consideration.
     *
     * > [!WARNING]
     *
     * > For the OperatingModesBitmap, a bit SET indicates that the operating mode IS NOT supported. A bit CLEAR
     *   indicates that the operating mode IS supported. This is the inverse of most bitmaps in this specification, and
     *   it is recommended that clients carefully take this into consideration. See SupportedOperatingModes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.3
     */
    export interface OperatingModes {
        /**
         * Normal operation mode is NOT supported
         */
        normal?: boolean;

        /**
         * Vacation operation mode is NOT supported
         */
        vacation?: boolean;

        /**
         * Privacy operation mode is NOT supported
         */
        privacy?: boolean;

        /**
         * No remote lock and unlock operation mode is NOT supported
         */
        noRemoteLockUnlock?: boolean;

        /**
         * Passage operation mode is NOT supported
         */
        passage?: boolean;

        /**
         * This needs always be set because this bitmap is inverse.!
         */
        alwaysSet?: number;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.21
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.22
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4
     */
    export interface ConfigurationRegister {
        /**
         * The state of local programming functionality
         *
         * This bit shall indicate the state related to local programming:
         *
         *   - 0 = Local programming is disabled
         *
         *   - 1 = Local programming is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4.1
         */
        localProgramming?: boolean;

        /**
         * The state of the keypad interface
         *
         * This bit shall indicate the state related to keypad interface:
         *
         *   - 0 = Keypad interface is disabled
         *
         *   - 1 = Keypad interface is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4.2
         */
        keypadInterface?: boolean;

        /**
         * The state of the remote interface
         *
         * This bit shall indicate the state related to remote interface:
         *
         *   - 0 = Remote interface is disabled
         *
         *   - 1 = Remote interface is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4.3
         */
        remoteInterface?: boolean;

        /**
         * Sound volume is set to Silent value
         *
         * This bit shall indicate the state related to sound volume:
         *
         *   - 0 = Sound volume value is 0 (Silent)
         *
         *   - 1 = Sound volume value is equal to something other than 0
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4.4
         */
        soundVolume?: boolean;

        /**
         * Auto relock time it set to 0
         *
         * This bit shall indicate the state related to auto relock time:
         *
         *   - 0 = Auto relock time value is 0
         *
         *   - 1 = Auto relock time value is equal to something other than 0
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4.5
         */
        autoRelockTime?: boolean;

        /**
         * LEDs is disabled
         *
         * This bit shall indicate the state related to LED settings:
         *
         *   - 0 = LED settings value is 0 (NoLEDSignal)
         *
         *   - 1 = LED settings value is equal to something other than 0
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.4.6
         */
        ledSettings?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.5
     */
    export interface LocalProgrammingFeatures {
        /**
         * The state of the ability to add users, credentials or schedules on the device
         *
         * This bit shall indicate whether the door lock is able to add Users/Credentials/Schedules locally:
         *
         *   - 0 = This ability is disabled
         *
         *   - 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.5.1
         */
        addUsersCredentialsSchedules?: boolean;

        /**
         * The state of the ability to modify users, credentials or schedules on the device
         *
         * This bit shall indicate whether the door lock is able to modify Users/Credentials/Schedules locally:
         *
         *   - 0 = This ability is disabled
         *
         *   - 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.5.2
         */
        modifyUsersCredentialsSchedules?: boolean;

        /**
         * The state of the ability to clear users, credentials or schedules on the device
         *
         * This bit shall indicate whether the door lock is able to clear Users/Credentials/Schedules locally:
         *
         *   - 0 = This ability is disabled
         *
         *   - 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.5.3
         */
        clearUsersCredentialsSchedules?: boolean;

        /**
         * The state of the ability to adjust settings on the device
         *
         * This bit shall indicate whether the door lock is able to adjust lock settings locally:
         *
         *   - 0 = This ability is disabled
         *
         *   - 1 = This ability is enabled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.5.4
         */
        adjustSettings?: boolean;
    }

    /**
     * This enumeration shall indicate the current door state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.11
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.2
     */
    export interface CredentialRules {
        /**
         * Only one credential is required for lock operation
         */
        single?: boolean;

        /**
         * Any two credentials are required for lock operation
         */
        dual?: boolean;

        /**
         * Any three credentials are required for lock operation
         */
        tri?: boolean;
    }

    /**
     * This command causes the lock device to lock the door. This command includes an optional code for the lock. The
     * door lock may require a PIN depending on the value of the RequirePINForRemoteOperation attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.1
     */
    export interface LockDoorRequest {
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.1.1
         */
        pinCode?: Bytes;
    }

    /**
     * This command causes the lock device to unlock the door. This command includes an optional code for the lock. The
     * door lock may require a code depending on the value of the RequirePINForRemoteOperation attribute.
     *
     * > [!NOTE]
     *
     * > If the attribute AutoRelockTime is supported the lock will transition to the locked state when the auto relock
     *   time has expired.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.2
     */
    export interface UnlockDoorRequest {
        /**
         * See Section 5.2.10.1.1, “PINCode Field”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.2.1
         */
        pinCode?: Bytes;
    }

    /**
     * This command causes the lock device to unlock the door with a timeout parameter. After the time in seconds
     * specified in the timeout field, the lock device will relock itself automatically. This timeout parameter is only
     * temporary for this message transition and overrides the default relock time as specified in the AutoRelockTime
     * attribute. If the door lock device is not capable of or does not want to support temporary Relock Timeout, it
     * SHOULD NOT support this optional command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.3
     */
    export interface UnlockWithTimeoutRequest {
        /**
         * This field shall indicate the timeout in seconds to wait before relocking the door lock. This value is
         * independent of the AutoRelockTime attribute value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.3.1
         */
        timeout: number;

        /**
         * See Section 5.2.10.1.1, “PINCode Field”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.3.2
         */
        pinCode?: Bytes;
    }

    /**
     * Set user into the lock.
     *
     * Fields used for different use cases:
     *
     *   - OperationType shall be set to Add.
     *
     *   - UserIndex value shall be set to a user record with UserType set to Available.
     *
     *   - UserName may be null causing new user record to use empty string for UserName otherwise UserName shall be set
     *     to the value provided in the new user record.
     *
     *   - UserUniqueID may be null causing new user record to use 0xFFFFFFFF for UserUniqueID otherwise UserUniqueID
     *     shall be set to the value provided in the new user record.
     *
     *   - UserStatus may be null causing new user record to use OccupiedEnabled for UserStatus otherwise UserStatus
     *     shall be set to the value provided in the new user record.
     *
     *   - UserType may be null causing new user record to use UnrestrictedUser for UserType otherwise UserType shall be
     *     set to the value provided in the new user record.
     *
     *   - CredentialRule may be null causing new user record to use Single for CredentialRule otherwise CredentialRule
     *     shall be set to the value provided in the new user record.
     *
     * CreatorFabricIndex and LastModifiedFabricIndex in the new user record shall be set to the accessing fabric index.
     *
     * A LockUserChange event shall be generated after successfully creating a new user.
     *
     *   - OperationType shall be set to Modify.
     *
     *   - UserIndex value shall be set for a user record with UserType NOT set to Available.
     *
     *   - UserName shall be null if modifying a user record that was not created by the accessing fabric.
     *
     *   - INVALID_COMMAND shall be returned if UserName is not null and the accessing fabric index doesn’t match the
     *     CreatorFabricIndex in the user record otherwise UserName shall be set to the value provided in the user
     *     record.
     *
     *   - UserUniqueID shall be null if modifying the user record that was not created by the accessing fabric.
     *
     *   - INVALID_COMMAND shall be returned if UserUniqueID is not null and the accessing fabric index doesn’t match
     *     the CreatorFabricIndex in the user record otherwise UserUniqueID shall be set to the value provided in the
     *     user record.
     *
     *   - UserStatus may be null causing no change to UserStatus in user record otherwise UserStatus shall be set to
     *     the value provided in the user record.
     *
     *   - UserType may be null causing no change to UserType in user record otherwise UserType shall be set to the
     *     value provided in the user record.
     *
     *   - CredentialRule may be null causing no change to CredentialRule in user record otherwise CredentialRule shall
     *     be set to the value provided in the user record.
     *
     * CreatorFabricIndex shall NOT be changed in the user record. LastModifiedFabricIndex in the new user record shall
     * be set to the accessing fabric index.
     *
     * A LockUserChange event shall be generated after successfully modifying a user.
     *
     * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall be
     * one of the following values:
     *
     *   - SUCCESS, if setting User was successful.
     *
     *   - FAILURE, if some unexpected internal error occurred setting User.
     *
     *   - OCCUPIED, if OperationType is Add and UserIndex points to an occupied slot.
     *
     *   - INVALID_COMMAND, if one or more fields violate constraints or are invalid or if OperationType is Modify and
     *     UserIndex points to an available slot.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32
     */
    export interface SetUserRequest {
        /**
         * This field shall indicate the type of operation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.1
         */
        operationType: DataOperationType;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.2
         */
        userIndex: number;

        /**
         * This field shall contain a string to use as a human readable identifier for the user.
         *
         * If UserName is null then:
         *
         *   - If the OperationType is Add, the UserName in the resulting user record shall be set to an empty string.
         *
         *   - If the OperationType is Modify, the UserName in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserName is not null, the UserName in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.3
         */
        userName: string | null;

        /**
         * This field shall indicate the fabric assigned number to use for connecting this user to other users on other
         * devices from the fabric’s perspective.
         *
         * If UserUniqueID is null then:
         *
         *   - If the OperationType is Add, the UserUniqueID in the resulting user record shall be set to default value
         *     specified above.
         *
         *   - If the OperationType is Modify, the UserUniqueID in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserUniqueID is not null, the UserUniqueID in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.4
         */
        userUniqueId: number | null;

        /**
         * This field shall indicate the UserStatus to assign to this user when created or modified.
         *
         * If UserStatus is null then:
         *
         *   - If the OperationType is Add, the UserStatus in the resulting user record shall be set to default value
         *     specified above.
         *
         *   - If the OperationType is Modify, the UserStatus in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserStatus is not null, the UserStatus in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.5
         */
        userStatus: UserStatus | null;

        /**
         * This field shall indicate the UserType to assign to this user when created or modified.
         *
         * If UserType is null then:
         *
         *   - If the OperationType is Add, the UserType in the resulting user record shall be set to default value
         *     specified above.
         *
         *   - If the OperationType is Modify, the UserType in the user record shall NOT be changed from the current
         *     value.
         *
         * If UserType is not null, the UserType in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.6
         */
        userType: UserType | null;

        /**
         * This field shall indicate the CredentialRule to use for this user.
         *
         * The valid CredentialRule enumeration values depends on the bits in the CredentialRulesBitmap map. Each bit in
         * the map identifies a valid CredentialRule that can be used.
         *
         * If CredentialRule is null then:
         *
         *   - If the OperationType is Add, the CredentialRule in the resulting user record shall be set to default
         *     value specified above.
         *
         *   - If the OperationType is Modify, the CredentialRule in the user record shall NOT be changed from the
         *     current value.
         *
         * If CredentialRule is not null, the CredentialRule in the user record shall be set to the provided value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.32.7
         */
        credentialRule: CredentialRule | null;
    }

    /**
     * Retrieve user.
     *
     * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.) as needed
     * otherwise the GetUserResponse Command shall be sent implying a status of SUCCESS.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.33
     */
    export interface GetUserRequest {
        userIndex: number;
    }

    /**
     * Returns the user for the specified UserIndex.
     *
     * If the requested UserIndex is valid and the UserStatus is Available for the requested UserIndex then UserName,
     * UserUniqueID, UserStatus, UserType, CredentialRule, Credentials, CreatorFabricIndex, and LastModifiedFabricIndex
     * shall all be null in the response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34
     */
    export interface GetUserResponse {
        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.1
         */
        userIndex: number;

        /**
         * This field shall contain a string to use as a human readable identifier for the user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.2
         */
        userName: string | null;

        /**
         * See UserUniqueID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.3
         */
        userUniqueId: number | null;

        /**
         * This field shall indicate the UserStatus assigned to the user when created or modified.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.4
         */
        userStatus: UserStatus | null;

        /**
         * This field shall indicate the UserType assigned to this user when created or modified.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.5
         */
        userType: UserType | null;

        /**
         * This field shall indicate the CredentialRule set for this user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.6
         */
        credentialRule: CredentialRule | null;

        /**
         * This field shall contain a list of credentials for this user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.7
         */
        credentials: Credential[] | null;

        /**
         * This field shall indicate the user’s creator fabric index. CreatorFabricIndex shall be null if UserStatus is
         * set to Available or when the creator fabric cannot be determined (for example, when user was created outside
         * the Interaction Model) and shall NOT be null otherwise. This value shall be set to 0 if the original creator
         * fabric was deleted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.8
         */
        creatorFabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the user’s last modifier fabric index. LastModifiedFabricIndex shall be null if
         * UserStatus is set to Available or when the modifier fabric cannot be determined (for example, when user was
         * modified outside the Interaction Model) and shall NOT be null otherwise. This value shall be set to 0 if the
         * last modifier fabric was deleted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.9
         */
        lastModifiedFabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the next occupied UserIndex in the database which is useful for quickly identifying
         * occupied user slots in the database. This shall NOT be null if there is at least one occupied entry after the
         * requested UserIndex in the User database and shall be null if there are no more occupied entries.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.34.10
         */
        nextUserIndex: number | null;
    }

    /**
     * Clears a user or all Users.
     *
     * For each user to clear, all associated credentials (e.g. PIN, RFID, fingerprint, etc.) shall be cleared and the
     * user entry values shall be reset to their default values (e.g. UserStatus shall be Available, UserType shall be
     * UnrestrictedUser) and all associated schedules shall be cleared.
     *
     * A LockUserChange event with the provided UserIndex shall be generated after successfully clearing users.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.35
     */
    export interface ClearUserRequest {
        /**
         * This field shall specify a valid User index or 0xFFFE to indicate all user slots shall be cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.35.1
         */
        userIndex: number;
    }

    /**
     * Set a credential (e.g. PIN, RFID, Fingerprint, etc.) into the lock for a new user, existing user, or
     * ProgrammingUser.
     *
     * Fields used for different use cases:
     *
     *   - OperationType shall be set to Add.
     *
     *   - UserIndex shall be set to null and the lock will find a user record with a UserStatus value of Available and
     *     associate its UserIndex with the CredentialIndex in CredentialStruct provided.
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
     * CreatorFabricIndex and LastModifiedFabricIndex in new user and credential records shall be set to the accessing
     * fabric index.
     *
     * A LockUserChange event shall be generated after successfully creating a new credential and a new user. The
     * UserIndex of this LockUserChange event shall be the UserIndex that was used to create the user. The DataIndex of
     * this LockUserChange event shall be the CredentialIndex that was used to create the credential.
     *
     *   - OperationType shall be set to Add.
     *
     *   - UserIndex shall NOT be null and shall NOT already be associated with the CredentialIndex in CredentialStruct
     *     provided otherwise INVALID_COMMAND status response shall be returned.
     *
     *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in the
     *     user record pointed to by UserIndex.
     *
     *   - CredentialIndex in CredentialStruct provided shall be for an available credential slot.
     *
     *   - UserStatus shall be null.
     *
     *   - UserType shall be null.
     *
     * CreatorFabricIndex shall NOT be changed in the user record. LastModifiedFabricIndex in the user record shall be
     * set to the accessing fabric index.
     *
     * CreatorFabricIndex and LastModifiedFabricIndex in the new credential record shall be set to the accessing fabric
     * index.
     *
     * A LockUserChange event shall be generated after successfully adding a new credential.
     *
     *   - OperationType shall be set to Modify.
     *
     *   - UserIndex value shall already be associated with the CredentialIndex in CredentialStruct provided otherwise
     *     INVALID_COMMAND status response shall be returned.
     *
     *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in the
     *     user record pointed to by UserIndex.
     *
     *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in the
     *     credential record pointed to by the CredentialIndex field value of the Credential parameter.
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
     *   - INVALID_COMMAND shall be returned if the accessing fabric index doesn’t match the CreatorFabricIndex in the
     *     credential record pointed to by the CredentialIndex field value of the Credential parameter.
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
    export interface SetCredentialRequest {
        /**
         * This field shall indicate the set credential operation type requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36.1
         */
        operationType: DataOperationType;

        /**
         * This field shall contain a credential structure that contains the CredentialTypeEnum and the credential index
         * (if applicable or 0 if not) to set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36.2
         */
        credential: Credential;

        /**
         * This field shall indicate the credential data to set for the credential being added or modified. The length
         * of the credential data shall conform to the limits of the CredentialType specified in the Credential
         * structure otherwise an INVALID_COMMAND status shall be returned in the SetCredentialResponse command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36.3
         */
        credentialData: Bytes;

        /**
         * This field shall indicate the user index to the user record that corresponds to the credential being added or
         * modified. This shall be null if OperationType is add and a new credential and user is being added at the same
         * time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36.4
         */
        userIndex: number | null;

        /**
         * This field shall indicate the user status to use in the new user record if a new user is being created. This
         * shall be null if OperationType is Modify. This may be null when adding a new credential and user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36.5
         */
        userStatus: UserStatus | null;

        /**
         * This field shall indicate the user type to use in the new user record if a new user is being created. This
         * shall be null if OperationType is Modify. This may be null when adding a new credential and user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.36.6
         */
        userType: UserType | null;
    }

    /**
     * Returns the status for setting the specified credential.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.37
     */
    export interface SetCredentialResponse {
        /**
         * Status comes from the Status Codes table and shall be one of the following values:
         *
         *   - SUCCESS, if setting user credential was successful.
         *
         *   - FAILURE, if some unexpected internal error occurred setting user credential.
         *
         *   - OCCUPIED, if OperationType is Add and CredentialIndex in Credential structure points to an occupied slot.
         *
         *   - OCCUPIED, if OperationType is Modify and CredentialIndex in Credential structure does not match the
         *     CredentialIndex that is already associated with the provided UserIndex.
         *
         *   - DUPLICATE, if CredentialData provided is a duplicate of another credential with the same CredentialType
         *     (e.g. duplicate PIN code).
         *
         *   - RESOURCE_EXHAUSTED, if OperationType is Add and the new credential cannot be added due to resource
         *     constraints such as:
         *
         *     - The user referred to by UserIndex already has NumberOfCredentialsSupportedPerUser credentials
         *       associated.
         *
         *     - The credential is of type AliroEvictableEndpointKey or AliroNonEvictableEndpointKey, and adding it
         *       would cause the total number of credentials of those two types to exceed
         *       NumberOfAliroEndpointKeysSupported.
         *
         *   - INVALID_COMMAND, if one or more fields violate constraints or are invalid.
         *
         *   - INVALID_COMMAND, if the CredentialIndex in the Credential provided exceeds the number of credentials of
         *     the provided CredentialType supported by the lock.
         *
         *   - INVALID_COMMAND, if OperationType is Modify and UserIndex points to an available slot.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.37.1
         */
        status: Status;

        /**
         * This field shall indicate the user index that was created with the new credential. If the status being
         * returned is not success then this shall be null. This shall be null if OperationType was Modify; if the
         * OperationType was Add and a new User was created this shall NOT be null and shall provide the UserIndex
         * created. If the OperationType was Add and an existing User was associated with the new credential then this
         * shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.37.2
         */
        userIndex: number | null;

        /**
         * This field shall indicate the next available index in the database for the credential type set, which is
         * useful for quickly identifying available credential slots in the database. This shall NOT be null if there is
         * at least one available entry after the requested credential index in the corresponding database and shall be
         * null if there are no more available entries. The NextCredentialIndex reported shall NOT exceed the maximum
         * number of credentials for a particular credential type.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.37.3
         */
        nextCredentialIndex?: number | null;
    }

    /**
     * Retrieve the status of a particular credential (e.g. PIN, RFID, Fingerprint, etc.) by index.
     *
     * An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, etc.) as needed
     * otherwise the GetCredentialStatusResponse command shall be sent implying a status of SUCCESS.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.38
     */
    export interface GetCredentialStatusRequest {
        /**
         * This field shall contain a credential structure that contains the CredentialTypeEnum and the credential index
         * (if applicable or 0 if not) to retrieve the status for.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.38.1
         */
        credential: Credential;
    }

    /**
     * Returns the status for the specified credential.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39
     */
    export interface GetCredentialStatusResponse {
        /**
         * This field shall indicate if the requested credential type and index exists and is populated for the
         * requested user index.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39.1
         */
        credentialExists: boolean;

        /**
         * This field shall indicate the credential’s corresponding user index value if the credential exists. If
         * CredentialType requested was ProgrammingPIN then UserIndex shall be null; otherwise, UserIndex shall be null
         * if CredentialExists is set to False and shall NOT be null if CredentialExists is set to True.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39.2
         */
        userIndex: number | null;

        /**
         * This field shall indicate the credential’s creator fabric index. CreatorFabricIndex shall be null if
         * CredentialExists is set to False or when the creator fabric cannot be determined (for example, when
         * credential was created outside the Interaction Model) and shall NOT be null otherwise. This value shall be
         * set to 0 if the original creator fabric was deleted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39.3
         */
        creatorFabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the credential’s last modifier fabric index. LastModifiedFabricIndex shall be null
         * if CredentialExists is set to False or when the modifier fabric cannot be determined (for example, when
         * credential was modified outside the Interaction Model) and shall NOT be null otherwise. This value shall be
         * set to 0 if the last modifier fabric was deleted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39.4
         */
        lastModifiedFabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the next occupied index in the database for the credential type requested, which is
         * useful for quickly identifying occupied credential slots in the database. This shall NOT be null if there is
         * at least one occupied entry after the requested credential index in the corresponding database and shall be
         * null if there are no more occupied entries. The NextCredentialIndex reported shall NOT exceed the maximum
         * number of credentials for a particular credential type.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39.5
         */
        nextCredentialIndex?: number | null;

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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.39.6
         */
        credentialData?: Bytes | null;
    }

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
     *   - CredentialIndex in Credential structure shall be set to 0xFFFE to indicate all credentials of that type shall
     *     be cleared.
     *
     * A single LockUserChange event shall be generated after successfully clearing credentials. This event shall have
     * DataIndex set to the CredentialIndex in the Credential structure.
     *
     *   - Credential field shall be null.
     *
     * The ProgrammingPIN credential shall NOT be cleared.
     *
     * For each credential type cleared, a LockUserChange event with the corresponding LockDataType shall be generated.
     * This event shall have DataIndex set to 0xFFFE.
     *
     * For each credential cleared whose user doesn’t have another valid credential, the corresponding user record shall
     * be reset back to default values and its UserStatus value shall be set to Available and UserType value shall be
     * set to UnrestrictedUser and all schedules shall be cleared. In this case a LockUserChange event shall be
     * generated for the user being cleared.
     *
     * Return status shall be one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.40
     */
    export interface ClearCredentialRequest {
        /**
         * This field shall contain a credential structure that contains the CredentialTypeEnum and the credential index
         * (0xFFFE for all credentials or 0 if not applicable) to clear. This shall be null if clearing all credential
         * types otherwise it shall NOT be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.40.1
         */
        credential: Credential | null;
    }

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
    export interface SetWeekDayScheduleRequest {
        /**
         * This field shall indicate the index of the Week Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.1
         */
        weekDayIndex: number;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.2
         */
        userIndex: number;

        /**
         * This field shall indicate which week days the schedule is active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.3
         */
        daysMask: DaysMask;

        /**
         * This field shall indicate the starting hour for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.4
         */
        startHour: number;

        /**
         * This field shall indicate the starting minute for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.5
         */
        startMinute: number;

        /**
         * This field shall indicate the ending hour for the Week Day schedule. EndHour shall be equal to or greater
         * than StartHour.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.6
         */
        endHour: number;

        /**
         * This field shall indicate the ending minute for the Week Day schedule. If EndHour is equal to StartHour then
         * EndMinute shall be greater than StartMinute.
         *
         * If the EndHour is equal to 23 and the EndMinute is equal to 59 the Lock shall grant access to the user up
         * until 23:59:59.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.12.7
         */
        endMinute: number;
    }

    /**
     * Retrieve the specific weekly schedule for the specific user.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.13
     */
    export interface GetWeekDayScheduleRequest {
        weekDayIndex: number;
        userIndex: number;
    }

    /**
     * Returns the weekly repeating schedule data for the specified schedule index.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14
     */
    export interface GetWeekDayScheduleResponse {
        /**
         * This field shall indicate the index of the Week Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.1
         */
        weekDayIndex: number;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.2
         */
        userIndex: number;

        /**
         * Status shall be one of the following values:
         *
         *   - SUCCESS if both WeekDayIndex and UserIndex are valid and there is a corresponding schedule entry.
         *
         *   - INVALID_COMMAND if either WeekDayIndex and/or UserIndex values are not within valid range
         *
         *   - NOT_FOUND if no corresponding schedule entry found for WeekDayIndex.
         *
         *   - NOT_FOUND if no corresponding user entry found for UserIndex.
         *
         * If this field is SUCCESS, the optional fields for this command shall be present. For other (error) status
         * values, only the fields up to the status field shall be present.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.3
         */
        status: Status;

        daysMask?: DaysMask;

        /**
         * This field shall indicate the starting hour for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.4
         */
        startHour?: number;

        /**
         * This field shall indicate the starting minute for the Week Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.5
         */
        startMinute?: number;

        /**
         * This field shall indicate the ending hour for the Week Day schedule. EndHour shall be equal to or greater
         * than StartHour.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.6
         */
        endHour?: number;

        /**
         * This field shall indicate the ending minute for the Week Day schedule. If EndHour is equal to StartHour then
         * EndMinute shall be greater than StartMinute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.14.7
         */
        endMinute?: number;
    }

    /**
     * Clear the specific weekly schedule or all weekly schedules for the specific user.
     *
     * Return status shall be one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.15
     */
    export interface ClearWeekDayScheduleRequest {
        /**
         * This field shall indicate the Week Day schedule index to clear or 0xFE to clear all Week Day schedules for
         * the specified user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.15.1
         */
        weekDayIndex: number;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.15.2
         */
        userIndex: number;
    }

    /**
     * Set a time-specific schedule ID for a specified user.
     *
     * The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Year Day schedule is set.
     *
     * Return status shall be one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16
     */
    export interface SetYearDayScheduleRequest {
        /**
         * This field shall indicate the index of the Year Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16.1
         */
        yearDayIndex: number;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16.2
         */
        userIndex: number;

        /**
         * This field shall indicate the starting time for the Year Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16.3
         */
        localStartTime: number;

        /**
         * This field shall indicate the ending time for the Year Day schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime shall be
         * greater than LocalStartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.16.4
         */
        localEndTime: number;
    }

    /**
     * Retrieve the specific year day schedule for the specific schedule and user indexes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.17
     */
    export interface GetYearDayScheduleRequest {
        yearDayIndex: number;
        userIndex: number;
    }

    /**
     * Returns the year day schedule data for the specified schedule and user indexes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.18
     */
    export interface GetYearDayScheduleResponse {
        /**
         * This field shall indicate the index of the Year Day schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.18.1
         */
        yearDayIndex: number;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.18.2
         */
        userIndex: number;

        /**
         * Status shall be one of the following values:
         *
         *   - SUCCESS if both YearDayIndex and UserIndex are valid and there is a corresponding schedule entry.
         *
         *   - INVALID_COMMAND if either YearDayIndex and/or UserIndex values are not within valid range
         *
         *   - NOT_FOUND if no corresponding schedule entry found for YearDayIndex.
         *
         *   - NOT_FOUND if no corresponding user entry found for UserIndex.
         *
         * If this field is SUCCESS, the optional fields for this command shall be present. For other (error) status
         * values, only the fields up to the status field shall be present.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.18.3
         */
        status: Status;

        /**
         * This field shall indicate the starting time for the Year Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value. This shall be
         * null if the schedule is not set for the YearDayIndex and UserIndex provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.18.4
         */
        localStartTime?: number;

        /**
         * This field shall indicate the ending time for the Year Day schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime shall be
         * greater than LocalStartTime. This shall be null if the schedule is not set for the YearDayIndex and UserIndex
         * provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.18.5
         */
        localEndTime?: number;
    }

    /**
     * Clears the specific year day schedule or all year day schedules for the specific user.
     *
     * Return status shall be one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.19
     */
    export interface ClearYearDayScheduleRequest {
        /**
         * This field shall indicate the Year Day schedule index to clear or 0xFE to clear all Year Day schedules for
         * the specified user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.19.1
         */
        yearDayIndex: number;

        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.19.2
         */
        userIndex: number;
    }

    /**
     * Set the holiday Schedule by specifying local start time and local end time with respect to any Lock Operating
     * Mode.
     *
     * Return status shall be one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20
     */
    export interface SetHolidayScheduleRequest {
        /**
         * This field shall indicate the index of the Holiday schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20.1
         */
        holidayIndex: number;

        /**
         * This field shall indicate the starting time for the Holiday Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20.2
         */
        localStartTime: number;

        /**
         * This field shall indicate the ending time for the Holiday Day schedule in Epoch Time in Seconds with local
         * time offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime
         * shall be greater than LocalStartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20.3
         */
        localEndTime: number;

        /**
         * This field shall indicate the operating mode to use during this Holiday schedule start/end time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.20.4
         */
        operatingMode: OperatingMode;
    }

    /**
     * Get the holiday schedule for the specified index.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.21
     */
    export interface GetHolidayScheduleRequest {
        holidayIndex: number;
    }

    /**
     * Returns the Holiday Schedule Entry for the specified Holiday ID.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.22
     */
    export interface GetHolidayScheduleResponse {
        /**
         * This field shall indicate the index of the Holiday schedule.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.22.1
         */
        holidayIndex: number;

        /**
         * Status shall be one of the following values:
         *
         *   - FAILURE if the attribute NumberOfHolidaySchedulesSupported is zero.
         *
         *   - SUCCESS if the HolidayIndex is valid and there is a corresponding schedule entry.
         *
         *   - INVALID_COMMAND if the HolidayIndex is not within valid range
         *
         *   - NOT_FOUND if the HolidayIndex is within the valid range, however, there is not corresponding schedule
         *     entry found.
         *
         * If this field is SUCCESS, the optional fields for this command shall be present. For other (error) status
         * values, only the fields up to the status field shall be present.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.22.2
         */
        status: Status;

        /**
         * This field shall indicate the starting time for the Holiday schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. This shall be null if
         * the schedule is not set for the HolidayIndex provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.22.3
         */
        localStartTime?: number | null;

        /**
         * This field shall indicate the ending time for the Holiday schedule in Epoch Time in Seconds with local time
         * offset based on the local timezone and DST offset on the day represented by the value. LocalEndTime shall be
         * greater than LocalStartTime. This shall be null if the schedule is not set for the HolidayIndex provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.22.4
         */
        localEndTime?: number | null;

        /**
         * This field shall indicate the operating mode to use during this Holiday schedule start/end time. This shall
         * be null if the schedule is not set for the HolidayIndex provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.22.5
         */
        operatingMode?: OperatingMode | null;
    }

    /**
     * Clears the holiday schedule or all holiday schedules.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.23
     */
    export interface ClearHolidayScheduleRequest {
        /**
         * This field shall indicate the Holiday schedule index to clear or 0xFE to clear all Holiday schedules.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.23.1
         */
        holidayIndex: number;
    }

    /**
     * Set a PIN Code into the lock.
     *
     * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall be
     * one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.4
     */
    export interface SetPinCodeRequest {
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.4.1
         */
        userId: number;

        /**
         * This field shall indicate the user status. Only the values 1 (Occupied/Enabled) and 3 (Occupied/Disabled) are
         * allowed for UserStatus.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.4.2
         */
        userStatus: UserStatus | null;

        userType: UserType | null;
        pin: Bytes;
    }

    /**
     * Retrieve a PIN Code.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.5
     */
    export interface GetPinCodeRequest {
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.5.1
         */
        userId: number;
    }

    /**
     * Returns the PIN for the specified user ID.
     *
     * If the requested UserID is valid and the Code doesn’t exist, Get RFID Code Response shall have the following
     * format:
     *
     * UserID = requested User ID
     *
     * UserStatus = 0 (Available)
     *
     * UserType = Null (Not supported)
     *
     * PINCode = 0 (zero length)
     *
     * If the requested UserID is invalid, send Default Response with an error status. The error status shall be equal
     * to CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and NOT_FOUND if greater than or
     * equal to the max number of users supported.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.6
     */
    export interface GetPinCodeResponse {
        userId: number;
        userStatus: UserStatus | null;
        userType: UserType | null;
        pinCode: Bytes | null;
    }

    /**
     * Clear a PIN code or all PIN codes.
     *
     * For each PIN Code cleared whose user doesn’t have a RFID Code or other credential type, then corresponding user
     * record’s UserStatus value shall be set to Available, and UserType value shall be set to UnrestrictedUser and all
     * schedules shall be cleared.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.7
     */
    export interface ClearPinCodeRequest {
        /**
         * This field shall specify a valid PIN code slot index or 0xFFFE to indicate all PIN code slots shall be
         * cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.7.1
         */
        pinSlotIndex: number;
    }

    /**
     * This command allows communicating an Aliro Reader configuration, as defined in [Aliro], to the lock.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42
     */
    export interface SetAliroReaderConfigRequest {
        /**
         * This field shall indicate the signing key component of the Reader’s key pair.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42.1
         */
        signingKey: Bytes;

        /**
         * This field shall indicate the verification key component of the Reader’s key pair. This shall be an
         * uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42.2
         */
        verificationKey: Bytes;

        /**
         * This field shall indicate the reader group identifier for the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42.3
         */
        groupIdentifier: Bytes;

        /**
         * This field shall indicate the group resolving key for the lock.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.42.4
         */
        groupResolvingKey?: Bytes;
    }

    /**
     * Set the status of a user ID.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.9
     */
    export interface SetUserStatusRequest {
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.9.1
         */
        userId: number;

        /**
         * UserStatus value of Available is not allowed. In order to clear a user id, the ClearUser Command shall be
         * used. For user status value please refer to UserStatusEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.9.2
         */
        userStatus: UserStatus;
    }

    /**
     * Get the status of a user.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.10
     */
    export interface GetUserStatusRequest {
        /**
         * This field shall indicate the user ID. The value of the UserID field shall be between 0 and the value of the
         * NumberOfPINUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.10.1
         */
        userId: number;
    }

    /**
     * Returns the user status for the specified user ID.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.11
     */
    export interface GetUserStatusResponse {
        /**
         * This field shall indicate the user ID provided in the request.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.11.1
         */
        userId: number;

        /**
         * This field shall indicate the current status of the requested user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.11.2
         */
        userStatus: UserStatus;
    }

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
    export interface SetUserTypeRequest {
        /**
         * This field shall indicate the user ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.24.1
         */
        userId: number;

        /**
         * This field shall indicate the user type.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.24.2
         */
        userType: UserType;
    }

    /**
     * Retrieve the user type for a specific user.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.25
     */
    export interface GetUserTypeRequest {
        userId: number;
    }

    /**
     * Returns the user type for the specified user ID. If the requested User ID is invalid, send Default Response with
     * an error status equal to FAILURE.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.26
     */
    export interface GetUserTypeResponse {
        userId: number;
        userType: UserType;
    }

    /**
     * Set an ID for RFID access into the lock.
     *
     * Return status is a global status code or a cluster-specific status code from the Status Codes table and shall be
     * one of the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.27
     */
    export interface SetRfidCodeRequest {
        /**
         * This field shall indicate the user ID.
         *
         * The value of the UserID field shall be between 0 and the value of the NumberOfRFIDUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.27.1
         */
        userId: number;

        /**
         * This field shall indicate what the status is for a specific user ID. The values are according to “Set PIN”
         * while not all are supported.
         *
         * Only the values 1 (Occupied/Enabled) and 3 (Occupied/Disabled) are allowed for UserStatus.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.27.2
         */
        userStatus: UserStatus | null;

        /**
         * The values are the same as used for SetPINCode command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.27.3
         */
        userType: UserType | null;

        rfidCode: Bytes;
    }

    /**
     * Retrieve an RFID code.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.28
     */
    export interface GetRfidCodeRequest {
        /**
         * This field shall indicate the user ID.
         *
         * The value of the UserID field shall be between 0 and the value of the NumberOfRFIDUsersSupported attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.28.1
         */
        userId: number;
    }

    /**
     * Returns the RFID code for the specified user ID.
     *
     * If the requested User ID is valid and the Code doesn’t exist, Get RFID Code Response shall have the following
     * format:
     *
     * User ID = requested User ID
     *
     * UserStatus = 0 (available)
     *
     * UserType = 0xFF (not supported)
     *
     * RFID Code = 0 (zero length)
     *
     * If requested User ID is invalid, send Default Response with an error status. The error status shall be equal to
     * CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and NOT_FOUND if greater than or
     * equal to the max number of users supported.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.29
     */
    export interface GetRfidCodeResponse {
        userId: number;
        userStatus: UserStatus | null;
        userType: UserType | null;
        rfidCode: Bytes | null;
    }

    /**
     * Clear an RFID code or all RFID codes.
     *
     * For each RFID Code cleared whose user doesn’t have a PIN Code or other credential type, then the corresponding
     * user record’s UserStatus value shall be set to Available, and UserType value shall be set to UnrestrictedUser and
     * all schedules shall be cleared.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.30
     */
    export interface ClearRfidCodeRequest {
        /**
         * This field shall indicate a valid RFID code slot index or 0xFFFE to indicate all RFID code slots shall be
         * cleared.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.30.1
         */
        rfidSlotIndex: number;
    }

    /**
     * This command causes the lock device to unlock the door without pulling the latch. This command includes an
     * optional code for the lock. The door lock may require a code depending on the value of the
     * RequirePINForRemoteOperation attribute.
     *
     * > [!NOTE]
     *
     * > If the attribute AutoRelockTime is supported, the lock will transition to the locked state when the auto relock
     *   time has expired.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.41
     */
    export interface UnboltDoorRequest {
        /**
         * See Section 5.2.10.1.1, “PINCode Field”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.10.41.1
         */
        pinCode?: Bytes;
    }

    /**
     * The door lock server provides several alarms which can be sent when there is a critical state on the door lock.
     * The alarms available for the door lock server are listed in AlarmCodeEnum.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.1
     */
    export interface DoorLockAlarmEvent {
        /**
         * This field shall indicate the alarm code of the event that has happened.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.1.1
         */
        alarmCode: AlarmCode;
    }

    /**
     * The door lock server sends out a LockOperation event when the event is triggered by the various lock operation
     * sources.
     *
     *   - If the door lock server supports the Unbolt Door command, it shall generate a LockOperation event with
     *     LockOperationType set to Unlock after an Unbolt Door command succeeds.
     *
     *   - If the door lock server supports the Unbolting feature and an Unlock Door command is performed, it shall
     *     generate a LockOperation event with LockOperationType set to Unlatch when the unlatched state is reached and
     *     a LockOperation event with LockOperationType set to Unlock when the lock successfully completes the unlock →
     *     hold latch → release latch and return to unlock state operation.
     *
     *   - If the command fails during holding or releasing the latch but after passing the unlocked state, the door
     *     lock server shall generate a LockOperationError event with LockOperationType set to Unlatch and a
     *     LockOperation event with LockOperationType set to Unlock.
     *
     *     - If it fails before reaching the unlocked state, the door lock server shall generate only a
     *       LockOperationError event with LockOperationType set to Unlock.
     *
     *   - Upon manual actuation, a door lock server that supports the Unbolting feature:
     *
     *     - shall generate a LockOperation event of LockOperationType Unlatch when it is actuated from the outside.
     *
     *     - may generate a LockOperation event of LockOperationType Unlatch when it is actuated from the inside.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3
     */
    export interface LockOperationEvent {
        /**
         * This field shall indicate the type of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3.1
         */
        lockOperationType: LockOperationType;

        /**
         * This field shall indicate the source of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3.2
         */
        operationSource: OperationSource;

        /**
         * This field shall indicate the UserIndex who performed the lock operation. This shall be null if there is no
         * user index that can be determined for the given operation source. This shall NOT be null if a user index can
         * be determined. In particular, this shall NOT be null if the operation was associated with a valid credential.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3.3
         */
        userIndex: number | null;

        /**
         * This field shall indicate the fabric index of the fabric that performed the lock operation. This shall be
         * null if there is no fabric that can be determined for the given operation source. This shall NOT be null if
         * the operation source is "Remote".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3.4
         */
        fabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the Node ID of the node that performed the lock operation. This shall be null if
         * there is no Node associated with the given operation source. This shall NOT be null if the operation source
         * is "Remote".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3.5
         */
        sourceNode: NodeId | null;

        /**
         * This field shall indicate the list of credentials used in performing the lock operation. This shall be null
         * if no credentials were involved.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.3.6
         */
        credentials?: Credential[] | null;
    }

    /**
     * The door lock server sends out a LockOperationError event when a lock operation fails for various reasons.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4
     */
    export interface LockOperationErrorEvent {
        /**
         * This field shall indicate the type of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.1
         */
        lockOperationType: LockOperationType;

        /**
         * This field shall indicate the source of the lock operation that was performed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.2
         */
        operationSource: OperationSource;

        /**
         * This field shall indicate the lock operation error triggered when the operation was performed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.3
         */
        operationError: OperationError;

        /**
         * This field shall indicate the lock UserIndex who performed the lock operation. This shall be null if there is
         * no user id that can be determined for the given operation source.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.4
         */
        userIndex: number | null;

        /**
         * This field shall indicate the fabric index of the fabric that performed the lock operation. This shall be
         * null if there is no fabric that can be determined for the given operation source. This shall NOT be null if
         * the operation source is "Remote".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.5
         */
        fabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the Node ID of the node that performed the lock operation. This shall be null if
         * there is no Node associated with the given operation source. This shall NOT be null if the operation source
         * is "Remote".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.6
         */
        sourceNode: NodeId | null;

        /**
         * This field shall indicate the list of credentials used in performing the lock operation. This shall be null
         * if no credentials were involved.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.4.7
         */
        credentials?: Credential[] | null;
    }

    /**
     * The door lock server sends out a DoorStateChange event when the door lock door state changes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.2
     */
    export interface DoorStateChangeEvent {
        /**
         * This field shall indicate the new door state for this door event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.2.1
         */
        doorState: DoorState;
    }

    /**
     * The door lock server sends out a LockUserChange event when a lock user, schedule, or credential change has
     * occurred.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5
     */
    export interface LockUserChangeEvent {
        /**
         * This field shall indicate the lock data type that was changed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.1
         */
        lockDataType: LockDataType;

        /**
         * This field shall indicate the data operation performed on the lock data type changed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.2
         */
        dataOperationType: DataOperationType;

        /**
         * This field shall indicate the source of the user data change.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.3
         */
        operationSource: OperationSource;

        /**
         * This field shall indicate the lock UserIndex associated with the change (if any). This shall be null if there
         * is no specific user associated with the data operation. This shall be 0xFFFE if all users are affected (e.g.
         * Clear Users).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.4
         */
        userIndex: number | null;

        /**
         * This field shall indicate the fabric index of the fabric that performed the change (if any). This shall be
         * null if there is no fabric that can be determined to have caused the change. This shall NOT be null if the
         * operation source is "Remote".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.5
         */
        fabricIndex: FabricIndex | null;

        /**
         * This field shall indicate the Node ID that performed the change (if any). The Node ID of the node that
         * performed the change. This shall be null if there was no Node involved in the change. This shall NOT be null
         * if the operation source is "Remote".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.6
         */
        sourceNode: NodeId | null;

        /**
         * This field shall indicate the index of the specific item that was changed (e.g. schedule, PIN, RFID, etc.) in
         * the list of items identified by LockDataType. This shall be null if the LockDataType does not correspond to a
         * list that can be indexed into (e.g. ProgrammingUser). This shall be 0xFFFE if all indices are affected (e.g.
         * ClearPINCode, ClearRFIDCode, ClearWeekDaySchedule, ClearYearDaySchedule, etc.).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.11.5.7
         */
        dataIndex: number | null;
    }

    /**
     * This bitmap shall indicate the days of the week the Week Day schedule applies for.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.1
     */
    export interface DaysMask {
        /**
         * Schedule is applied on Sunday
         */
        sunday?: boolean;

        /**
         * Schedule is applied on Monday
         */
        monday?: boolean;

        /**
         * Schedule is applied on Tuesday
         */
        tuesday?: boolean;

        /**
         * Schedule is applied on Wednesday
         */
        wednesday?: boolean;

        /**
         * Schedule is applied on Thursday
         */
        thursday?: boolean;

        /**
         * Schedule is applied on Friday
         */
        friday?: boolean;

        /**
         * Schedule is applied on Saturday
         */
        saturday?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.6
     */
    export interface AlarmMask {
        /**
         * Locking Mechanism Jammed
         */
        lockJammed?: boolean;

        /**
         * Lock Reset to Factory Defaults
         */
        lockFactoryReset?: boolean;

        /**
         * RF Module Power Cycled
         */
        lockRadioPowerCycled?: boolean;

        /**
         * Tamper Alarm - wrong code entry limit
         */
        wrongCodeEntryLimit?: boolean;

        /**
         * Tamper Alarm - front escutcheon removed from main
         */
        frontEscutcheonRemoved?: boolean;

        /**
         * Forced Door Open under Door Locked Condition
         */
        doorForcedOpen?: boolean;
    }

    /**
     * This enumeration shall indicate the alarm type.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.7
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
     * This enumeration shall indicate the credential rule that can be applied to a particular user.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.8
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
     * This enumeration shall indicate the credential type.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.9
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.9.1
         */
        AliroCredentialIssuerKey = 6,

        /**
         * An Endpoint public key as defined in [Aliro] which can be evicted if space is needed for another endpoint key
         *
         * Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in section 2.3.3
         * of SEC 1.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.9.2
         */
        AliroEvictableEndpointKey = 7,

        /**
         * An Endpoint public key as defined in [Aliro] which cannot be evicted if space is needed for another endpoint
         * key
         *
         * Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in section 2.3.3
         * of SEC 1.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.9.3
         */
        AliroNonEvictableEndpointKey = 8
    }

    /**
     * This enumeration shall indicate the data operation performed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.10
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
     * This enumeration shall indicate the data type that is being or has changed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.12
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
     * This enumeration shall indicate the type of Lock operation performed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.13
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
     * This enumeration shall indicate the error cause of the Lock/Unlock operation performed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.14
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
     * This enumeration shall indicate the source of the Lock/Unlock or user change operation performed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.16
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
     * This enumeration shall indicate what the status is for a specific user ID.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.17
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18
     */
    export enum UserType {
        /**
         * The user ID type is unrestricted
         *
         * This value shall indicate the user has access 24/7 provided proper PIN or RFID is supplied (e.g., owner).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.1
         */
        UnrestrictedUser = 0,

        /**
         * The user ID type is schedule
         *
         * This value shall indicate the user has the ability to open lock within a specific time period (e.g., guest).
         *
         * When UserType is set to YearDayScheduleUser, user access shall be restricted as follows:
         *
         *   - If no YearDaySchedules are set for the user, then access shall be denied
         *
         *   - If one or more YearDaySchedules are set, user access shall be granted if and only if the current time
         *     falls within at least one of the YearDaySchedules. If current time is not known, user access shall NOT be
         *     granted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.2
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
         *   - If no WeekDaySchedules are set for the user, then access shall be denied
         *
         *   - If one or more WeekDaySchedules are set, user access shall be granted if and only if the current time
         *     falls within at least one of the WeekDaySchedules. If current time is not known, user access shall NOT be
         *     granted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.3
         */
        WeekDayScheduleUser = 2,

        /**
         * The user ID type is programming
         *
         * This value shall indicate the user has the ability to both program and operate the door lock. This user can
         * manage the users and user schedules. In all other respects this user matches the unrestricted (default) user.
         * ProgrammingUser is the only user that can disable the user interface (keypad, remote, etc…).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.4
         */
        ProgrammingUser = 3,

        /**
         * The user ID type is non access
         *
         * This value shall indicate the user is recognized by the lock but does not have the ability to open the lock.
         * This user will only cause the lock to generate the appropriate event notification to any bound devices.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.5
         */
        NonAccessUser = 4,

        /**
         * The user ID type is forced
         *
         * This value shall indicate the user has the ability to open lock but a ForcedUser LockOperationType and
         * ForcedUser silent alarm will be emitted to allow a notified Node to alert emergency services or contacts on
         * the user account when used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.6
         */
        ForcedUser = 5,

        /**
         * The user ID type is disposable
         *
         * This value shall indicate the user has the ability to open lock once after which the lock shall change the
         * corresponding user record UserStatus value to OccupiedDisabled automatically.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.7
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.8
         */
        ExpiringUser = 7,

        /**
         * The user ID type is schedule restricted
         *
         * This value shall indicate the user access is restricted by Week Day and/or Year Day schedule.
         *
         * When UserType is set to ScheduleRestrictedUser, user access shall be restricted as follows:
         *
         *   - If no WeekDaySchedules and no YearDaySchedules are set for the user, then access shall be denied
         *
         *   - If one or more WeekDaySchedules are set, but no YearDaySchedules are set for the user, then user access
         *     shall be equivalent to the WeekDayScheduleUser UserType
         *
         *   - If one or more YearDaySchedules are set, but no WeekDaySchedules are set for the user, then user access
         *     shall be equivalent to the YearDayScheduleUser UserType
         *
         *   - If one or WeekDaySchedules are set AND one or more YearDaySchedules are set, then user access shall be
         *     granted if and only if the current time falls within at least one of the WeekDaySchedules AND the current
         *     time falls within at least one of the YearDaySchedules.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.9
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.18.10
         */
        RemoteOnlyUser = 9
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.23
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
     * This struct shall indicate the credential types and their corresponding indices (if any) for the event or user
     * record.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.24
     */
    export interface Credential {
        /**
         * This field shall indicate the credential field used to authorize the lock operation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.24.1
         */
        credentialType: CredentialType;

        /**
         * This field shall indicate the index of the specific credential used to authorize the lock operation in the
         * list of credentials identified by CredentialType (e.g. PIN, RFID, etc.). This field shall be set to 0 if
         * CredentialType is ProgrammingPIN or does not correspond to a list that can be indexed into.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.2.6.24.2
         */
        credentialIndex: number;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.7.1
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.7.1
     */
    export class DuplicateError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.Occupied}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.2.7.1
     */
    export class OccupiedError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link DoorLock}.
     */
    export const Cluster: typeof DoorLock;

    /**
     * @deprecated Use {@link DoorLock}.
     */
    export const Complete: typeof DoorLock;

    export const Typing: DoorLock;
}

/**
 * @deprecated Use {@link DoorLock}.
 */
export declare const DoorLockCluster: typeof DoorLock;

export interface DoorLock extends ClusterTyping {
    Attributes: DoorLock.Attributes;
    Commands: DoorLock.Commands;
    Events: DoorLock.Events;
    Features: DoorLock.Features;
    Components: DoorLock.Components;
}

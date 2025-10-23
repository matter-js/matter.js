/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "DoorLock", classification: "application", pics: "DRLK", xref: "cluster§5.2",
        details: "The door lock cluster provides an interface to a generic way to secure a door. The physical object " +
            "that provides the locking functionality is abstracted from the cluster. The cluster has a small list " +
            "of mandatory attributes and functions and a list of optional features.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§5.2.4",

                children: [
                    {
                        tag: "field", name: "PIN", xref: "cluster§5.2.4.1",

                        details: "If the User Feature is also supported then any PIN Code stored in the lock shall be associated with " +
                            "a User." +
                            "\n" +
                            "A lock may support multiple credential types so if the User feature is supported the UserType, " +
                            "UserStatus and Schedules are all associated with a User index and not directly with a PIN index. A " +
                            "User index may have several credentials associated with it."
                    },

                    {
                        tag: "field", name: "RID", xref: "cluster§5.2.4.2",

                        details: "If the User Feature is also supported then any RFID credential stored in the lock shall be " +
                            "associated with a User." +
                            "\n" +
                            "A lock may support multiple credential types so if the User feature is supported the UserType, " +
                            "UserStatus and Schedules are all associated with a User index and not directly with a RFID index. A " +
                            "User Index may have several credentials associated with it."
                    },

                    {
                        tag: "field", name: "FGP", xref: "cluster§5.2.4.3",

                        details: "Currently the cluster only defines the metadata format for notifications when a fingerprint/ finger " +
                            "vein credential is used to access the lock and doesn’t describe how to create fingerprint/finger " +
                            "vein credentials. If the Users feature is also supported then the User that a fingerprint/finger " +
                            "vein is associated with can also have its UserType, UserStatus and Schedule modified." +
                            "\n" +
                            "A lock may support multiple credential types so if the User feature is supported the UserType, " +
                            "UserStatus and Schedules are all associated with a User index and not directly with a Finger index. " +
                            "A User Index may have several credentials associated with it."
                    },

                    {
                        tag: "field", name: "WDSCH", xref: "cluster§5.2.4.4",

                        details: "If the User feature is supported then Week Day Schedules are applied to a User and not a credential." +
                            "\n" +
                            "Week Day Schedules are used to restrict access to a specified time window on certain days of the " +
                            "week. The schedule is repeated each week." +
                            "\n" +
                            "The lock may automatically adjust the UserType when a schedule is created or cleared." +
                            "\n" +
                            "Support for WeekDayAccessSchedules requires that the lock has the capability of keeping track of " +
                            "local time."
                    },

                    {
                        tag: "field", name: "DPS", xref: "cluster§5.2.4.5",
                        details: "If this feature is supported this indicates that the lock has the ability to determine the position " +
                            "of the door which is separate from the state of the lock."
                    },

                    {
                        tag: "field", name: "FACE", xref: "cluster§5.2.4.6",

                        details: "Currently the cluster only defines the metadata format for notifications when a face recognition, " +
                            "iris, or retina credential is used to access the lock and doesn’t describe how to create face " +
                            "recognition, iris, or retina credentials. If the Users feature is also supported then the User that " +
                            "a face recognition, iris, or retina credential is associated with can also have its UserType, " +
                            "UserStatus and Schedule modified." +
                            "\n" +
                            "A lock may support multiple credential types so if the User feature is supported the UserType, " +
                            "UserStatus and Schedules are all associated with a User and not directly with a credential."
                    },

                    {
                        tag: "field", name: "COTA", xref: "cluster§5.2.4.7",
                        details: "If this feature is supported then the lock supports the ability to verify a credential provided in a " +
                            "lock/unlock command. Currently the cluster only supports providing the PIN credential to the " +
                            "lock/unlock commands. If this feature is supported then the PIN Credential feature shall also be " +
                            "supported."
                    },

                    {
                        tag: "field", name: "USR", xref: "cluster§5.2.4.8",
                        details: "If the User Feature is supported then a lock employs a User database. A User within the User " +
                            "database is used to associate credentials and schedules to single user record within the lock. This " +
                            "also means the UserType and UserStatus fields are associated with a User and not a credential."
                    },

                    {
                        tag: "field", name: "YDSCH", xref: "cluster§5.2.4.9",

                        details: "If the User feature is supported then Year Day Schedules are applied to a User and not a credential. " +
                            "Year Day Schedules are used to restrict access to a specified date and time window." +
                            "\n" +
                            "The lock may automatically adjust the UserType when a schedule is created or cleared." +
                            "\n" +
                            "Support for YearDayAccessSchedules requires that the lock has the capability of keeping track of " +
                            "local time."
                    },

                    {
                        tag: "field", name: "HDSCH", xref: "cluster§5.2.4.10",
                        details: "This feature is used to setup Holiday Schedule in the lock device. A Holiday Schedule sets a start " +
                            "and stop end date/time for the lock to use the specified operating mode set by the Holiday Schedule." +
                            "\n" +
                            "Support for HolidaySchedules requires that the lock has the capability of keeping track of local " +
                            "time."
                    },

                    {
                        tag: "field", name: "UBOLT", xref: "cluster§5.2.4.11",
                        details: "Locks that support this feature differentiate between unbolting and unlocking. The Unbolt Door " +
                            "command retracts the bolt without pulling the latch. The Unlock Door command fully unlocks the door " +
                            "by retracting the bolt and briefly pulling the latch. While the latch is pulled, the lock state " +
                            "changes to Unlatched. Locks without unbolting support don’t differentiate between unbolting and " +
                            "unlocking and perform the same operation for both commands."
                    },

                    {
                        tag: "field", name: "ALIRO", xref: "cluster§5.2.4.12",
                        details: "Locks that support this feature implement the Aliro specification as defined in [Aliro] and support " +
                            "Matter as a method for provisioning Aliro credentials."
                    },
                    {
                        tag: "field", name: "ALBU", xref: "cluster§5.2.4.13",
                        details: "Locks that support this feature implement the Bluetooth LE + UWB Access Control Flow as defined in " +
                            "[Aliro]."
                    }
                ]
            },

            {
                tag: "attribute", name: "LockState", xref: "cluster§5.2.9.1",

                details: "This attribute may be NULL if the lock hardware does not currently know the status of the locking " +
                    "mechanism. For example, a lock may not know the LockState status after a power cycle until the first " +
                    "lock actuation is completed." +
                    "\n" +
                    "The Not Fully Locked value is used by a lock to indicate that the state of the lock is somewhere " +
                    "between Locked and Unlocked so it is only partially secured. For example, a deadbolt could be " +
                    "partially extended and not in a dead latched state."
            },

            {
                tag: "attribute", name: "LockType", xref: "cluster§5.2.9.2",
                details: "Indicates the type of door lock as defined in LockTypeEnum."
            },
            {
                tag: "attribute", name: "ActuatorEnabled", xref: "cluster§5.2.9.3",
                details: "Indicates if the lock is currently able to (Enabled) or not able to (Disabled) process remote Lock, " +
                    "Unlock, or Unlock with Timeout commands."
            },

            {
                tag: "attribute", name: "DoorState", xref: "cluster§5.2.9.4",
                details: "Indicates the current door state as defined in DoorStateEnum." +
                    "\n" +
                    "Null only if an internal error prevents the retrieval of the current door state."
            },

            {
                tag: "attribute", name: "DoorOpenEvents", xref: "cluster§5.2.9.5",
                details: "This attribute shall hold the number of door open events that have occurred since it was last " +
                    "zeroed."
            },
            {
                tag: "attribute", name: "DoorClosedEvents", xref: "cluster§5.2.9.6",
                details: "This attribute shall hold the number of door closed events that have occurred since it was last " +
                    "zeroed."
            },
            {
                tag: "attribute", name: "OpenPeriod", xref: "cluster§5.2.9.7",
                details: "This attribute shall hold the number of minutes the door has been open since the last time it " +
                    "transitioned from closed to open."
            },
            {
                tag: "attribute", name: "NumberOfTotalUsersSupported", xref: "cluster§5.2.9.8",
                details: "Indicates the number of total users supported by the lock."
            },
            {
                tag: "attribute", name: "NumberOfPinUsersSupported", xref: "cluster§5.2.9.9",
                details: "Indicates the number of PIN users supported."
            },
            {
                tag: "attribute", name: "NumberOfRfidUsersSupported", xref: "cluster§5.2.9.10",
                details: "Indicates the number of RFID users supported."
            },
            {
                tag: "attribute", name: "NumberOfWeekDaySchedulesSupportedPerUser", xref: "cluster§5.2.9.11",
                details: "Indicates the number of configurable week day schedule supported per user."
            },
            {
                tag: "attribute", name: "NumberOfYearDaySchedulesSupportedPerUser", xref: "cluster§5.2.9.12",
                details: "Indicates the number of configurable year day schedule supported per user."
            },
            {
                tag: "attribute", name: "NumberOfHolidaySchedulesSupported", xref: "cluster§5.2.9.13",
                details: "Indicates the number of holiday schedules supported for the entire door lock device."
            },
            {
                tag: "attribute", name: "MaxPinCodeLength", xref: "cluster§5.2.9.14",
                details: "Indicates the maximum length in bytes of a PIN Code on this device."
            },
            {
                tag: "attribute", name: "MinPinCodeLength", xref: "cluster§5.2.9.15",
                details: "Indicates the minimum length in bytes of a PIN Code on this device."
            },

            {
                tag: "attribute", name: "MaxRfidCodeLength", xref: "cluster§5.2.9.16",
                details: "Indicates the maximum length in bytes of a RFID Code on this device. The value depends on the RFID " +
                    "code range specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID " +
                    "code, a value of 20 (equals 10 Byte ISO 14443A UID) is recommended."
            },

            {
                tag: "attribute", name: "MinRfidCodeLength", xref: "cluster§5.2.9.17",
                details: "Indicates the minimum length in bytes of a RFID Code on this device. The value depends on the RFID " +
                    "code range specified by the manufacturer, if media anti-collision identifiers (UID) are used as RFID " +
                    "code, a value of 8 (equals 4 Byte ISO 14443A UID) is recommended."
            },

            {
                tag: "attribute", name: "CredentialRulesSupport", xref: "cluster§5.2.9.18",
                details: "This attribute shall contain a bitmap with the bits set for the values of CredentialRuleEnum " +
                    "supported on this device."
            },

            {
                tag: "attribute", name: "NumberOfCredentialsSupportedPerUser", xref: "cluster§5.2.9.19",

                details: "Indicates the number of credentials that could be assigned for each user." +
                    "\n" +
                    "Depending on the value of NumberOfRFIDUsersSupported and NumberOfPINUsersSupported it may not be " +
                    "possible to assign that number of credentials for a user." +
                    "\n" +
                    "For example, if the device supports only PIN and RFID credential types, " +
                    "NumberOfCredentialsSupportedPerUser is set to 10, NumberOfPINUsersSupported is set to 5 and " +
                    "NumberOfRFIDUsersSupported is set to 3, it will not be possible to actually assign 10 credentials " +
                    "for a user because maximum number of credentials in the database is 8."
            },

            {
                tag: "attribute", name: "Language", xref: "cluster§5.2.9.20",
                details: "Indicates the language for the on-screen or audible user interface using a 2- byte language code " +
                    "from ISO-639-1."
            },
            {
                tag: "attribute", name: "LedSettings", xref: "cluster§5.2.9.21",
                details: "Indicates the settings for the LED support, as defined by LEDSettingEnum."
            },

            {
                tag: "attribute", name: "AutoRelockTime", xref: "cluster§5.2.9.22",
                details: "Indicates the number of seconds to wait after unlocking a lock before it automatically locks again. " +
                    "0=disabled. If set, unlock operations from any source will be timed. For one time unlock with " +
                    "timeout use the specific command."
            },

            {
                tag: "attribute", name: "SoundVolume", xref: "cluster§5.2.9.23",
                details: "Indicates the sound volume on a door lock as defined by SoundVolumeEnum."
            },
            {
                tag: "attribute", name: "OperatingMode", xref: "cluster§5.2.9.24",
                details: "Indicates the current operating mode of the lock as defined in OperatingModeEnum."
            },

            {
                tag: "attribute", name: "SupportedOperatingModes", xref: "cluster§5.2.9.25",

                details: "This attribute shall contain a bitmap with all operating bits of the OperatingMode attribute " +
                    "supported by the lock." +
                    "\n" +
                    "A bit position set to zero shall indicate that the mode is supported. A bit position set to one " +
                    "shall indicate that the mode is not supported." +
                    "\n" +
                    "Any bit that is not yet defined in OperatingModesBitmap shall be set to 1." +
                    "\n" +
                    "The values considered valid to read or write in the OperatingMode attribute shall be the enum values " +
                    "from DoorLockOperatingModeEnum whose equivalent same-named bit from OperatingModesBitmap is set to " +
                    "zero in this attribute. WARNING: This is the opposite of most other semantically similar bitmaps in " +
                    "this specification."
            },

            {
                tag: "attribute", name: "DefaultConfigurationRegister", xref: "cluster§5.2.9.26",

                details: "Indicates the default configurations as they are physically set on the device (example: hardware dip " +
                    "switch setting, etc…) and represents the default setting for some of the attributes within this " +
                    "cluster (for example: LED, Auto Lock, Sound Volume, and Operating Mode attributes)." +
                    "\n" +
                    "This is a read-only attribute and is intended to allow clients to determine what changes may need to " +
                    "be made without having to query all the included attributes. It may be beneficial for the clients to " +
                    "know what the device’s original settings were in the event that the device needs to be restored to " +
                    "factory default settings." +
                    "\n" +
                    "If the Client device would like to query and modify the door lock server’s operating settings, it " +
                    "SHOULD send read and write attribute requests to the specific attributes." +
                    "\n" +
                    "For example, the Sound Volume attribute default value is Silent Mode. However, it is possible that " +
                    "the current Sound Volume is High Volume. Therefore, if the client wants to query/modify the current " +
                    "Sound Volume setting on the server, the client SHOULD read/write to the Sound Volume attribute."
            },

            {
                tag: "attribute", name: "EnableLocalProgramming", xref: "cluster§5.2.9.27",
                details: "This attribute shall enable/disable local programming on the door lock of certain features (see " +
                    "LocalProgrammingFeatures attribute). If this value is set to TRUE then local programming is enabled " +
                    "on the door lock for all features. If it is set to FALSE then local programming is disabled on the " +
                    "door lock for those features whose bit is set to 0 in the LocalProgrammingFeatures attribute. Local " +
                    "programming shall be enabled by default."
            },

            {
                tag: "attribute", name: "EnableOneTouchLocking", xref: "cluster§5.2.9.28",
                details: "This attribute shall enable/disable the ability to lock the door lock with a single touch on the " +
                    "door lock."
            },
            {
                tag: "attribute", name: "EnableInsideStatusLed", xref: "cluster§5.2.9.29",
                details: "This attribute shall enable/disable an inside LED that allows the user to see at a glance if the " +
                    "door is locked."
            },
            {
                tag: "attribute", name: "EnablePrivacyModeButton", xref: "cluster§5.2.9.30",
                details: "This attribute shall enable/disable a button inside the door that is used to put the lock into " +
                    "privacy mode. When the lock is in privacy mode it cannot be manipulated from the outside."
            },

            {
                tag: "attribute", name: "LocalProgrammingFeatures", xref: "cluster§5.2.9.31",

                details: "Indicates the local programming features that will be disabled when EnableLocalProgramming attribute " +
                    "is set to False. If a door lock doesn’t support disabling one aspect of local programming it shall " +
                    "return CONSTRAINT_ERROR during a write operation of this attribute. If the EnableLocalProgramming " +
                    "attribute is set to True then all local programming features shall be enabled regardless of the bits " +
                    "set to 0 in this attribute." +
                    "\n" +
                    "The features that can be disabled from local programming are defined in " +
                    "LocalProgrammingFeaturesBitmap."
            },

            {
                tag: "attribute", name: "WrongCodeEntryLimit", xref: "cluster§5.2.9.32",

                details: "Indicates the number of incorrect Pin codes or RFID presentment attempts a user is allowed to enter " +
                    "before the lock will enter a lockout state. The value of this attribute is compared to all failing " +
                    "forms of credential presentation, including Pin codes used in an Unlock Command when " +
                    "RequirePINforRemoteOperation is set to true. Valid range is 1-255 incorrect attempts. The lockout " +
                    "state will be for the duration of UserCodeTemporaryDisableTime. If the attribute accepts writes and " +
                    "an attempt to write the value 0 is made, the device shall respond with CONSTRAINT_ERROR." +
                    "\n" +
                    "The lock may reset the counter used to track incorrect credential presentations as required by " +
                    "internal logic, environmental events, or other reasons. The lock shall reset the counter if a valid " +
                    "credential is presented."
            },

            {
                tag: "attribute", name: "UserCodeTemporaryDisableTime", xref: "cluster§5.2.9.33",
                details: "Indicates the number of seconds that the lock shuts down following wrong code entry. Valid range is " +
                    "1-255 seconds. Device can shut down to lock user out for specified amount of time. (Makes it " +
                    "difficult to try and guess a PIN for the device.) If the attribute accepts writes and an attempt to " +
                    "write the attribute to 0 is made, the device shall respond with CONSTRAINT_ERROR."
            },

            {
                tag: "attribute", name: "SendPinOverTheAir", xref: "cluster§5.2.9.34",

                details: "Indicates the door locks ability to send PINs over the air. If the attribute is True it is ok for " +
                    "the door lock server to send PINs over the air. This attribute determines the behavior of the " +
                    "server’s TX operation. If it is false, then it is not ok for the device to send PIN in any messages " +
                    "over the air." +
                    "\n" +
                    "The PIN field within any door lock cluster message shall keep the first octet unchanged and masks " +
                    "the actual code by replacing with 0xFF. For example (PIN \"1234\" ): If the attribute value is True, " +
                    "0x04 0x31 0x32 0x33 0x34 shall be used in the PIN field in any door lock cluster message payload. If " +
                    "the attribute value is False, 0x04 0xFF 0xFF 0xFF 0xFF shall be used."
            },

            {
                tag: "attribute", name: "RequirePinForRemoteOperation", xref: "cluster§5.2.9.35",
                details: "Indicates if the door lock requires an optional PIN. If this attribute is set to True, the door lock " +
                    "server requires that an optional PINs be included in the payload of remote lock operation events " +
                    "like Lock, Unlock, Unlock with Timeout and Toggle in order to function."
            },

            { tag: "attribute", name: "SecurityLevel", xref: "cluster§5.2.9" },

            {
                tag: "attribute", name: "ExpiringUserTimeout", xref: "cluster§5.2.9.36",
                details: "Indicates the number of minutes a PIN, RFID, Fingerprint, or other credential associated with a user " +
                    "of type ExpiringUser shall remain valid after its first use before expiring. When the credential " +
                    "expires the UserStatus for the corresponding user record shall be set to OccupiedDisabled."
            },

            {
                tag: "attribute", name: "AliroReaderVerificationKey", xref: "cluster§5.2.9.37",

                details: "Indicates the verification key component of the Reader’s key pair as defined in [Aliro]. The value, " +
                    "if not null, shall be an uncompressed elliptic curve public key as defined in section 2.3.3 of SEC " +
                    "1." +
                    "\n" +
                    "Null if no Reader key pair has been configured on the lock. See Section 5.2.10.42, " +
                    "“SetAliroReaderConfig Command”."
            },

            {
                tag: "attribute", name: "AliroReaderGroupIdentifier", xref: "cluster§5.2.9.38",
                details: "Indicates the reader_group_identifier as defined in [Aliro]." +
                    "\n" +
                    "Null if no reader_group_identifier has been configured on the lock. See Section 5.2.10.42, " +
                    "“SetAliroReaderConfig Command”."
            },

            {
                tag: "attribute", name: "AliroReaderGroupSubIdentifier", xref: "cluster§5.2.9.39",
                details: "Indicates the reader_group_sub_identifier as defined in [Aliro]."
            },
            {
                tag: "attribute", name: "AliroExpeditedTransactionSupportedProtocolVersions",
                xref: "cluster§5.2.9.40",
                details: "Indicates the list of protocol versions supported for expedited transactions as defined in [Aliro]."
            },

            {
                tag: "attribute", name: "AliroGroupResolvingKey", xref: "cluster§5.2.9.41",
                details: "Indicates the Group Resolving Key as defined in [Aliro]." +
                    "\n" +
                    "Null if no group resolving key has been configured on the lock. See Section 5.2.10.42, " +
                    "“SetAliroReaderConfig Command”."
            },

            {
                tag: "attribute", name: "AliroSupportedBleuwbProtocolVersions", xref: "cluster§5.2.9.42",
                details: "Indicates the list of protocol versions supported for the Bluetooth LE + UWB Access Control Flow as " +
                    "defined in [Aliro]."
            },
            {
                tag: "attribute", name: "AliroBleAdvertisingVersion", xref: "cluster§5.2.9.43",
                details: "Indicates the version of the Bluetooth LE advertisement as defined in [Aliro]."
            },
            {
                tag: "attribute", name: "NumberOfAliroCredentialIssuerKeysSupported", xref: "cluster§5.2.9.44",
                details: "Indicates the maximum number of AliroCredentialIssuerKey credentials that can be stored on the lock."
            },

            {
                tag: "attribute", name: "NumberOfAliroEndpointKeysSupported", xref: "cluster§5.2.9.45",

                details: "Indicates the maximum number of endpoint key credentials that can be stored on the lock. This limit " +
                    "applies to the sum of the number of AliroEvictableEndpointKey credentials and the number of " +
                    "AliroNonEvictableEndpointKey credentials." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> The credential indices used for these two credential types are independent of each other, similar " +
                    "  to all other credential types. As long as NumberOfAliroEndpointKeysSupported is at least 2 a " +
                    "  client could add a credential of type AliroEvictableEndpointKey at any index from 1 to " +
                    "  NumberOfAliroEndpointKeysSupported and also add a credential of type AliroNonEvictableEndpointKey " +
                    "  at the same index, and both credentials would exist on the server."
            },

            {
                tag: "event", name: "DoorLockAlarm", xref: "cluster§5.2.11.1",
                details: "The door lock server provides several alarms which can be sent when there is a critical state on the " +
                    "door lock. The alarms available for the door lock server are listed in AlarmCodeEnum.",
                children: [{
                    tag: "field", name: "AlarmCode", xref: "cluster§5.2.11.1.1",
                    details: "This field shall indicate the alarm code of the event that has happened."
                }]
            },

            {
                tag: "event", name: "DoorStateChange", xref: "cluster§5.2.11.2",
                details: "The door lock server sends out a DoorStateChange event when the door lock door state changes.",
                children: [{
                    tag: "field", name: "DoorState", xref: "cluster§5.2.11.2.1",
                    details: "This field shall indicate the new door state for this door event."
                }]
            },

            {
                tag: "event", name: "LockOperation", xref: "cluster§5.2.11.3",

                details: "The door lock server sends out a LockOperation event when the event is triggered by the various lock " +
                    "operation sources." +
                    "\n" +
                    "  • If the door lock server supports the Unbolt Door command, it shall generate a LockOperation " +
                    "    event with LockOperationType set to Unlock after an Unbolt Door command succeeds." +
                    "\n" +
                    "  • If the door lock server supports the Unbolting feature and an Unlock Door command is performed, " +
                    "    it shall generate a LockOperation event with LockOperationType set to Unlatch when the unlatched " +
                    "    state is reached and a LockOperation event with LockOperationType set to Unlock when the lock " +
                    "    successfully completes the unlock → hold latch → release latch and return to unlock state " +
                    "    operation." +
                    "\n" +
                    "  • If the command fails during holding or releasing the latch but after passing the unlocked state, " +
                    "    the door lock server shall generate a LockOperationError event with LockOperationType set to " +
                    "    Unlatch and a LockOperation event with LockOperationType set to Unlock." +
                    "\n" +
                    "    ◦ If it fails before reaching the unlocked state, the door lock server shall generate only a " +
                    "      LockOperationError event with LockOperationType set to Unlock." +
                    "\n" +
                    "  • Upon manual actuation, a door lock server that supports the Unbolting feature:" +
                    "\n" +
                    "    ◦ shall generate a LockOperation event of LockOperationType Unlatch when it is actuated from the " +
                    "      outside." +
                    "\n" +
                    "    ◦ may generate a LockOperation event of LockOperationType Unlatch when it is actuated" +
                    "\n" +
                    "from the inside.",

                children: [
                    {
                        tag: "field", name: "LockOperationType", xref: "cluster§5.2.11.3.1",
                        details: "This field shall indicate the type of the lock operation that was performed."
                    },
                    {
                        tag: "field", name: "OperationSource", xref: "cluster§5.2.11.3.2",
                        details: "This field shall indicate the source of the lock operation that was performed."
                    },

                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.11.3.3",
                        details: "This field shall indicate the UserIndex who performed the lock operation. This shall be null if " +
                            "there is no user index that can be determined for the given operation source. This shall NOT be null " +
                            "if a user index can be determined. In particular, this shall NOT be null if the operation was " +
                            "associated with a valid credential."
                    },

                    {
                        tag: "field", name: "FabricIndex", xref: "cluster§5.2.11.3.4",
                        details: "This field shall indicate the fabric index of the fabric that performed the lock operation. This " +
                            "shall be null if there is no fabric that can be determined for the given operation source. This " +
                            "shall NOT be null if the operation source is \"Remote\"."
                    },

                    {
                        tag: "field", name: "SourceNode", xref: "cluster§5.2.11.3.5",
                        details: "This field shall indicate the Node ID of the node that performed the lock operation. This shall be " +
                            "null if there is no Node associated with the given operation source. This shall NOT be null if the " +
                            "operation source is \"Remote\"."
                    },

                    {
                        tag: "field", name: "Credentials", xref: "cluster§5.2.11.3.6",
                        details: "This field shall indicate the list of credentials used in performing the lock operation. This shall " +
                            "be null if no credentials were involved."
                    }
                ]
            },

            {
                tag: "event", name: "LockOperationError", xref: "cluster§5.2.11.4",
                details: "The door lock server sends out a LockOperationError event when a lock operation fails for various " +
                    "reasons.",

                children: [
                    {
                        tag: "field", name: "LockOperationType", xref: "cluster§5.2.11.4.1",
                        details: "This field shall indicate the type of the lock operation that was performed."
                    },
                    {
                        tag: "field", name: "OperationSource", xref: "cluster§5.2.11.4.2",
                        details: "This field shall indicate the source of the lock operation that was performed."
                    },
                    {
                        tag: "field", name: "OperationError", xref: "cluster§5.2.11.4.3",
                        details: "This field shall indicate the lock operation error triggered when the operation was performed."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.11.4.4",
                        details: "This field shall indicate the lock UserIndex who performed the lock operation. This shall be null if " +
                            "there is no user id that can be determined for the given operation source."
                    },

                    {
                        tag: "field", name: "FabricIndex", xref: "cluster§5.2.11.4.5",
                        details: "This field shall indicate the fabric index of the fabric that performed the lock operation. This " +
                            "shall be null if there is no fabric that can be determined for the given operation source. This " +
                            "shall NOT be null if the operation source is \"Remote\"."
                    },

                    {
                        tag: "field", name: "SourceNode", xref: "cluster§5.2.11.4.6",
                        details: "This field shall indicate the Node ID of the node that performed the lock operation. This shall be " +
                            "null if there is no Node associated with the given operation source. This shall NOT be null if the " +
                            "operation source is \"Remote\"."
                    },

                    {
                        tag: "field", name: "Credentials", xref: "cluster§5.2.11.4.7",
                        details: "This field shall indicate the list of credentials used in performing the lock operation. This shall " +
                            "be null if no credentials were involved."
                    }
                ]
            },

            {
                tag: "event", name: "LockUserChange", xref: "cluster§5.2.11.5",
                details: "The door lock server sends out a LockUserChange event when a lock user, schedule, or credential " +
                    "change has occurred.",

                children: [
                    {
                        tag: "field", name: "LockDataType", xref: "cluster§5.2.11.5.1",
                        details: "This field shall indicate the lock data type that was changed."
                    },
                    {
                        tag: "field", name: "DataOperationType", xref: "cluster§5.2.11.5.2",
                        details: "This field shall indicate the data operation performed on the lock data type changed."
                    },
                    {
                        tag: "field", name: "OperationSource", xref: "cluster§5.2.11.5.3",
                        details: "This field shall indicate the source of the user data change."
                    },

                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.11.5.4",
                        details: "This field shall indicate the lock UserIndex associated with the change (if any). This shall be null " +
                            "if there is no specific user associated with the data operation. This shall be 0xFFFE if all users " +
                            "are affected (e.g. Clear Users)."
                    },

                    {
                        tag: "field", name: "FabricIndex", xref: "cluster§5.2.11.5.5",
                        details: "This field shall indicate the fabric index of the fabric that performed the change (if any). This " +
                            "shall be null if there is no fabric that can be determined to have caused the change. This shall NOT " +
                            "be null if the operation source is \"Remote\"."
                    },

                    {
                        tag: "field", name: "SourceNode", xref: "cluster§5.2.11.5.6",
                        details: "This field shall indicate the Node ID that performed the change (if any). The Node ID of the node " +
                            "that performed the change. This shall be null if there was no Node involved in the change. This " +
                            "shall NOT be null if the operation source is \"Remote\"."
                    },

                    {
                        tag: "field", name: "DataIndex", xref: "cluster§5.2.11.5.7",
                        details: "This field shall indicate the index of the specific item that was changed (e.g. schedule, PIN, RFID, " +
                            "etc.) in the list of items identified by LockDataType. This shall be null if the LockDataType does " +
                            "not correspond to a list that can be indexed into (e.g. ProgrammingUser). This shall be 0xFFFE if " +
                            "all indices are affected (e.g. ClearPINCode, ClearRFIDCode, ClearWeekDaySchedule, " +
                            "ClearYearDaySchedule, etc.)."
                    }
                ]
            },

            {
                tag: "command", name: "LockDoor", xref: "cluster§5.2.10.1",
                details: "This command causes the lock device to lock the door. This command includes an optional code for the " +
                    "lock. The door lock may require a PIN depending on the value of the RequirePINForRemoteOperation " +
                    "attribute.",

                children: [{
                    tag: "field", name: "PinCode", xref: "cluster§5.2.10.1.1",

                    details: "If the RequirePINforRemoteOperation attribute is True then PINCode field shall be provided and the " +
                        "door lock shall NOT grant access if it is not provided." +
                        "\n" +
                        "If the PINCode field is provided, the door lock shall verify PINCode before granting access " +
                        "regardless of the value of RequirePINForRemoteOperation attribute." +
                        "\n" +
                        "When the PINCode field is provided an invalid PIN will count towards the WrongCodeEntryLimit and the " +
                        "UserCodeTemporaryDisableTime will be triggered if the WrongCodeEntryLimit is exceeded. The lock " +
                        "shall ignore any attempts to lock/unlock the door until the UserCodeTemporaryDisableTime expires."
                }]
            },

            {
                tag: "command", name: "UnlockDoor", xref: "cluster§5.2.10.2",

                details: "This command causes the lock device to unlock the door. This command includes an optional code for " +
                    "the lock. The door lock may require a code depending on the value of the " +
                    "RequirePINForRemoteOperation attribute." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> If the attribute AutoRelockTime is supported the lock will transition to the locked state when the " +
                    "  auto relock time has expired.",

                children: [{
                    tag: "field", name: "PinCode", xref: "cluster§5.2.10.2.1",
                    details: "See Section 5.2.10.1.1, “PINCode Field”."
                }]
            },

            { tag: "command", name: "Toggle", xref: "cluster§5.2.10" },

            {
                tag: "command", name: "UnlockWithTimeout", xref: "cluster§5.2.10.3",
                details: "This command causes the lock device to unlock the door with a timeout parameter. After the time in " +
                    "seconds specified in the timeout field, the lock device will relock itself automatically. This " +
                    "timeout parameter is only temporary for this message transition and overrides the default relock " +
                    "time as specified in the AutoRelockTime attribute. If the door lock device is not capable of or does " +
                    "not want to support temporary Relock Timeout, it SHOULD NOT support this optional command.",

                children: [
                    {
                        tag: "field", name: "Timeout", xref: "cluster§5.2.10.3.1",
                        details: "This field shall indicate the timeout in seconds to wait before relocking the door lock. This value " +
                            "is independent of the AutoRelockTime attribute value."
                    },
                    {
                        tag: "field", name: "PinCode", xref: "cluster§5.2.10.3.2",
                        details: "See Section 5.2.10.1.1, “PINCode Field”."
                    }
                ]
            },

            {
                tag: "command", name: "SetPinCode", xref: "cluster§5.2.10.4",
                details: "Set a PIN Code into the lock." +
                    "\n" +
                    "Return status is a global status code or a cluster-specific status code from the Status Codes table " +
                    "and shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "UserId", xref: "cluster§5.2.10.4.1",
                        details: "This field shall indicate the user ID. The value of the UserID field shall be between 0 and the " +
                            "value of the NumberOfPINUsersSupported attribute."
                    },
                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.4.2",
                        details: "This field shall indicate the user status. Only the values 1 (Occupied/Enabled) and 3 " +
                            "(Occupied/Disabled) are allowed for UserStatus."
                    }
                ]
            },

            {
                tag: "command", name: "GetPinCode", xref: "cluster§5.2.10.5",
                details: "Retrieve a PIN Code.",
                children: [{
                    tag: "field", name: "UserId", xref: "cluster§5.2.10.5.1",
                    details: "This field shall indicate the user ID. The value of the UserID field shall be between 0 and the " +
                        "value of the NumberOfPINUsersSupported attribute."
                }]
            },

            {
                tag: "command", name: "GetPinCodeResponse", xref: "cluster§5.2.10.6",

                details: "Returns the PIN for the specified user ID." +
                    "\n" +
                    "If the requested UserID is valid and the Code doesn’t exist, Get RFID Code Response shall have the " +
                    "following format:" +
                    "\n" +
                    "UserID = requested User ID UserStatus = 0 (Available) UserType = Null (Not supported) PINCode = 0 " +
                    "(zero length)" +
                    "\n" +
                    "If the requested UserID is invalid, send Default Response with an error status. The error status " +
                    "shall be equal to CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and " +
                    "NOT_FOUND if greater than or equal to the max number of users supported."
            },

            {
                tag: "command", name: "ClearPinCode", xref: "cluster§5.2.10.7",
                details: "Clear a PIN code or all PIN codes." +
                    "\n" +
                    "For each PIN Code cleared whose user doesn’t have a RFID Code or other credential type, then " +
                    "corresponding user record’s UserStatus value shall be set to Available, and UserType value shall be " +
                    "set to UnrestrictedUser and all schedules shall be cleared.",
                children: [{
                    tag: "field", name: "PinSlotIndex", xref: "cluster§5.2.10.7.1",
                    details: "This field shall specify a valid PIN code slot index or 0xFFFE to indicate all PIN code slots shall " +
                        "be cleared."
                }]
            },

            {
                tag: "command", name: "ClearAllPinCodes", xref: "cluster§5.2.10.8",

                details: "Clear out all PINs on the lock." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> On the server, the clear all PIN codes command SHOULD have the same effect as the ClearPINCode " +
                    "  command with respect to the setting of user status, user type and schedules."
            },

            {
                tag: "command", name: "SetUserStatus", xref: "cluster§5.2.10.9",
                details: "Set the status of a user ID.",

                children: [
                    {
                        tag: "field", name: "UserId", xref: "cluster§5.2.10.9.1",
                        details: "This field shall indicate the user ID. The value of the UserID field shall be between 0 and the " +
                            "value of the NumberOfPINUsersSupported attribute."
                    },
                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.9.2",
                        details: "UserStatus value of Available is not allowed. In order to clear a user id, the ClearUser Command " +
                            "shall be used. For user status value please refer to UserStatusEnum."
                    }
                ]
            },

            {
                tag: "command", name: "GetUserStatus", xref: "cluster§5.2.10.10",
                details: "Get the status of a user.",
                children: [{
                    tag: "field", name: "UserId", xref: "cluster§5.2.10.10.1",
                    details: "This field shall indicate the user ID. The value of the UserID field shall be between 0 and the " +
                        "value of the NumberOfPINUsersSupported attribute."
                }]
            },

            {
                tag: "command", name: "GetUserStatusResponse", xref: "cluster§5.2.10.11",
                details: "Returns the user status for the specified user ID.",

                children: [
                    {
                        tag: "field", name: "UserId", xref: "cluster§5.2.10.11.1",
                        details: "This field shall indicate the user ID provided in the request."
                    },
                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.11.2",
                        details: "This field shall indicate the current status of the requested user ID."
                    }
                ]
            },

            {
                tag: "command", name: "SetWeekDaySchedule", xref: "cluster§5.2.10.12",

                details: "Set a weekly repeating schedule for a specified user." +
                    "\n" +
                    "The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Week Day " +
                    "schedule is set." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "WeekDayIndex", xref: "cluster§5.2.10.12.1",
                        details: "This field shall indicate the index of the Week Day schedule."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.12.2",
                        details: "This field shall indicate the user ID."
                    },
                    {
                        tag: "field", name: "DaysMask", xref: "cluster§5.2.10.12.3",
                        details: "This field shall indicate which week days the schedule is active."
                    },
                    {
                        tag: "field", name: "StartHour", xref: "cluster§5.2.10.12.4",
                        details: "This field shall indicate the starting hour for the Week Day schedule."
                    },
                    {
                        tag: "field", name: "StartMinute", xref: "cluster§5.2.10.12.5",
                        details: "This field shall indicate the starting minute for the Week Day schedule."
                    },
                    {
                        tag: "field", name: "EndHour", xref: "cluster§5.2.10.12.6",
                        details: "This field shall indicate the ending hour for the Week Day schedule. EndHour shall be equal to or " +
                            "greater than StartHour."
                    },

                    {
                        tag: "field", name: "EndMinute", xref: "cluster§5.2.10.12.7",
                        details: "This field shall indicate the ending minute for the Week Day schedule. If EndHour is equal to " +
                            "StartHour then EndMinute shall be greater than StartMinute." +
                            "\n" +
                            "If the EndHour is equal to 23 and the EndMinute is equal to 59 the Lock shall grant access to the " +
                            "user up until 23:59:59."
                    }
                ]
            },

            {
                tag: "command", name: "GetWeekDaySchedule", xref: "cluster§5.2.10.13",
                details: "Retrieve the specific weekly schedule for the specific user."
            },

            {
                tag: "command", name: "GetWeekDayScheduleResponse", xref: "cluster§5.2.10.14",
                details: "Returns the weekly repeating schedule data for the specified schedule index.",

                children: [
                    {
                        tag: "field", name: "WeekDayIndex", xref: "cluster§5.2.10.14.1",
                        details: "This field shall indicate the index of the Week Day schedule."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.14.2",
                        details: "This field shall indicate the user ID."
                    },

                    {
                        tag: "field", name: "Status", xref: "cluster§5.2.10.14.3",

                        details: "Status shall be one of the following values:" +
                            "\n" +
                            "  • SUCCESS if both WeekDayIndex and UserIndex are valid and there is a corresponding schedule " +
                            "    entry." +
                            "\n" +
                            "  • INVALID_COMMAND if either WeekDayIndex and/or UserIndex values are not within valid range" +
                            "\n" +
                            "  • NOT_FOUND if no corresponding schedule entry found for WeekDayIndex." +
                            "\n" +
                            "  • NOT_FOUND if no corresponding user entry found for UserIndex." +
                            "\n" +
                            "If this field is SUCCESS, the optional fields for this command shall be present. For other (error) " +
                            "status values, only the fields up to the status field shall be present."
                    },

                    {
                        tag: "field", name: "StartHour", xref: "cluster§5.2.10.14.4",
                        details: "This field shall indicate the starting hour for the Week Day schedule."
                    },
                    {
                        tag: "field", name: "StartMinute", xref: "cluster§5.2.10.14.5",
                        details: "This field shall indicate the starting minute for the Week Day schedule."
                    },
                    {
                        tag: "field", name: "EndHour", xref: "cluster§5.2.10.14.6",
                        details: "This field shall indicate the ending hour for the Week Day schedule. EndHour shall be equal to or " +
                            "greater than StartHour."
                    },
                    {
                        tag: "field", name: "EndMinute", xref: "cluster§5.2.10.14.7",
                        details: "This field shall indicate the ending minute for the Week Day schedule. If EndHour is equal to " +
                            "StartHour then EndMinute shall be greater than StartMinute."
                    }
                ]
            },

            {
                tag: "command", name: "ClearWeekDaySchedule", xref: "cluster§5.2.10.15",
                details: "Clear the specific weekly schedule or all weekly schedules for the specific user." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "WeekDayIndex", xref: "cluster§5.2.10.15.1",
                        details: "This field shall indicate the Week Day schedule index to clear or 0xFE to clear all Week Day " +
                            "schedules for the specified user."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.15.2",
                        details: "This field shall indicate the user ID."
                    }
                ]
            },

            {
                tag: "command", name: "SetYearDaySchedule", xref: "cluster§5.2.10.16",

                details: "Set a time-specific schedule ID for a specified user." +
                    "\n" +
                    "The associated UserType may be changed to ScheduleRestrictedUser by the lock when a Year Day " +
                    "schedule is set." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "YearDayIndex", xref: "cluster§5.2.10.16.1",
                        details: "This field shall indicate the index of the Year Day schedule."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.16.2",
                        details: "This field shall indicate the user ID."
                    },
                    {
                        tag: "field", name: "LocalStartTime", xref: "cluster§5.2.10.16.3",
                        details: "This field shall indicate the starting time for the Year Day schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value."
                    },

                    {
                        tag: "field", name: "LocalEndTime", xref: "cluster§5.2.10.16.4",
                        details: "This field shall indicate the ending time for the Year Day schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value. " +
                            "LocalEndTime shall be greater than LocalStartTime."
                    }
                ]
            },

            {
                tag: "command", name: "GetYearDaySchedule", xref: "cluster§5.2.10.17",
                details: "Retrieve the specific year day schedule for the specific schedule and user indexes."
            },

            {
                tag: "command", name: "GetYearDayScheduleResponse", xref: "cluster§5.2.10.18",
                details: "Returns the year day schedule data for the specified schedule and user indexes.",

                children: [
                    {
                        tag: "field", name: "YearDayIndex", xref: "cluster§5.2.10.18.1",
                        details: "This field shall indicate the index of the Year Day schedule."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.18.2",
                        details: "This field shall indicate the user ID."
                    },

                    {
                        tag: "field", name: "Status", xref: "cluster§5.2.10.18.3",

                        details: "Status shall be one of the following values:" +
                            "\n" +
                            "  • SUCCESS if both YearDayIndex and UserIndex are valid and there is a corresponding schedule " +
                            "    entry." +
                            "\n" +
                            "  • INVALID_COMMAND if either YearDayIndex and/or UserIndex values are not within valid range" +
                            "\n" +
                            "  • NOT_FOUND if no corresponding schedule entry found for YearDayIndex." +
                            "\n" +
                            "  • NOT_FOUND if no corresponding user entry found for UserIndex." +
                            "\n" +
                            "If this field is SUCCESS, the optional fields for this command shall be present. For other (error) " +
                            "status values, only the fields up to the status field shall be present."
                    },

                    {
                        tag: "field", name: "LocalStartTime", xref: "cluster§5.2.10.18.4",
                        details: "This field shall indicate the starting time for the Year Day schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value. " +
                            "This shall be null if the schedule is not set for the YearDayIndex and UserIndex provided."
                    },

                    {
                        tag: "field", name: "LocalEndTime", xref: "cluster§5.2.10.18.5",
                        details: "This field shall indicate the ending time for the Year Day schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value. " +
                            "LocalEndTime shall be greater than LocalStartTime. This shall be null if the schedule is not set for " +
                            "the YearDayIndex and UserIndex provided."
                    }
                ]
            },

            {
                tag: "command", name: "ClearYearDaySchedule", xref: "cluster§5.2.10.19",
                details: "Clears the specific year day schedule or all year day schedules for the specific user." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "YearDayIndex", xref: "cluster§5.2.10.19.1",
                        details: "This field shall indicate the Year Day schedule index to clear or 0xFE to clear all Year Day " +
                            "schedules for the specified user."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.19.2",
                        details: "This field shall indicate the user ID."
                    }
                ]
            },

            {
                tag: "command", name: "SetHolidaySchedule", xref: "cluster§5.2.10.20",
                details: "Set the holiday Schedule by specifying local start time and local end time with respect to any Lock " +
                    "Operating Mode." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "HolidayIndex", xref: "cluster§5.2.10.20.1",
                        details: "This field shall indicate the index of the Holiday schedule."
                    },

                    {
                        tag: "field", name: "LocalStartTime", xref: "cluster§5.2.10.20.2",
                        details: "This field shall indicate the starting time for the Holiday Day schedule in Epoch Time in Seconds " +
                            "with local time offset based on the local timezone and DST offset on the day represented by the " +
                            "value."
                    },

                    {
                        tag: "field", name: "LocalEndTime", xref: "cluster§5.2.10.20.3",
                        details: "This field shall indicate the ending time for the Holiday Day schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value. " +
                            "LocalEndTime shall be greater than LocalStartTime."
                    },

                    {
                        tag: "field", name: "OperatingMode", xref: "cluster§5.2.10.20.4",
                        details: "This field shall indicate the operating mode to use during this Holiday schedule start/end time."
                    }
                ]
            },

            {
                tag: "command", name: "GetHolidaySchedule", xref: "cluster§5.2.10.21",
                details: "Get the holiday schedule for the specified index."
            },

            {
                tag: "command", name: "GetHolidayScheduleResponse", xref: "cluster§5.2.10.22",
                details: "Returns the Holiday Schedule Entry for the specified Holiday ID.",

                children: [
                    {
                        tag: "field", name: "HolidayIndex", xref: "cluster§5.2.10.22.1",
                        details: "This field shall indicate the index of the Holiday schedule."
                    },

                    {
                        tag: "field", name: "Status", xref: "cluster§5.2.10.22.2",

                        details: "Status shall be one of the following values:" +
                            "\n" +
                            "  • FAILURE if the attribute NumberOfHolidaySchedulesSupported is zero." +
                            "\n" +
                            "  • SUCCESS if the HolidayIndex is valid and there is a corresponding schedule entry." +
                            "\n" +
                            "  • INVALID_COMMAND if the HolidayIndex is not within valid range" +
                            "\n" +
                            "  • NOT_FOUND if the HolidayIndex is within the valid range, however, there is not corresponding " +
                            "    schedule entry found." +
                            "\n" +
                            "If this field is SUCCESS, the optional fields for this command shall be present. For other (error) " +
                            "status values, only the fields up to the status field shall be present."
                    },

                    {
                        tag: "field", name: "LocalStartTime", xref: "cluster§5.2.10.22.3",
                        details: "This field shall indicate the starting time for the Holiday schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value. " +
                            "This shall be null if the schedule is not set for the HolidayIndex provided."
                    },

                    {
                        tag: "field", name: "LocalEndTime", xref: "cluster§5.2.10.22.4",
                        details: "This field shall indicate the ending time for the Holiday schedule in Epoch Time in Seconds with " +
                            "local time offset based on the local timezone and DST offset on the day represented by the value. " +
                            "LocalEndTime shall be greater than LocalStartTime. This shall be null if the schedule is not set for " +
                            "the HolidayIndex provided."
                    },

                    {
                        tag: "field", name: "OperatingMode", xref: "cluster§5.2.10.22.5",
                        details: "This field shall indicate the operating mode to use during this Holiday schedule start/end time. " +
                            "This shall be null if the schedule is not set for the HolidayIndex provided."
                    }
                ]
            },

            {
                tag: "command", name: "ClearHolidaySchedule", xref: "cluster§5.2.10.23",
                details: "Clears the holiday schedule or all holiday schedules.",
                children: [{
                    tag: "field", name: "HolidayIndex", xref: "cluster§5.2.10.23.1",
                    details: "This field shall indicate the Holiday schedule index to clear or 0xFE to clear all Holiday " +
                        "schedules."
                }]
            },

            {
                tag: "command", name: "SetUserType", xref: "cluster§5.2.10.24",
                details: "Set the user type for a specified user." +
                    "\n" +
                    "For user type value please refer to User Type Value." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "UserId", xref: "cluster§5.2.10.24.1",
                        details: "This field shall indicate the user ID."
                    },
                    {
                        tag: "field", name: "UserType", xref: "cluster§5.2.10.24.2",
                        details: "This field shall indicate the user type."
                    }
                ]
            },

            {
                tag: "command", name: "GetUserType", xref: "cluster§5.2.10.25",
                details: "Retrieve the user type for a specific user."
            },
            {
                tag: "command", name: "GetUserTypeResponse", xref: "cluster§5.2.10.26",
                details: "Returns the user type for the specified user ID. If the requested User ID is invalid, send Default " +
                    "Response with an error status equal to FAILURE."
            },

            {
                tag: "command", name: "SetRfidCode", xref: "cluster§5.2.10.27",
                details: "Set an ID for RFID access into the lock." +
                    "\n" +
                    "Return status is a global status code or a cluster-specific status code from the Status Codes table " +
                    "and shall be one of the following values:",

                children: [
                    {
                        tag: "field", name: "UserId", xref: "cluster§5.2.10.27.1",
                        details: "This field shall indicate the user ID." +
                            "\n" +
                            "The value of the UserID field shall be between 0 and the value of the NumberOfRFIDUsersSup ported " +
                            "attribute."
                    },

                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.27.2",
                        details: "This field shall indicate what the status is for a specific user ID. The values are according to " +
                            "“Set PIN” while not all are supported." +
                            "\n" +
                            "Only the values 1 (Occupied/Enabled) and 3 (Occupied/Disabled) are allowed for UserStatus."
                    },

                    {
                        tag: "field", name: "UserType", xref: "cluster§5.2.10.27.3",
                        details: "The values are the same as used for SetPINCode command."
                    }
                ]
            },

            {
                tag: "command", name: "GetRfidCode", xref: "cluster§5.2.10.28",
                details: "Retrieve an RFID code.",

                children: [{
                    tag: "field", name: "UserId", xref: "cluster§5.2.10.28.1",
                    details: "This field shall indicate the user ID." +
                        "\n" +
                        "The value of the UserID field shall be between 0 and the value of the NumberOfRFIDUsersSupported " +
                        "attribute."
                }]
            },

            {
                tag: "command", name: "GetRfidCodeResponse", xref: "cluster§5.2.10.29",

                details: "Returns the RFID code for the specified user ID." +
                    "\n" +
                    "If the requested User ID is valid and the Code doesn’t exist, Get RFID Code Response shall have the " +
                    "following format:" +
                    "\n" +
                    "User ID = requested User ID UserStatus = 0 (available) UserType = 0xFF (not supported)" +
                    "\n" +
                    "RFID Code = 0 (zero length)" +
                    "\n" +
                    "If requested User ID is invalid, send Default Response with an error status. The error status shall " +
                    "be equal to CONSTRAINT_ERROR when User_ID is less than the max number of users supported, and " +
                    "NOT_FOUND if greater than or equal to the max number of users supported."
            },

            {
                tag: "command", name: "ClearRfidCode", xref: "cluster§5.2.10.30",
                details: "Clear an RFID code or all RFID codes." +
                    "\n" +
                    "For each RFID Code cleared whose user doesn’t have a PIN Code or other credential type, then the " +
                    "corresponding user record’s UserStatus value shall be set to Available, and UserType value shall be " +
                    "set to UnrestrictedUser and all schedules shall be cleared.",
                children: [{
                    tag: "field", name: "RfidSlotIndex", xref: "cluster§5.2.10.30.1",
                    details: "This field shall indicate a valid RFID code slot index or 0xFFFE to indicate all RFID code slots " +
                        "shall be cleared."
                }]
            },

            {
                tag: "command", name: "ClearAllRfidCodes", xref: "cluster§5.2.10.31",
                details: "Clear out all RFIDs on the lock. If you clear all RFID codes and this user didn’t have a PIN code, " +
                    "the user status has to be set to \"0 Available\", the user type has to be set to the default value, " +
                    "and all schedules which are supported have to be set to the default values."
            },

            {
                tag: "command", name: "SetUser", xref: "cluster§5.2.10.32",

                details: "Set user into the lock." +
                    "\n" +
                    "Fields used for different use cases:" +
                    "\n" +
                    "Return status is a global status code or a cluster-specific status code from the Status Codes table " +
                    "and shall be one of the following values:" +
                    "\n" +
                    "  • SUCCESS, if setting User was successful." +
                    "\n" +
                    "  • FAILURE, if some unexpected internal error occurred setting User." +
                    "\n" +
                    "  • OCCUPIED, if OperationType is Add and UserIndex points to an occupied slot." +
                    "\n" +
                    "  • INVALID_COMMAND, if one or more fields violate constraints or are invalid or if OperationType is " +
                    "    Modify and UserIndex points to an available slot.",

                children: [
                    {
                        tag: "field", name: "OperationType", xref: "cluster§5.2.10.32.1",
                        details: "This field shall indicate the type of operation."
                    },
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.32.2",
                        details: "This field shall indicate the user ID."
                    },

                    {
                        tag: "field", name: "UserName", xref: "cluster§5.2.10.32.3",

                        details: "This field shall contain a string to use as a human readable identifier for the user. If UserName is " +
                            "null then:" +
                            "\n" +
                            "  • If the OperationType is Add, the UserName in the resulting user record shall be set to an empty " +
                            "    string." +
                            "\n" +
                            "  • If the OperationType is Modify, the UserName in the user record shall NOT be changed from the " +
                            "    current value." +
                            "\n" +
                            "If UserName is not null, the UserName in the user record shall be set to the provided value."
                    },

                    {
                        tag: "field", name: "UserUniqueId", xref: "cluster§5.2.10.32.4",

                        details: "This field shall indicate the fabric assigned number to use for connecting this user to other users " +
                            "on other devices from the fabric’s perspective." +
                            "\n" +
                            "If UserUniqueID is null then:" +
                            "\n" +
                            "  • If the OperationType is Add, the UserUniqueID in the resulting user record shall be set to " +
                            "    default value specified above." +
                            "\n" +
                            "  • If the OperationType is Modify, the UserUniqueID in the user record shall NOT be changed from " +
                            "    the current value." +
                            "\n" +
                            "If UserUniqueID is not null, the UserUniqueID in the user record shall be set to the provided value."
                    },

                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.32.5",

                        details: "This field shall indicate the UserStatus to assign to this user when created or modified. If " +
                            "UserStatus is null then:" +
                            "\n" +
                            "  • If the OperationType is Add, the UserStatus in the resulting user record shall be set to default " +
                            "    value specified above." +
                            "\n" +
                            "  • If the OperationType is Modify, the UserStatus in the user record shall NOT be changed from the " +
                            "    current value." +
                            "\n" +
                            "If UserStatus is not null, the UserStatus in the user record shall be set to the provided value."
                    },

                    {
                        tag: "field", name: "UserType", xref: "cluster§5.2.10.32.6",

                        details: "This field shall indicate the UserType to assign to this user when created or modified. If UserType " +
                            "is null then:" +
                            "\n" +
                            "  • If the OperationType is Add, the UserType in the resulting user record shall be set to default " +
                            "    value specified above." +
                            "\n" +
                            "  • If the OperationType is Modify, the UserType in the user record shall NOT be changed from the " +
                            "    current value." +
                            "\n" +
                            "If UserType is not null, the UserType in the user record shall be set to the provided value."
                    },

                    {
                        tag: "field", name: "CredentialRule", xref: "cluster§5.2.10.32.7",

                        details: "This field shall indicate the CredentialRule to use for this user." +
                            "\n" +
                            "The valid CredentialRule enumeration values depends on the bits in the CredentialRulesBitmap map. " +
                            "Each bit in the map identifies a valid CredentialRule that can be used." +
                            "\n" +
                            "If CredentialRule is null then:" +
                            "\n" +
                            "  • If the OperationType is Add, the CredentialRule in the resulting user record shall be set to " +
                            "    default value specified above." +
                            "\n" +
                            "  • If the OperationType is Modify, the CredentialRule in the user record shall NOT be changed from " +
                            "    the current value." +
                            "\n" +
                            "If CredentialRule is not null, the CredentialRule in the user record shall be set to the provided " +
                            "value."
                    }
                ]
            },

            {
                tag: "command", name: "GetUser", xref: "cluster§5.2.10.33",
                details: "Retrieve user." +
                    "\n" +
                    "An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_ COMMAND, " +
                    "etc.) as needed otherwise the GetUserResponse Command shall be sent implying a status of SUCCESS."
            },

            {
                tag: "command", name: "GetUserResponse", xref: "cluster§5.2.10.34",
                details: "Returns the user for the specified UserIndex." +
                    "\n" +
                    "If the requested UserIndex is valid and the UserStatus is Available for the requested UserIndex then " +
                    "UserName, UserUniqueID, UserStatus, UserType, CredentialRule, Credentials, CreatorFabricIndex, and " +
                    "LastModifiedFabricIndex shall all be null in the response.",

                children: [
                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.34.1",
                        details: "This field shall indicate the user ID."
                    },
                    {
                        tag: "field", name: "UserName", xref: "cluster§5.2.10.34.2",
                        details: "This field shall contain a string to use as a human readable identifier for the user."
                    },
                    { tag: "field", name: "UserUniqueId", xref: "cluster§5.2.10.34.3", details: "See UserUniqueID." },
                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.34.4",
                        details: "This field shall indicate the UserStatus assigned to the user when created or modified."
                    },
                    {
                        tag: "field", name: "UserType", xref: "cluster§5.2.10.34.5",
                        details: "This field shall indicate the UserType assigned to this user when created or modified."
                    },
                    {
                        tag: "field", name: "CredentialRule", xref: "cluster§5.2.10.34.6",
                        details: "This field shall indicate the CredentialRule set for this user."
                    },
                    {
                        tag: "field", name: "Credentials", xref: "cluster§5.2.10.34.7",
                        details: "This field shall contain a list of credentials for this user."
                    },

                    {
                        tag: "field", name: "CreatorFabricIndex", xref: "cluster§5.2.10.34.8",
                        details: "This field shall indicate the user’s creator fabric index. CreatorFabricIndex shall be null if " +
                            "UserStatus is set to Available or when the creator fabric cannot be determined (for example, when " +
                            "user was created outside the Interaction Model) and shall NOT be null otherwise. This value shall be " +
                            "set to 0 if the original creator fabric was deleted."
                    },

                    {
                        tag: "field", name: "LastModifiedFabricIndex", xref: "cluster§5.2.10.34.9",
                        details: "This field shall indicate the user’s last modifier fabric index. LastModifiedFabricIndex shall be " +
                            "null if UserStatus is set to Available or when the modifier fabric cannot be determined (for " +
                            "example, when user was modified outside the Interaction Model) and shall NOT be null otherwise. This " +
                            "value shall be set to 0 if the last modifier fabric was deleted."
                    },

                    {
                        tag: "field", name: "NextUserIndex", xref: "cluster§5.2.10.34.10",
                        details: "This field shall indicate the next occupied UserIndex in the database which is useful for quickly " +
                            "identifying occupied user slots in the database. This shall NOT be null if there is at least one " +
                            "occupied entry after the requested UserIndex in the User database and shall be null if there are no " +
                            "more occupied entries."
                    }
                ]
            },

            {
                tag: "command", name: "ClearUser", xref: "cluster§5.2.10.35",

                details: "Clears a user or all Users." +
                    "\n" +
                    "For each user to clear, all associated credentials (e.g. PIN, RFID, fingerprint, etc.) shall be " +
                    "cleared and the user entry values shall be reset to their default values (e.g. UserStatus shall be " +
                    "Available, UserType shall be UnrestrictedUser) and all associated schedules shall be cleared." +
                    "\n" +
                    "A LockUserChange event with the provided UserIndex shall be generated after successfully clearing " +
                    "users.",

                children: [{
                    tag: "field", name: "UserIndex", xref: "cluster§5.2.10.35.1",
                    details: "This field shall specify a valid User index or 0xFFFE to indicate all user slots shall be cleared."
                }]
            },

            {
                tag: "command", name: "SetCredential", xref: "cluster§5.2.10.36",
                details: "Set a credential (e.g. PIN, RFID, Fingerprint, etc.) into the lock for a new user, existing user, or " +
                    "ProgrammingUser." +
                    "\n" +
                    "Fields used for different use cases:",

                children: [
                    {
                        tag: "field", name: "OperationType", xref: "cluster§5.2.10.36.1",
                        details: "This field shall indicate the set credential operation type requested."
                    },
                    {
                        tag: "field", name: "Credential", xref: "cluster§5.2.10.36.2",
                        details: "This field shall contain a credential structure that contains the CredentialTypeEnum and the " +
                            "credential index (if applicable or 0 if not) to set."
                    },

                    {
                        tag: "field", name: "CredentialData", xref: "cluster§5.2.10.36.3",
                        details: "This field shall indicate the credential data to set for the credential being added or modified. The " +
                            "length of the credential data shall conform to the limits of the CredentialType specified in the " +
                            "Credential structure otherwise an INVALID_COMMAND status shall be returned in the " +
                            "SetCredentialResponse command."
                    },

                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.36.4",
                        details: "This field shall indicate the user index to the user record that corresponds to the credential being " +
                            "added or modified. This shall be null if OperationType is add and a new credential and user is being " +
                            "added at the same time."
                    },

                    {
                        tag: "field", name: "UserStatus", xref: "cluster§5.2.10.36.5",
                        details: "This field shall indicate the user status to use in the new user record if a new user is being " +
                            "created. This shall be null if OperationType is Modify. This may be null when adding a new " +
                            "credential and user."
                    },

                    {
                        tag: "field", name: "UserType", xref: "cluster§5.2.10.36.6",
                        details: "This field shall indicate the user type to use in the new user record if a new user is being " +
                            "created. This shall be null if OperationType is Modify. This may be null when adding a new " +
                            "credential and user."
                    }
                ]
            },

            {
                tag: "command", name: "SetCredentialResponse", xref: "cluster§5.2.10.37",
                details: "Returns the status for setting the specified credential.",

                children: [
                    {
                        tag: "field", name: "Status", xref: "cluster§5.2.10.37.1",

                        details: "Status comes from the Status Codes table and shall be one of the following values:" +
                            "\n" +
                            "  • SUCCESS, if setting user credential was successful." +
                            "\n" +
                            "  • FAILURE, if some unexpected internal error occurred setting user credential." +
                            "\n" +
                            "  • OCCUPIED, if OperationType is Add and CredentialIndex in Credential structure points to an " +
                            "    occupied slot." +
                            "\n" +
                            "  • OCCUPIED, if OperationType is Modify and CredentialIndex in Credential structure does not match " +
                            "    the CredentialIndex that is already associated with the provided UserIndex." +
                            "\n" +
                            "  • DUPLICATE, if CredentialData provided is a duplicate of another credential with the same " +
                            "    CredentialType (e.g. duplicate PIN code)." +
                            "\n" +
                            "  • RESOURCE_EXHAUSTED, if OperationType is Add and the new credential cannot be added due to " +
                            "    resource constraints such as:" +
                            "\n" +
                            "    ◦ The user referred to by UserIndex already has NumberOfCredentialsSupportedPerUser credentials " +
                            "      associated." +
                            "\n" +
                            "    ◦ The credential is of type AliroEvictableEndpointKey or AliroNonEvictableEndpointKey, and " +
                            "      adding it would cause the total number of credentials of those two types to exceed " +
                            "      NumberOfAliroEndpointKeysSupported." +
                            "\n" +
                            "  • INVALID_COMMAND, if one or more fields violate constraints or are invalid." +
                            "\n" +
                            "  • INVALID_COMMAND, if the CredentialIndex in the Credential provided exceeds the number of " +
                            "    credentials of the provided CredentialType supported by the lock." +
                            "\n" +
                            "  • INVALID_COMMAND, if OperationType is Modify and UserIndex points to an available slot."
                    },

                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.37.2",
                        details: "This field shall indicate the user index that was created with the new credential. If the status " +
                            "being returned is not success then this shall be null. This shall be null if OperationType was " +
                            "Modify; if the OperationType was Add and a new User was created this shall NOT be null and shall " +
                            "provide the UserIndex created. If the OperationType was Add and an existing User was associated with " +
                            "the new credential then this shall be null."
                    },

                    {
                        tag: "field", name: "NextCredentialIndex", xref: "cluster§5.2.10.37.3",

                        details: "This field shall indicate the next available index in the database for the credential type set, " +
                            "which is useful for quickly identifying available credential slots in the database. This shall NOT " +
                            "be null if there is at least one available entry after the requested credential index in the " +
                            "corresponding database and shall be null if there are no more available entries. The " +
                            "NextCredentialIndex reported shall NOT exceed the maximum number of credentials for a particular " +
                            "credential type."
                    }
                ]
            },

            {
                tag: "command", name: "GetCredentialStatus", xref: "cluster§5.2.10.38",
                details: "Retrieve the status of a particular credential (e.g. PIN, RFID, Fingerprint, etc.) by index." +
                    "\n" +
                    "An InvokeResponse command shall be sent with an appropriate error (e.g. FAILURE, INVALID_COMMAND, " +
                    "etc.) as needed otherwise the GetCredentialStatusResponse command shall be sent implying a status of " +
                    "SUCCESS.",
                children: [{
                    tag: "field", name: "Credential", xref: "cluster§5.2.10.38.1",
                    details: "This field shall contain a credential structure that contains the CredentialTypeEnum and the " +
                        "credential index (if applicable or 0 if not) to retrieve the status for."
                }]
            },

            {
                tag: "command", name: "GetCredentialStatusResponse", xref: "cluster§5.2.10.39",
                details: "Returns the status for the specified credential.",

                children: [
                    {
                        tag: "field", name: "CredentialExists", xref: "cluster§5.2.10.39.1",
                        details: "This field shall indicate if the requested credential type and index exists and is populated for the " +
                            "requested user index."
                    },

                    {
                        tag: "field", name: "UserIndex", xref: "cluster§5.2.10.39.2",
                        details: "This field shall indicate the credential’s corresponding user index value if the credential exists. " +
                            "If CredentialType requested was ProgrammingPIN then UserIndex shall be null; otherwise, UserIndex " +
                            "shall be null if CredentialExists is set to False and shall NOT be null if CredentialExists is set " +
                            "to True."
                    },

                    {
                        tag: "field", name: "CreatorFabricIndex", xref: "cluster§5.2.10.39.3",
                        details: "This field shall indicate the credential’s creator fabric index. CreatorFabricIndex shall be null if " +
                            "CredentialExists is set to False or when the creator fabric cannot be determined (for example, when " +
                            "credential was created outside the Interaction Model) and shall NOT be null otherwise. This value " +
                            "shall be set to 0 if the original creator fabric was deleted."
                    },

                    {
                        tag: "field", name: "LastModifiedFabricIndex", xref: "cluster§5.2.10.39.4",
                        details: "This field shall indicate the credential’s last modifier fabric index. LastModifiedFabricIndex shall " +
                            "be null if CredentialExists is set to False or when the modifier fabric cannot be determined (for " +
                            "example, when credential was modified outside the Interaction Model) and shall NOT be null " +
                            "otherwise. This value shall be set to 0 if the last modifier fabric was deleted."
                    },

                    {
                        tag: "field", name: "NextCredentialIndex", xref: "cluster§5.2.10.39.5",

                        details: "This field shall indicate the next occupied index in the database for the credential type requested, " +
                            "which is useful for quickly identifying occupied credential slots in the database. This shall NOT be " +
                            "null if there is at least one occupied entry after the requested credential index in the " +
                            "corresponding database and shall be null if there are no more occupied entries. The " +
                            "NextCredentialIndex reported shall NOT exceed the maximum number of credentials for a particular " +
                            "credential type."
                    },

                    {
                        tag: "field", name: "CredentialData", xref: "cluster§5.2.10.39.6",

                        details: "This field shall indicate the credential data for the requested user index." +
                            "\n" +
                            "If the CredentialType in the GetCredentialStatus command was not AliroCredentialIssuerKey, " +
                            "AliroEvictableEndpointKey, or AliroNonEvictableEndpointKey, this field shall NOT be included." +
                            "\n" +
                            "Otherwise, if CredentialExists is false this field shall be null." +
                            "\n" +
                            "Otherwise, the value of this field shall be the value of the relevant credential, as a 65-byte " +
                            "uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1." +
                            "\n" +
                            "> [!NOTE]" +
                            "\n" +
                            "> Since the Aliro credentials are public keys, there is no security risk in allowing them to be " +
                            "  read. Possession of the credential octet string does not allow operating the lock."
                    }
                ]
            },

            {
                tag: "command", name: "ClearCredential", xref: "cluster§5.2.10.40",

                details: "Clear one, one type, or all credentials except ProgrammingPIN credential." +
                    "\n" +
                    "Fields used for different use cases:" +
                    "\n" +
                    "For each credential cleared whose user doesn’t have another valid credential, the corresponding user " +
                    "record shall be reset back to default values and its UserStatus value shall be set to Available and " +
                    "UserType value shall be set to UnrestrictedUser and all schedules shall be cleared. In this case a " +
                    "LockUserChange event shall be generated for the user being cleared." +
                    "\n" +
                    "Return status shall be one of the following values:",

                children: [{
                    tag: "field", name: "Credential", xref: "cluster§5.2.10.40.1",
                    details: "This field shall contain a credential structure that contains the CredentialTypeEnum and the " +
                        "credential index (0xFFFE for all credentials or 0 if not applicable) to clear. This shall be null if " +
                        "clearing all credential types otherwise it shall NOT be null."
                }]
            },

            {
                tag: "command", name: "UnboltDoor", xref: "cluster§5.2.10.41",

                details: "This command causes the lock device to unlock the door without pulling the latch. This command " +
                    "includes an optional code for the lock. The door lock may require a code depending on the value of " +
                    "the RequirePINForRemoteOperation attribute." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> If the attribute AutoRelockTime is supported, the lock will transition to the locked state when " +
                    "  the auto relock time has expired.",

                children: [{
                    tag: "field", name: "PinCode", xref: "cluster§5.2.10.41.1",
                    details: "See Section 5.2.10.1.1, “PINCode Field”."
                }]
            },

            {
                tag: "command", name: "SetAliroReaderConfig", xref: "cluster§5.2.10.42",
                details: "This command allows communicating an Aliro Reader configuration, as defined in [Aliro], to the lock.",

                children: [
                    {
                        tag: "field", name: "SigningKey", xref: "cluster§5.2.10.42.1",
                        details: "This field shall indicate the signing key component of the Reader’s key pair."
                    },
                    {
                        tag: "field", name: "VerificationKey", xref: "cluster§5.2.10.42.2",
                        details: "This field shall indicate the verification key component of the Reader’s key pair. This shall be an " +
                            "uncompressed elliptic curve public key as defined in section 2.3.3 of SEC 1."
                    },
                    {
                        tag: "field", name: "GroupIdentifier", xref: "cluster§5.2.10.42.3",
                        details: "This field shall indicate the reader group identifier for the lock."
                    },
                    {
                        tag: "field", name: "GroupResolvingKey", xref: "cluster§5.2.10.42.4",
                        details: "This field shall indicate the group resolving key for the lock."
                    }
                ]
            },

            {
                tag: "command", name: "ClearAliroReaderConfig", xref: "cluster§5.2.10.43",

                details: "This command allows clearing an existing Aliro Reader configuration for the lock. Administrators " +
                    "shall NOT clear an Aliro Reader configuration without explicit user permission." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> Using this command will revoke the ability of all existing Aliro user devices that have the old " +
                    "  verification key to interact with the lock. This effect is not restricted to a single fabric or " +
                    "  otherwise scoped in any way."
            },

            {
                tag: "datatype", name: "DaysMaskBitmap", xref: "cluster§5.2.6.1",
                details: "This bitmap shall indicate the days of the week the Week Day schedule applies for.",

                children: [
                    { tag: "field", name: "Sunday", description: "Schedule is applied on Sunday" },
                    { tag: "field", name: "Monday", description: "Schedule is applied on Monday" },
                    { tag: "field", name: "Tuesday", description: "Schedule is applied on Tuesday" },
                    { tag: "field", name: "Wednesday", description: "Schedule is applied on Wednesday" },
                    { tag: "field", name: "Thursday", description: "Schedule is applied on Thursday" },
                    { tag: "field", name: "Friday", description: "Schedule is applied on Friday" },
                    { tag: "field", name: "Saturday", description: "Schedule is applied on Saturday" }
                ]
            },

            {
                tag: "datatype", name: "CredentialRulesBitmap", xref: "cluster§5.2.6.2",
                children: [
                    { tag: "field", name: "Single", description: "Only one credential is required for lock operation" },
                    { tag: "field", name: "Dual", description: "Any two credentials are required for lock operation" },
                    { tag: "field", name: "Tri", description: "Any three credentials are required for lock operation" }
                ]
            },

            {
                tag: "datatype", name: "OperatingModesBitmap",
                description: "For the OperatingModesBitmap, a bit SET indicates that the operating mode IS NOT supported. A bit CLEAR indicates that the operating mode IS supported. This is the inverse of most bitmaps in this specification, and it is RECOMMENDED that clients carefully take this into consideration.",
                xref: "cluster§5.2.6.3",

                details: "### WARNING" +
                    "\n" +
                    "For the OperatingModesBitmap, a bit SET indicates that the operating mode IS NOT supported. A bit " +
                    "CLEAR indicates that the operating mode IS supported. This is the inverse of most bitmaps in this " +
                    "specification, and it is recommended that clients carefully take this into consideration. See " +
                    "SupportedOperatingModes.",

                children: [
                    { tag: "field", name: "Normal", description: "Normal operation mode is NOT supported" },
                    { tag: "field", name: "Vacation", description: "Vacation operation mode is NOT supported" },
                    { tag: "field", name: "Privacy", description: "Privacy operation mode is NOT supported" },
                    {
                        tag: "field", name: "NoRemoteLockUnlock",
                        description: "No remote lock and unlock operation mode is NOT supported"
                    },
                    { tag: "field", name: "Passage", description: "Passage operation mode is NOT supported" },
                    {
                        tag: "field", name: "AlwaysSet",
                        description: "This needs always be set because this bitmap is inverse.!"
                    }
                ]
            },

            {
                tag: "datatype", name: "ConfigurationRegisterBitmap", xref: "cluster§5.2.6.4",

                children: [
                    {
                        tag: "field", name: "LocalProgramming", description: "The state of local programming functionality",
                        xref: "cluster§5.2.6.4.1",
                        details: "This bit shall indicate the state related to local programming:" +
                            "\n" +
                            "  • 0 = Local programming is disabled" +
                            "\n" +
                            "  • 1 = Local programming is enabled"
                    },

                    {
                        tag: "field", name: "KeypadInterface", description: "The state of the keypad interface",
                        xref: "cluster§5.2.6.4.2",
                        details: "This bit shall indicate the state related to keypad interface:" +
                            "\n" +
                            "  • 0 = Keypad interface is disabled" +
                            "\n" +
                            "  • 1 = Keypad interface is enabled"
                    },

                    {
                        tag: "field", name: "RemoteInterface", description: "The state of the remote interface",
                        xref: "cluster§5.2.6.4.3",
                        details: "This bit shall indicate the state related to remote interface:" +
                            "\n" +
                            "  • 0 = Remote interface is disabled" +
                            "\n" +
                            "  • 1 = Remote interface is enabled"
                    },

                    {
                        tag: "field", name: "SoundVolume", description: "Sound volume is set to Silent value",
                        xref: "cluster§5.2.6.4.4",
                        details: "This bit shall indicate the state related to sound volume:" +
                            "\n" +
                            "  • 0 = Sound volume value is 0 (Silent)" +
                            "\n" +
                            "  • 1 = Sound volume value is equal to something other than 0"
                    },

                    {
                        tag: "field", name: "AutoRelockTime", description: "Auto relock time it set to 0",
                        xref: "cluster§5.2.6.4.5",
                        details: "This bit shall indicate the state related to auto relock time:" +
                            "\n" +
                            "  • 0 = Auto relock time value is 0" +
                            "\n" +
                            "  • 1 = Auto relock time value is equal to something other than 0"
                    },

                    {
                        tag: "field", name: "LedSettings", description: "LEDs is disabled", xref: "cluster§5.2.6.4.6",
                        details: "This bit shall indicate the state related to LED settings:" +
                            "\n" +
                            "  • 0 = LED settings value is 0 (NoLEDSignal)" +
                            "\n" +
                            "  • 1 = LED settings value is equal to something other than 0"
                    }
                ]
            },

            {
                tag: "datatype", name: "LocalProgrammingFeaturesBitmap", xref: "cluster§5.2.6.5",

                children: [
                    {
                        tag: "field", name: "AddUsersCredentialsSchedules",
                        description: "The state of the ability to add users, credentials or schedules on the device",
                        xref: "cluster§5.2.6.5.1",
                        details: "This bit shall indicate whether the door lock is able to add Users/Credentials/Schedules locally:" +
                            "\n" +
                            "  • 0 = This ability is disabled" +
                            "\n" +
                            "  • 1 = This ability is enabled"
                    },

                    {
                        tag: "field", name: "ModifyUsersCredentialsSchedules",
                        description: "The state of the ability to modify users, credentials or schedules on the device",
                        xref: "cluster§5.2.6.5.2",
                        details: "This bit shall indicate whether the door lock is able to modify Users/Credentials/Schedules locally:" +
                            "\n" +
                            "  • 0 = This ability is disabled" +
                            "\n" +
                            "  • 1 = This ability is enabled"
                    },

                    {
                        tag: "field", name: "ClearUsersCredentialsSchedules",
                        description: "The state of the ability to clear users, credentials or schedules on the device",
                        xref: "cluster§5.2.6.5.3",
                        details: "This bit shall indicate whether the door lock is able to clear Users/Credentials/Schedules locally:" +
                            "\n" +
                            "  • 0 = This ability is disabled" +
                            "\n" +
                            "  • 1 = This ability is enabled"
                    },

                    {
                        tag: "field", name: "AdjustSettings",
                        description: "The state of the ability to adjust settings on the device", xref: "cluster§5.2.6.5.4",
                        details: "This bit shall indicate whether the door lock is able to adjust lock settings locally:" +
                            "\n" +
                            "  • 0 = This ability is disabled" +
                            "\n" +
                            "  • 1 = This ability is enabled"
                    }
                ]
            },

            {
                tag: "datatype", name: "AlarmMaskBitmap", xref: "cluster§5.2.6.6",

                children: [
                    { tag: "field", name: "LockJammed", description: "Locking Mechanism Jammed" },
                    { tag: "field", name: "LockFactoryReset", description: "Lock Reset to Factory Defaults" },
                    { tag: "field", name: "LockRadioPowerCycled", description: "RF Module Power Cycled" },
                    { tag: "field", name: "WrongCodeEntryLimit", description: "Tamper Alarm - wrong code entry limit" },
                    {
                        tag: "field", name: "FrontEscutcheonRemoved",
                        description: "Tamper Alarm - front escutcheon removed from main"
                    },
                    { tag: "field", name: "DoorForcedOpen", description: "Forced Door Open under Door Locked Condition" }
                ]
            },

            {
                tag: "datatype", name: "AlarmCodeEnum", xref: "cluster§5.2.6.7",
                details: "This enumeration shall indicate the alarm type.",

                children: [
                    { tag: "field", name: "LockJammed", description: "Locking Mechanism Jammed" },
                    { tag: "field", name: "LockFactoryReset", description: "Lock Reset to Factory Defaults" },
                    { tag: "field", name: "LockRadioPowerCycled", description: "Lock Radio Power Cycled" },
                    { tag: "field", name: "WrongCodeEntryLimit", description: "Tamper Alarm - wrong code entry limit" },
                    {
                        tag: "field", name: "FrontEsceutcheonRemoved",
                        description: "Tamper Alarm - front escutcheon removed from main"
                    },
                    { tag: "field", name: "DoorForcedOpen", description: "Forced Door Open under Door Locked Condition" },
                    { tag: "field", name: "DoorAjar", description: "Door ajar" },
                    { tag: "field", name: "ForcedUser", description: "Force User SOS alarm" }
                ]
            },

            {
                tag: "datatype", name: "CredentialRuleEnum", xref: "cluster§5.2.6.8",
                details: "This enumeration shall indicate the credential rule that can be applied to a particular user.",
                children: [
                    { tag: "field", name: "Single", description: "Only one credential is required for lock operation" },
                    { tag: "field", name: "Dual", description: "Any two credentials are required for lock operation" },
                    { tag: "field", name: "Tri", description: "Any three credentials are required for lock operation" }
                ]
            },

            {
                tag: "datatype", name: "CredentialTypeEnum", xref: "cluster§5.2.6.9",
                details: "This enumeration shall indicate the credential type.",

                children: [
                    { tag: "field", name: "ProgrammingPin", description: "Programming PIN code credential type" },
                    { tag: "field", name: "Pin", description: "PIN code credential type" },
                    { tag: "field", name: "Rfid", description: "RFID identifier credential type" },
                    { tag: "field", name: "Fingerprint", description: "Fingerprint identifier credential type" },
                    { tag: "field", name: "FingerVein", description: "Finger vein identifier credential type" },
                    { tag: "field", name: "Face", description: "Face identifier credential type" },

                    {
                        tag: "field", name: "AliroCredentialIssuerKey",
                        description: "A Credential Issuer public key as defined in [Aliro]", xref: "cluster§5.2.6.9.1",

                        details: "Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in " +
                            "section 2.3.3 of SEC 1." +
                            "\n" +
                            "Credentials of this type shall NOT be used to allow operating the lock. They shall be used, as " +
                            "defined in [Aliro], to create new credentials of type AliroEvictableEndpointKey via a step-up " +
                            "transaction." +
                            "\n" +
                            "When performing the step-up transaction, the lock shall request the data element with identifier " +
                            "\"matter1\", and shall attempt to create a new credential of type AliroEvictableEndpointKey if and " +
                            "only if the data element is returned and the Access Credential can be validated using the " +
                            "AliroCredentialIssuerKey." +
                            "\n" +
                            "When a new credential of type AliroEvictableEndpointKey is added in this manner, it shall be " +
                            "associated with the same user record as the AliroCredentialIssuerKey credential that allowed the new " +
                            "credential to be added." +
                            "\n" +
                            "If there are no available credential slots to add a new AliroEvictableEndpointKey credential (i.e. " +
                            "either the NumberOfCredentialsSupportedPerUser or the NumberOfAliroEndpointKeysSupported limit has " +
                            "been reached) but there exist credentials of type AliroEvictableEndpointKey associated with the user " +
                            "record, the server shall remove one of those credentials using the same procedure it would follow " +
                            "for the ClearCredential command before adding the new credential." +
                            "\n" +
                            "If there are no available credential slots to add a new AliroEvictableEndpointKey credential (i.e. " +
                            "either the NumberOfCredentialsSupportedPerUser or the NumberOfAliroEndpointKeysSupported limit has " +
                            "been reached) and there do not exist credentials of type AliroEvictableEndpointKey associated with " +
                            "the user record, a new AliroEvictableEndpointKey credential shall NOT be created." +
                            "\n" +
                            "If the step-up process results in addition of new credentials, the corresponding LockUserChange " +
                            "event shall have OperationSource set to Aliro." +
                            "\n" +
                            "If the step-up process results in the lock state changing (e.g. locking or unlocking), the " +
                            "credential associated with those changes in the LockOperation events shall be the newly provisioned " +
                            "AliroEvictableEndpointKey credential if one was created. If no new AliroEvictableEndpointKey " +
                            "credential was created, the credential associated with the changes in the LockOperation events shall " +
                            "be the AliroCredentialIssuerKey credential used for the step-up."
                    },

                    {
                        tag: "field", name: "AliroEvictableEndpointKey",
                        description: "An Endpoint public key as defined in [Aliro] which can be evicted if space is needed for another endpoint key",
                        xref: "cluster§5.2.6.9.2",
                        details: "Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in " +
                            "section 2.3.3 of SEC 1."
                    },

                    {
                        tag: "field", name: "AliroNonEvictableEndpointKey",
                        description: "An Endpoint public key as defined in [Aliro] which cannot be evicted if space is needed for another endpoint key",
                        xref: "cluster§5.2.6.9.3",
                        details: "Credentials of this type shall be 65-byte uncompressed elliptic curve public keys as defined in " +
                            "section 2.3.3 of SEC 1."
                    }
                ]
            },

            {
                tag: "datatype", name: "DataOperationTypeEnum", xref: "cluster§5.2.6.10",
                details: "This enumeration shall indicate the data operation performed.",
                children: [
                    { tag: "field", name: "Add", description: "Data is being added or was added" },
                    { tag: "field", name: "Clear", description: "Data is being cleared or was cleared" },
                    { tag: "field", name: "Modify", description: "Data is being modified or was modified" }
                ]
            },

            {
                tag: "datatype", name: "DoorStateEnum", xref: "cluster§5.2.6.11",
                details: "This enumeration shall indicate the current door state.",

                children: [
                    { tag: "field", name: "DoorOpen", description: "Door state is open" },
                    { tag: "field", name: "DoorClosed", description: "Door state is closed" },
                    { tag: "field", name: "DoorJammed", description: "Door state is jammed" },
                    { tag: "field", name: "DoorForcedOpen", description: "Door state is currently forced open" },
                    {
                        tag: "field", name: "DoorUnspecifiedError",
                        description: "Door state is invalid for unspecified reason"
                    },
                    { tag: "field", name: "DoorAjar", description: "Door state is ajar" }
                ]
            },

            {
                tag: "datatype", name: "LockDataTypeEnum", xref: "cluster§5.2.6.12",
                details: "This enumeration shall indicate the data type that is being or has changed.",

                children: [
                    {
                        tag: "field", name: "Unspecified",
                        description: "Unspecified or manufacturer specific lock user data added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "ProgrammingCode",
                        description: "Lock programming PIN code was added, cleared, or modified."
                    },
                    { tag: "field", name: "UserIndex", description: "Lock user index was added, cleared, or modified." },
                    {
                        tag: "field", name: "WeekDaySchedule",
                        description: "Lock user week day schedule was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "YearDaySchedule",
                        description: "Lock user year day schedule was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "HolidaySchedule",
                        description: "Lock holiday schedule was added, cleared, or modified."
                    },
                    { tag: "field", name: "Pin", description: "Lock user PIN code was added, cleared, or modified." },
                    { tag: "field", name: "Rfid", description: "Lock user RFID code was added, cleared, or modified." },
                    {
                        tag: "field", name: "Fingerprint",
                        description: "Lock user fingerprint was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "FingerVein",
                        description: "Lock user finger-vein information was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "Face",
                        description: "Lock user face information was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "AliroCredentialIssuerKey",
                        description: "An Aliro credential issuer key credential was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "AliroEvictableEndpointKey",
                        description: "An Aliro endpoint key credential which can be evicted credential was added, cleared, or modified."
                    },
                    {
                        tag: "field", name: "AliroNonEvictableEndpointKey",
                        description: "An Aliro endpoint key credential which cannot be evicted was added, cleared, or modified."
                    }
                ]
            },

            {
                tag: "datatype", name: "LockOperationTypeEnum", xref: "cluster§5.2.6.13",
                details: "This enumeration shall indicate the type of Lock operation performed.",

                children: [
                    { tag: "field", name: "Lock", description: "Lock operation" },
                    { tag: "field", name: "Unlock", description: "Unlock operation" },
                    {
                        tag: "field", name: "NonAccessUserEvent",
                        description: "Triggered by keypad entry for user with User Type set to Non Access User"
                    },
                    {
                        tag: "field", name: "ForcedUserEvent",
                        description: "Triggered by using a user with UserType set to Forced User"
                    },
                    { tag: "field", name: "Unlatch", description: "Unlatch operation" }
                ]
            },

            {
                tag: "datatype", name: "OperationErrorEnum", xref: "cluster§5.2.6.14",
                details: "This enumeration shall indicate the error cause of the Lock/Unlock operation performed.",

                children: [
                    {
                        tag: "field", name: "Unspecified",
                        description: "Lock/unlock error caused by unknown or unspecified source"
                    },
                    {
                        tag: "field", name: "InvalidCredential",
                        description: "Lock/unlock error caused by invalid PIN, RFID, fingerprint or other credential"
                    },
                    {
                        tag: "field", name: "DisabledUserDenied",
                        description: "Lock/unlock error caused by disabled USER or credential"
                    },
                    { tag: "field", name: "Restricted", description: "Lock/unlock error caused by schedule restriction" },
                    {
                        tag: "field", name: "InsufficientBattery",
                        description: "Lock/unlock error caused by insufficient battery power left to safely actuate the lock"
                    }
                ]
            },

            {
                tag: "datatype", name: "OperatingModeEnum", xref: "cluster§5.2.6.15",

                details: "This enumeration shall indicate the lock operating mode." +
                    "\n" +
                    "The table below shows the operating mode and which interfaces are enabled, if supported, for each " +
                    "mode." +
                    "\n" +
                    "* Interface Operational: Yes, No or N/A" +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> For modes that disable the remote interface, the door lock shall respond to Lock, Unlock, Toggle, " +
                    "  and Unlock with Timeout commands with a response status Failure and not take the action requested " +
                    "  by those commands. The door lock shall NOT disable the radio or otherwise unbind or leave the " +
                    "  network. It shall still respond to all other commands and requests.",

                children: [
                    {
                        tag: "field", name: "Normal", xref: "cluster§5.2.6.15.1",
                        details: "The lock operates normally. All interfaces are enabled."
                    },
                    {
                        tag: "field", name: "Vacation", xref: "cluster§5.2.6.15.2",
                        details: "Only remote interaction is enabled. The keypad shall only be operable by the master user."
                    },

                    {
                        tag: "field", name: "Privacy", xref: "cluster§5.2.6.15.3",
                        details: "This mode is only possible if the door is locked. Manual unlocking changes the mode to Normal " +
                            "operating mode. All external interaction with the door lock is disabled. This mode is intended to be " +
                            "used so that users, presumably inside the property, will have control over the entrance."
                    },

                    {
                        tag: "field", name: "NoRemoteLockUnlock", xref: "cluster§5.2.6.15.4",
                        details: "This mode only disables remote interaction with the lock. This does not apply to any remote " +
                            "proprietary means of communication. It specifically applies to the Lock, Unlock, Toggle, and Unlock " +
                            "with Timeout Commands."
                    },

                    {
                        tag: "field", name: "Passage", xref: "cluster§5.2.6.15.5",
                        details: "The lock is open or can be opened or closed at will without the use of a Keypad or other means of " +
                            "user validation (e.g. a lock for a business during work hours)."
                    }
                ]
            },

            {
                tag: "datatype", name: "OperationSourceEnum", xref: "cluster§5.2.6.16",
                details: "This enumeration shall indicate the source of the Lock/Unlock or user change operation performed.",

                children: [
                    {
                        tag: "field", name: "Unspecified",
                        description: "Lock/unlock operation came from unspecified source"
                    },
                    {
                        tag: "field", name: "Manual",
                        description: "Lock/unlock operation came from manual operation (key, thumbturn, handle, etc)."
                    },
                    {
                        tag: "field", name: "ProprietaryRemote",
                        description: "Lock/unlock operation came from proprietary remote source (e.g. vendor app/cloud)"
                    },
                    { tag: "field", name: "Keypad", description: "Lock/unlock operation came from keypad" },
                    {
                        tag: "field", name: "Auto",
                        description: "Lock/unlock operation came from lock automatically (e.g. relock timer)"
                    },
                    {
                        tag: "field", name: "Button",
                        description: "Lock/unlock operation came from lock button (e.g. one touch or button)"
                    },
                    {
                        tag: "field", name: "Schedule",
                        description: "Lock/unlock operation came from lock due to a schedule"
                    },
                    { tag: "field", name: "Remote", description: "Lock/unlock operation came from remote node" },
                    { tag: "field", name: "Rfid", description: "Lock/unlock operation came from RFID card" },
                    {
                        tag: "field", name: "Biometric",
                        description: "Lock/unlock operation came from biometric source (e.g. face, fingerprint/fingervein)"
                    },
                    {
                        tag: "field", name: "Aliro",
                        description: "Lock/unlock operation came from an interaction defined in [Aliro], or user change operation was a step-up credential provisioning as defined in [Aliro]"
                    }
                ]
            },

            {
                tag: "datatype", name: "UserStatusEnum", xref: "cluster§5.2.6.17",
                details: "This enumeration shall indicate what the status is for a specific user ID.",
                children: [
                    { tag: "field", name: "Available", description: "The user ID is available" },
                    { tag: "field", name: "OccupiedEnabled", description: "The user ID is occupied and enabled" },
                    { tag: "field", name: "OccupiedDisabled", description: "The user ID is occupied and disabled" }
                ]
            },

            {
                tag: "datatype", name: "UserTypeEnum", xref: "cluster§5.2.6.18",
                details: "This enumeration shall indicate what the type is for a specific user ID.",

                children: [
                    {
                        tag: "field", name: "UnrestrictedUser", description: "The user ID type is unrestricted",
                        xref: "cluster§5.2.6.18.1",
                        details: "This value shall indicate the user has access 24/7 provided proper PIN or RFID is supplied (e.g., " +
                            "owner)."
                    },

                    {
                        tag: "field", name: "YearDayScheduleUser", description: "The user ID type is schedule",
                        xref: "cluster§5.2.6.18.2",

                        details: "This value shall indicate the user has the ability to open lock within a specific time period (e.g., " +
                            "guest)." +
                            "\n" +
                            "When UserType is set to YearDayScheduleUser, user access shall be restricted as follows:" +
                            "\n" +
                            "  • If no YearDaySchedules are set for the user, then access shall be denied" +
                            "\n" +
                            "  • If one or more YearDaySchedules are set, user access shall be granted if and only if the current " +
                            "    time falls within at least one of the YearDaySchedules. If current time is not known, user " +
                            "    access shall NOT be granted."
                    },

                    {
                        tag: "field", name: "WeekDayScheduleUser", description: "The user ID type is schedule",
                        xref: "cluster§5.2.6.18.3",

                        details: "This value shall indicate the user has the ability to open lock based on specific time period within " +
                            "a reoccurring weekly schedule (e.g., cleaning worker)." +
                            "\n" +
                            "When UserType is set to WeekDayScheduleUser, user access shall be restricted as follows:" +
                            "\n" +
                            "  • If no WeekDaySchedules are set for the user, then access shall be denied" +
                            "\n" +
                            "  • If one or more WeekDaySchedules are set, user access shall be granted if and only if the current " +
                            "    time falls within at least one of the WeekDaySchedules. If current time is not known, user " +
                            "    access shall NOT be granted."
                    },

                    {
                        tag: "field", name: "ProgrammingUser", description: "The user ID type is programming",
                        xref: "cluster§5.2.6.18.4",
                        details: "This value shall indicate the user has the ability to both program and operate the door lock. This " +
                            "user can manage the users and user schedules. In all other respects this user matches the " +
                            "unrestricted (default) user. ProgrammingUser is the only user that can disable the user interface " +
                            "(keypad, remote, etc…)."
                    },

                    {
                        tag: "field", name: "NonAccessUser", description: "The user ID type is non access",
                        xref: "cluster§5.2.6.18.5",
                        details: "This value shall indicate the user is recognized by the lock but does not have the ability to open " +
                            "the lock. This user will only cause the lock to generate the appropriate event notification to any " +
                            "bound devices."
                    },

                    {
                        tag: "field", name: "ForcedUser", description: "The user ID type is forced",
                        xref: "cluster§5.2.6.18.6",
                        details: "This value shall indicate the user has the ability to open lock but a ForcedUser LockOperationType " +
                            "and ForcedUser silent alarm will be emitted to allow a notified Node to alert emergency services or " +
                            "contacts on the user account when used."
                    },

                    {
                        tag: "field", name: "DisposableUser", description: "The user ID type is disposable",
                        xref: "cluster§5.2.6.18.7",
                        details: "This value shall indicate the user has the ability to open lock once after which the lock shall " +
                            "change the corresponding user record UserStatus value to OccupiedDisabled automatically."
                    },

                    {
                        tag: "field", name: "ExpiringUser", description: "The user ID type is expiring",
                        xref: "cluster§5.2.6.18.8",
                        details: "This value shall indicate the user has the ability to open lock for ExpiringUserTimeout attribute " +
                            "minutes after the first use of the PIN code, RFID code, Fingerprint, or other credential. After " +
                            "ExpiringUserTimeout minutes the corresponding user record UserStatus value shall be set to " +
                            "OccupiedDisabled automatically by the lock. The lock shall persist the timeout across reboots such " +
                            "that the ExpiringUserTimeout is honored."
                    },

                    {
                        tag: "field", name: "ScheduleRestrictedUser",
                        description: "The user ID type is schedule restricted", xref: "cluster§5.2.6.18.9",

                        details: "This value shall indicate the user access is restricted by Week Day and/or Year Day schedule. When " +
                            "UserType is set to ScheduleRestrictedUser, user access shall be restricted as follows:" +
                            "\n" +
                            "  • If no WeekDaySchedules and no YearDaySchedules are set for the user, then access shall be denied" +
                            "\n" +
                            "  • If one or more WeekDaySchedules are set, but no YearDaySchedules are set for the user, then user " +
                            "    access shall be equivalent to the WeekDayScheduleUser UserType" +
                            "\n" +
                            "  • If one or more YearDaySchedules are set, but no WeekDaySchedules are set for the user, then user " +
                            "    access shall be equivalent to the YearDayScheduleUser UserType" +
                            "\n" +
                            "  • If one or WeekDaySchedules are set AND one or more YearDaySchedules are set, then user access " +
                            "    shall be granted if and only if the current time falls within at least one of the " +
                            "    WeekDaySchedules AND the current time falls within at least one of the YearDaySchedules."
                    },

                    {
                        tag: "field", name: "RemoteOnlyUser", description: "The user ID type is remote only",
                        xref: "cluster§5.2.6.18.10",
                        details: "This value shall indicate the user access and PIN code is restricted to remote lock/unlock commands " +
                            "only. This type of user might be useful for regular delivery services or voice assistant unlocking " +
                            "operations to prevent a PIN code credential created for them from being used at the keypad. The PIN " +
                            "code credential would only be provided over-the-air for the lock/unlock commands."
                    }
                ]
            },

            {
                tag: "datatype", name: "LockStateEnum", xref: "cluster§5.2.6.19",

                children: [
                    { tag: "field", name: "NotFullyLocked", description: "Lock state is not fully locked" },
                    { tag: "field", name: "Locked", description: "Lock state is fully locked" },
                    { tag: "field", name: "Unlocked", description: "Lock state is fully unlocked" },
                    {
                        tag: "field", name: "Unlatched",
                        description: "Lock state is fully unlocked and the latch is pulled"
                    }
                ]
            },

            {
                tag: "datatype", name: "LockTypeEnum", xref: "cluster§5.2.6.20",

                children: [
                    { tag: "field", name: "DeadBolt", description: "Physical lock type is dead bolt" },
                    { tag: "field", name: "Magnetic", description: "Physical lock type is magnetic" },
                    { tag: "field", name: "Other", description: "Physical lock type is other" },
                    { tag: "field", name: "Mortise", description: "Physical lock type is mortise" },
                    { tag: "field", name: "Rim", description: "Physical lock type is rim" },
                    { tag: "field", name: "LatchBolt", description: "Physical lock type is latch bolt" },
                    { tag: "field", name: "CylindricalLock", description: "Physical lock type is cylindrical lock" },
                    { tag: "field", name: "TubularLock", description: "Physical lock type is tubular lock" },
                    { tag: "field", name: "InterconnectedLock", description: "Physical lock type is interconnected lock" },
                    { tag: "field", name: "DeadLatch", description: "Physical lock type is dead latch" },
                    { tag: "field", name: "DoorFurniture", description: "Physical lock type is door furniture" },
                    { tag: "field", name: "Eurocylinder", description: "Physical lock type is euro cylinder" }
                ]
            },

            {
                tag: "datatype", name: "LEDSettingEnum", xref: "cluster§5.2.6.21",

                children: [
                    { tag: "field", name: "NoLedSignal", description: "Never use LED for signalization" },
                    {
                        tag: "field", name: "NoLedSignalAccessAllowed",
                        description: "Use LED signalization except for access allowed events"
                    },
                    { tag: "field", name: "LedSignalAll", description: "Use LED signalization for all events" }
                ]
            },

            {
                tag: "datatype", name: "SoundVolumeEnum", xref: "cluster§5.2.6.22",

                children: [
                    { tag: "field", name: "Silent", description: "Silent Mode" },
                    { tag: "field", name: "Low", description: "Low Volume" },
                    { tag: "field", name: "High", description: "High Volume" },
                    { tag: "field", name: "Medium", description: "Medium Volume" }
                ]
            },

            {
                tag: "datatype", name: "EventTypeEnum", xref: "cluster§5.2.6.23",
                children: [
                    { tag: "field", name: "Operation", description: "Event type is operation" },
                    { tag: "field", name: "Programming", description: "Event type is programming" },
                    { tag: "field", name: "Alarm", description: "Event type is alarm" }
                ]
            },

            {
                tag: "datatype", name: "CredentialStruct", xref: "cluster§5.2.6.24",
                details: "This struct shall indicate the credential types and their corresponding indices (if any) for the " +
                    "event or user record.",

                children: [
                    {
                        tag: "field", name: "CredentialType", xref: "cluster§5.2.6.24.1",
                        details: "This field shall indicate the credential field used to authorize the lock operation."
                    },

                    {
                        tag: "field", name: "CredentialIndex", xref: "cluster§5.2.6.24.2",
                        details: "This field shall indicate the index of the specific credential used to authorize the lock operation " +
                            "in the list of credentials identified by CredentialType (e.g. PIN, RFID, etc.). This field shall be " +
                            "set to 0 if CredentialType is ProgrammingPIN or does not correspond to a list that can be indexed " +
                            "into."
                    }
                ]
            },

            {
                tag: "datatype", name: "StatusCodeEnum", xref: "cluster§5.2.7.1",
                children: [
                    { tag: "field", name: "Duplicate", description: "Entry would cause a duplicate credential/ID." },
                    { tag: "field", name: "Occupied", description: "Entry would replace an occupied slot." }
                ]
            }
        ]
    }
);

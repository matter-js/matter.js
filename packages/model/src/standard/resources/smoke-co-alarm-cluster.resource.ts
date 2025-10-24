/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "SmokeCoAlarm", classification: "application", pics: "SMOKECO",
    xref: "cluster§2.11",
    details: "This cluster provides an interface for observing and managing the state of smoke and CO alarms.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.11.4",
            children: [
                { tag: "field", name: "SMOKE", details: "Supports Smoke alarm" },
                { tag: "field", name: "CO", details: "Supports CO alarm" }
            ]
        },

        {
            tag: "attribute", name: "ExpressedState", xref: "cluster§2.11.6.1",

            details: "Indicates the visibly- and audibly-expressed state of the alarm. When multiple alarm conditions are " +
                "being reflected in the server, this attribute shall indicate the condition with the highest " +
                "priority. Priority order of conditions is determined by the manufacturer and shall be supplied as a " +
                "part of certification procedure. If the value of ExpressedState is not Normal, the attribute " +
                "corresponding to the value shall NOT be Normal. For example, if the ExpressedState is set to " +
                "SmokeAlarm, the value of the SmokeState will indicate the severity of the alarm (Warning or " +
                "Critical). Clients SHOULD also read the other attributes to be aware of further alarm conditions " +
                "beyond the one indicated in ExpressedState." +
                "\n" +
                "Visible expression is typically a LED light pattern. Audible expression is a horn or speaker " +
                "pattern. Audible expression shall BE suppressed if the DeviceMuted attribute is supported and set to " +
                "Muted."
        },

        {
            tag: "attribute", name: "SmokeState", xref: "cluster§2.11.6.2",
            details: "Indicates whether the device’s smoke sensor is currently triggering a smoke alarm."
        },
        {
            tag: "attribute", name: "CoState", xref: "cluster§2.11.6.3",
            details: "Indicates whether the device’s CO sensor is currently triggering a CO alarm."
        },

        {
            tag: "attribute", name: "BatteryAlert", xref: "cluster§2.11.6.4",
            details: "Indicates whether the power resource fault detection mechanism is currently triggered at the device. " +
                "If the detection mechanism is triggered, this attribute shall be set to Warning or Critical, " +
                "otherwise it shall be set to Normal. The battery state shall also be reflected in the Power Source " +
                "cluster representing the device’s battery using the appropriate supported attributes and events."
        },

        {
            tag: "attribute", name: "DeviceMuted", xref: "cluster§2.11.6.5",
            details: "Indicates the whether the audible expression of the device is currently muted. Audible expression is " +
                "typically a horn or speaker pattern."
        },
        {
            tag: "attribute", name: "TestInProgress", xref: "cluster§2.11.6.6",
            details: "Indicates whether the device self-test is currently activated. If the device self-test is activated, " +
                "this attribute shall be set to True, otherwise it shall be set to False."
        },
        {
            tag: "attribute", name: "HardwareFaultAlert", xref: "cluster§2.11.6.7",
            details: "Indicates whether the hardware fault detection mechanism is currently triggered. If the detection " +
                "mechanism is triggered, this attribute shall be set to True, otherwise it shall be set to False."
        },
        {
            tag: "attribute", name: "EndOfServiceAlert", xref: "cluster§2.11.6.8",
            details: "Indicates whether the end-of-service has been triggered at the device. This attribute shall be set " +
                "to Expired when the device reaches the end-of-service."
        },

        {
            tag: "attribute", name: "InterconnectSmokeAlarm", xref: "cluster§2.11.6.9",
            details: "Indicates whether the interconnected smoke alarm is currently triggering by branching devices. When " +
                "the interconnected smoke alarm is being triggered, this attribute shall be set to Warning or " +
                "Critical, otherwise it shall be set to Normal."
        },

        {
            tag: "attribute", name: "InterconnectCoAlarm", xref: "cluster§2.11.6.10",
            details: "Indicates whether the interconnected CO alarm is currently triggering by branching devices. When the " +
                "interconnected CO alarm is being triggered, this attribute shall be set to Warning or Critical, " +
                "otherwise it shall be set to Normal."
        },

        {
            tag: "attribute", name: "ContaminationState", xref: "cluster§2.11.6.11",
            details: "Indicates the contamination level of the smoke sensor."
        },
        {
            tag: "attribute", name: "SmokeSensitivityLevel", xref: "cluster§2.11.6.12",
            details: "Indicates the sensitivity level of the smoke sensor configured on the device."
        },

        {
            tag: "attribute", name: "ExpiryDate", xref: "cluster§2.11.6.13",
            details: "Indicates the date when the device reaches its stated expiry date. After the ExpiryDate has been " +
                "reached, the EndOfServiceAlert shall start to be triggered. To account for better customer " +
                "experience across time zones, the EndOfServiceAlert may be delayed by up to 24 hours after the " +
                "ExpiryDate. Similarly, clients may delay any actions based on the ExpiryDate by up to 24 hours to " +
                "best align with the local time zone."
        },

        {
            tag: "event", name: "SmokeAlarm", xref: "cluster§2.11.8.1",
            details: "This event shall be generated when SmokeState attribute changes to either Warning or Critical state.",
            children: [{
                tag: "field", name: "AlarmSeverityLevel", xref: "cluster§2.11.8.1.1",
                details: "This field shall indicate the current value of the SmokeState attribute."
            }]
        },

        {
            tag: "event", name: "CoAlarm", xref: "cluster§2.11.8.2",
            details: "This event shall be generated when COState attribute changes to either Warning or Critical state.",
            children: [{
                tag: "field", name: "AlarmSeverityLevel", xref: "cluster§2.11.8.2.1",
                details: "This field shall indicate the current value of the COState attribute."
            }]
        },

        {
            tag: "event", name: "LowBattery", xref: "cluster§2.11.8.3",
            details: "This event shall be generated when BatteryAlert attribute changes to either Warning or Critical " +
                "state.",
            children: [{
                tag: "field", name: "AlarmSeverityLevel", xref: "cluster§2.11.8.3.1",
                details: "This field shall indicate the current value of the BatteryAlert attribute."
            }]
        },

        {
            tag: "event", name: "HardwareFault", xref: "cluster§2.11.8.4",
            details: "This event shall be generated when the device detects a hardware fault that leads to setting " +
                "HardwareFaultAlert to True."
        },
        {
            tag: "event", name: "EndOfService", xref: "cluster§2.11.8.5",
            details: "This event shall be generated when the EndOfServiceAlert is set to Expired."
        },
        {
            tag: "event", name: "SelfTestComplete", xref: "cluster§2.11.8.6",
            details: "This event shall be generated when the SelfTest completes, and the attribute TestInProgress changes " +
                "to False."
        },
        {
            tag: "event", name: "AlarmMuted", xref: "cluster§2.11.8.7",
            details: "This event shall be generated when the DeviceMuted attribute changes to Muted."
        },
        {
            tag: "event", name: "MuteEnded", xref: "cluster§2.11.8.8",
            details: "This event shall be generated when DeviceMuted attribute changes to NotMuted."
        },

        {
            tag: "event", name: "InterconnectSmokeAlarm", xref: "cluster§2.11.8.9",
            details: "This event shall be generated when the device hosting the server receives a smoke alarm from an " +
                "interconnected sensor.",
            children: [{
                tag: "field", name: "AlarmSeverityLevel", xref: "cluster§2.11.8.9.1",
                details: "This field shall indicate the current value of the InterconnectSmokeAlarm attribute."
            }]
        },

        {
            tag: "event", name: "InterconnectCoAlarm", xref: "cluster§2.11.8.10",
            details: "This event shall be generated when the device hosting the server receives a CO alarm from an " +
                "interconnected sensor.",
            children: [{
                tag: "field", name: "AlarmSeverityLevel", xref: "cluster§2.11.8.10.1",
                details: "This field shall indicate the current value of the InterconnectCOAlarm attribute."
            }]
        },

        {
            tag: "event", name: "AllClear", xref: "cluster§2.11.8.11",
            details: "This event shall be generated when ExpressedState attribute returns to Normal state."
        },

        {
            tag: "command", name: "SelfTestRequest", xref: "cluster§2.11.7.1",

            details: "This command shall initiate a device self-test. The return status shall indicate whether the test " +
                "was successfully initiated. Only one SelfTestRequest may be processed at a time. When the value of " +
                "the ExpressedState attribute is any of SmokeAlarm, COAlarm, Testing, InterconnectSmoke, " +
                "InterconnectCO, the device shall NOT execute the self-test, and shall return status code BUSY." +
                "\n" +
                "Upon successful acceptance of SelfTestRequest, the TestInProgress attribute shall be set to True and " +
                "ExpressedState attribute shall be set to Testing. Any faults identified during the test shall be " +
                "reflected in the appropriate attributes and events. Upon completion of the self test procedure, the " +
                "SelfTestComplete event shall be generated, the TestInProgress attribute shall be set to False and " +
                "ExpressedState attribute shall be updated to reflect the current state of the server."
        },

        {
            tag: "datatype", name: "AlarmStateEnum", xref: "cluster§2.11.5.1",

            children: [
                {
                    tag: "field", name: "Normal", description: "Nominal state, the device is not alarming",
                    xref: "cluster§2.11.5.1.1",
                    details: "This value shall indicate that this alarm is not alarming."
                },
                {
                    tag: "field", name: "Warning", description: "Warning state", xref: "cluster§2.11.5.1.2",
                    details: "This value shall indicate that this alarm is in a warning state. Alarms in this state SHOULD be " +
                        "subject to being muted via physical interaction."
                },
                {
                    tag: "field", name: "Critical", description: "Critical state", xref: "cluster§2.11.5.1.3",
                    details: "This value shall indicate that this alarm is in a critical state. Alarms in this state shall NOT be " +
                        "subject to being muted via physical interaction."
                }
            ]
        },

        {
            tag: "datatype", name: "SensitivityEnum", xref: "cluster§2.11.5.2",
            children: [
                { tag: "field", name: "High", description: "High sensitivity" },
                { tag: "field", name: "Standard", description: "Standard Sensitivity" },
                { tag: "field", name: "Low", description: "Low sensitivity" }
            ]
        },

        {
            tag: "datatype", name: "ExpressedStateEnum", xref: "cluster§2.11.5.3",
            details: "This value shall indicate that this alarm is not alarming.",

            children: [
                { tag: "field", name: "Normal", description: "Nominal state, the device is not alarming" },

                {
                    tag: "field", name: "SmokeAlarm", description: "Smoke Alarm state", xref: "cluster§2.11.5.3.2",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of Smoke Alarm. " +
                        "This value shall indicate that the alarm is currently expressing audible indication of Smoke Alarm " +
                        "unless the DeviceMuted attribute is supported and set to Muted."
                },

                {
                    tag: "field", name: "CoAlarm", description: "CO Alarm state", xref: "cluster§2.11.5.3.3",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of CO Alarm. " +
                        "This value shall indicate that the alarm is currently expressing audible indication of CO Alarm " +
                        "unless the DeviceMuted attribute is supported and set to Muted."
                },

                {
                    tag: "field", name: "BatteryAlert", description: "Battery Alert State", xref: "cluster§2.11.5.3.4",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of Critical Low " +
                        "Battery. This value shall indicate that the alarm is currently expressing audible indication of " +
                        "Critical Low Battery unless the DeviceMuted attribute is supported and set to Muted."
                },

                {
                    tag: "field", name: "Testing", description: "Test in Progress", xref: "cluster§2.11.5.3.5",
                    details: "This value shall indicate that this alarm is currently expressing visual and audible indication of " +
                        "SelfTest."
                },

                {
                    tag: "field", name: "HardwareFault", description: "Hardware Fault Alert State",
                    xref: "cluster§2.11.5.3.6",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of Hardware " +
                        "Fault. This value shall indicate that the alarm is currently expressing audible indication of " +
                        "Hardware Fault unless the DeviceMuted attribute is supported and set to Muted."
                },

                {
                    tag: "field", name: "EndOfService", description: "End of Service Alert State",
                    xref: "cluster§2.11.5.3.7",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of End Of " +
                        "Service. This value shall indicate that the alarm is currently expressing audible indication of End " +
                        "of Service unless the DeviceMuted attribute is supported and set to Muted."
                },

                {
                    tag: "field", name: "InterconnectSmoke", description: "Interconnected Smoke Alarm State",
                    xref: "cluster§2.11.5.3.8",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of Smoke Alarm " +
                        "caused by Interconnect. This value shall indicate that the alarm is currently expressing audible " +
                        "indication of Smoke Alarm caused by Interconnect unless the DeviceMuted attribute is supported and " +
                        "set to Muted."
                },

                {
                    tag: "field", name: "InterconnectCo", description: "Interconnected CO Alarm State",
                    xref: "cluster§2.11.5.3.9",
                    details: "This value shall indicate that this alarm is currently expressing visual indication of CO Alarm " +
                        "caused by Interconnect. This value shall indicate that the alarm is currently expressing audible " +
                        "indication of CO Alarm caused by Interconnect unless the DeviceMuted attribute is supported and set " +
                        "to Muted."
                }
            ]
        },

        {
            tag: "datatype", name: "MuteStateEnum", xref: "cluster§2.11.5.4",

            children: [
                {
                    tag: "field", name: "NotMuted", description: "Not Muted", xref: "cluster§2.11.5.4.1",
                    details: "This value shall indicate that the device is not muted."
                },
                {
                    tag: "field", name: "Muted", description: "Muted", xref: "cluster§2.11.5.4.2",
                    details: "This value shall indicate that the device is muted."
                }
            ]
        },

        {
            tag: "datatype", name: "EndOfServiceEnum", xref: "cluster§2.11.5.5",

            children: [
                {
                    tag: "field", name: "Normal", description: "Device has not expired", xref: "cluster§2.11.5.5.2",
                    details: "This value shall indicate that the device has not yet reached its end of service, and does not need " +
                        "to be imminently replaced."
                },
                {
                    tag: "field", name: "Expired", description: "Device has reached its end of service",
                    xref: "cluster§2.11.5.5.1",
                    details: "This value shall indicate that the device has reached its end of service, and needs to be replaced."
                }
            ]
        },

        {
            tag: "datatype", name: "ContaminationStateEnum", xref: "cluster§2.11.5.6",
            details: "This value shall indicate that the smoke sensor has nominal contamination levels, no customer action " +
                "is required.",

            children: [
                { tag: "field", name: "Normal", description: "Nominal state, the sensor is not contaminated" },
                {
                    tag: "field", name: "Low", description: "Low contamination", xref: "cluster§2.11.5.6.2",
                    details: "This value shall indicate that the smoke sensor has detectable contamination levels, but the " +
                        "contamination is too low to cause a visible or audible alarm."
                },
                {
                    tag: "field", name: "Warning", description: "Warning state", xref: "cluster§2.11.5.6.3",
                    details: "This value shall indicate that the smoke sensor has contamination levels in a warning state. At this " +
                        "level, the contamination may cause a visible or audible alarm. User intervention is suggested."
                },

                {
                    tag: "field", name: "Critical", description: "Critical state, will cause nuisance alarms",
                    xref: "cluster§2.11.5.6.4",
                    details: "This value shall indicate that the smoke sensor has contamination levels in a critical state. At " +
                        "this level, the contamination should cause a visible or audible alarm. User intervention is " +
                        "required. Critical contamination of the sensor shall also be reflected as a HardwareFault."
                }
            ]
        }
    ]
});

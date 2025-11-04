/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "TimeSynchronization", pics: "TIMESYNC", xref: "core§11.17",

    details: "Accurate time is required for a number of reasons, including scheduling, display and validating " +
        "security materials." +
        "\n" +
        "This section describes a mechanism for Nodes to achieve and maintain time synchronization. The Time " +
        "Synchronization cluster provides attributes for reading a Node’s current time. It also allows " +
        "Administrators to set current time, time zone and daylight savings time (DST) settings." +
        "\n" +
        "The Time Synchronization cluster may be present on the root node endpoint, and shall NOT be present " +
        "on any other Endpoint of any Node.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.17.5",

            children: [
                {
                    tag: "field", name: "TZ", xref: "core§11.17.5.1",
                    details: "Allows a server to translate a UTC time to a local time using the time zone and daylight savings " +
                        "time (DST) offsets. If a server supports the TimeZone feature, it shall support the SetTimeZone and " +
                        "SetDSTOffset commands, and TimeZone and DSTOffset attributes, and shall expose the local time " +
                        "through the LocalTime attribute."
                },

                {
                    tag: "field", name: "NTPC", xref: "core§11.17.5.2",
                    details: "Allows a node to use NTP/SNTP for time synchronization."
                },
                {
                    tag: "field", name: "NTPS", xref: "core§11.17.5.3",
                    details: "Allows a Node to host an NTP server for the network so that other Nodes can achieve a high accuracy " +
                        "time synchronization within the network. See Section 11.17.15, “Acting as an NTP Server”."
                },
                {
                    tag: "field", name: "TSC", xref: "core§11.17.5.4",
                    details: "This node also supports a time synchronization client and can connect to and read time from other " +
                        "nodes."
                }
            ]
        },

        {
            tag: "attribute", name: "UtcTime", xref: "core§11.17.8.1",
            details: "If the node has achieved time synchronization, this attribute shall indicate the current time as a " +
                "UTC epoch-us (Epoch Time in Microseconds)." +
                "\n" +
                "If the node has not achieved time synchronization, this attribute shall be null. This attribute may " +
                "be set when a SetUTCTime is received."
        },

        {
            tag: "attribute", name: "Granularity", xref: "core§11.17.8.2",
            details: "Indicates granularity of the error that the node is willing to guarantee on the time " +
                "synchronization. It is of type GranularityEnum." +
                "\n" +
                "This value shall be set to NoTimeGranularity if UTCTime is null and shall NOT be set to " +
                "NoTimeGranularity if UTCTime is non-null."
        },

        {
            tag: "attribute", name: "TimeSource", xref: "core§11.17.8.3",

            details: "Indicates the node’s time source. This attribute indicates what method the node is using to sync, " +
                "whether the source uses NTS or not and whether the source is internal or external to the Matter " +
                "network. This attribute may be used by a client to determine its level of trust in the UTCTime. It " +
                "is of type TimeSourceEnum." +
                "\n" +
                "If a node is unsure if the selected NTP server is within the Matter network, it SHOULD select one of " +
                "the NonMatter* values." +
                "\n" +
                "This value shall be set to None if UTCTime is null and shall NOT be set to None if UTCTime is " +
                "non-null."
        },

        {
            tag: "attribute", name: "TrustedTimeSource", xref: "core§11.17.8.4",
            details: "Indicates the Node ID, endpoint, and associated fabric index of a Node that may be used as trusted " +
                "time source. See Section 11.17.13, “Time source prioritization”. This attribute reflects the last " +
                "value set by an administrator using the SetTrustedTimeSource command. If the value is null, no " +
                "trusted time source has yet been set."
        },

        {
            tag: "attribute", name: "DefaultNtp", xref: "core§11.17.8.5",

            details: "Indicates the default NTP server that this Node may use if other time sources are unavailable. This " +
                "attribute is settable by an Administrator using the SetDefaultNTP command. It SHOULD be set by the " +
                "Commissioner during commissioning. If no default NTP server is available, the Commissioner may set " +
                "this value to null. The default IANA assigned NTP port of 123 shall be used to access the NTP " +
                "server." +
                "\n" +
                "If set, the format of this attribute shall be a domain name or a static IPv6 address with no port, " +
                "in text format, as specified in RFC 5952. The address format shall follow the recommendations in " +
                "Section 4 and shall NOT contain a port number."
        },

        {
            tag: "attribute", name: "TimeZone", xref: "core§11.17.8.6",

            details: "This attribute shall contain a list of time zone offsets from UTC and when they shall take effect." +
                "\n" +
                "This attribute uses a list of time offset configurations to allow Nodes to handle scheduled " +
                "regulatory time zone changes. This attribute shall NOT be used to indicate daylight savings time " +
                "changes (see Section 11.17.8.7, “DSTOffset Attribute” for daylight savings time)." +
                "\n" +
                "The first entry shall have a ValidAt entry of 0. If there is a second entry, it shall have a " +
                "non-zero ValidAt time." +
                "\n" +
                "If a node supports a TimeZoneDatabase, and it has data for the given time zone Name and the given " +
                "Offset matches, the node may update its own DSTOffset attribute to add new DST change times as " +
                "required, based on the Name fields of the TimeZoneStruct. Administrators may add additional entries " +
                "to the DSTOffset of other Nodes with the same time zone, if required." +
                "\n" +
                "If a node does not support a TimeZoneDatabase, the Name field of the TimeZoneStruct is only " +
                "applicable for client-side localization. In particular:" +
                "\n" +
                "  • If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate " +
                "    the local time." +
                "\n" +
                "  • If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate " +
                "    DST start or end dates." +
                "\n" +
                "When time passes, the node SHOULD remove any entries which are no longer active and change the " +
                "ValidAt time for the currently used TimeZoneStruct list item to zero." +
                "\n" +
                "This attribute shall have at least one entry. If the node does not have a default time zone and no " +
                "time zone has been set, it may set this value to a list containing a single TimeZoneStruct with an " +
                "offset of 0 (UTC) and a ValidAt time of 0."
        },

        {
            tag: "attribute", name: "DstOffset", xref: "core§11.17.8.7",

            details: "This attribute shall contain a list of offsets to apply for daylight savings time, and their " +
                "validity period." +
                "\n" +
                "List entries shall be sorted by ValidStarting time." +
                "\n" +
                "A list entry shall NOT have a ValidStarting time that is smaller than the ValidUntil time of the " +
                "previous entry. There shall be at most one list entry with a null ValidUntil time and, if such an " +
                "entry is present, it shall appear last in the list." +
                "\n" +
                "Over time, the node SHOULD remove any entries which are no longer active from the list." +
                "\n" +
                "Over time, if the node supports a TimeZoneDatabase and it has information available for the given " +
                "time zone name, it may update its own list to add additional entries." +
                "\n" +
                "If a time zone does not use DST, this shall be indicated by a single entry with a 0 offset and a " +
                "null ValidUntil field."
        },

        {
            tag: "attribute", name: "LocalTime", xref: "core§11.17.8.8",

            details: "Indicates the computed current local time of the node as a epoch-us (Epoch Time in Microseconds). " +
                "The value of LocalTime shall be the sum of the UTCTime, the offset of the currently valid " +
                "TimeZoneStruct from the TimeZone attribute (converted to microseconds), and the offset of the " +
                "currently valid DSTOffsetStruct from the DSTOffset attribute (converted to microseconds), if such an " +
                "entry exists." +
                "\n" +
                "If the node has not achieved time synchronization, this shall be null. If the node has an empty " +
                "DSTOffset, this shall be null."
        },

        {
            tag: "attribute", name: "TimeZoneDatabase", xref: "core§11.17.8.9",
            details: "Indicates whether the node has access to a time zone database. Nodes with a time zone database may " +
                "update their own DSTOffset attribute to add new entries and may push DSTOffset updates to other " +
                "Nodes in the same time zone as required."
        },

        {
            tag: "attribute", name: "NtpServerAvailable", xref: "core§11.17.8.10",
            details: "Indicates if the node is running an RFC 5905 NTPv4 compliant server on port 123, this value shall be " +
                "True." +
                "\n" +
                "If the node is not currently running an NTP server, this value shall be False."
        },

        {
            tag: "attribute", name: "TimeZoneListMaxSize", xref: "core§11.17.8.11",
            details: "Indicates the number of supported list entries in the TimeZone attribute. This attribute may take " +
                "the value of 1 or 2, where the optional second list entry may be used to handle scheduled regulatory " +
                "time zone changes."
        },

        {
            tag: "attribute", name: "DstOffsetListMaxSize", xref: "core§11.17.8.12",
            details: "Indicates the number of supported list entries in DSTOffset attribute. This value must be at least " +
                "1."
        },
        {
            tag: "attribute", name: "SupportsDnsResolve", xref: "core§11.17.8.13",
            details: "Indicates if the node supports resolving a domain name. DefaultNTP Address values for these nodes " +
                "may include domain names. If this is False, the Address for a DefaultNTP shall be an IPv6 address."
        },

        {
            tag: "event", name: "DstTableEmpty", xref: "core§11.17.10.1",

            details: "This event shall be generated when the node stops applying the current DSTOffset and there are no " +
                "entries in the list with a larger ValidStarting time, indicating the need to possibly get new DST " +
                "data. This event shall also be generated if the DSTOffset list is cleared either by a SetTimeZone " +
                "command, or by a SetDSTOffset command with an empty list." +
                "\n" +
                "The node shall generate this event if the node has not generated a DSTTableEmpty event in the last " +
                "hour, and the DSTOffset list is empty when the node attempts to update its time. DSTTableEmpty " +
                "events corresponding to a time update SHOULD NOT be generated more often than once per hour." +
                "\n" +
                "There is no data for this event."
        },

        {
            tag: "event", name: "DstStatus", xref: "core§11.17.10.2",
            details: "This event shall be generated when the node starts or stops applying a DST offset.",
            children: [{
                tag: "field", name: "DstOffsetActive", xref: "core§11.17.10.2.1",
                details: "Indicates whether the current DST offset is being applied (i.e, daylight savings time is applied, as " +
                    "opposed to standard time)."
            }]
        },

        {
            tag: "event", name: "TimeZoneStatus", xref: "core§11.17.10.3",
            details: "This event shall be generated when the node changes its time zone offset or name. It shall NOT be " +
                "sent for DST changes that are not accompanied by a time zone change.",

            children: [
                {
                    tag: "field", name: "Offset", xref: "core§11.17.10.3.1",
                    details: "Current time zone offset from UTC in seconds."
                },
                {
                    tag: "field", name: "Name", xref: "core§11.17.10.3.2",
                    details: "Current time zone name. This name SHOULD use the country/city format specified by the IANA Time Zone " +
                        "Database."
                }
            ]
        },

        {
            tag: "event", name: "TimeFailure", xref: "core§11.17.10.4",
            details: "This event shall be generated if the node has not generated a TimeFailure event in the last hour, " +
                "and the node is unable to get a time from any source. This event SHOULD NOT be generated more often " +
                "than once per hour."
        },

        {
            tag: "event", name: "MissingTrustedTimeSource", xref: "core§11.17.10.5",

            details: "This event shall be generated if the TrustedTimeSource is set to null upon fabric removal or by a " +
                "SetTrustedTimeSource command." +
                "\n" +
                "This event shall also be generated if the node has not generated a MissingTrustedTimeSource event in " +
                "the last hour, and the node fails to update its time from the TrustedTimeSource because the " +
                "TrustedTimeSource is null or the specified peer cannot be reached. MissingTrustedTimeSource events " +
                "corresponding to a time update SHOULD NOT be generated more often than once per hour."
        },

        {
            tag: "command", name: "SetUtcTime", xref: "core§11.17.9.1",

            details: "This command is used to set the UTC time of the node." +
                "\n" +
                "This command may be issued by Administrator to set the time. If the Commissioner does not have a " +
                "valid time source, it may send a Granularity of NoTimeGranularity." +
                "\n" +
                "Upon receipt of this command, the node may update its UTCTime attribute to match the time specified " +
                "in the command, if the stated Granularity and TimeSource are acceptable. The node shall update its " +
                "UTCTime attribute if its current Granularity is NoTimeGranularity." +
                "\n" +
                "If the time is updated, the node shall also update its Granularity attribute based on the " +
                "granularity specified in the command and the expected clock drift of the node. This SHOULD normally " +
                "be one level lower than the stated command Granularity. It shall also update its TimeSource " +
                "attribute to Admin. It shall also update its Last Known Good UTC Time as defined in Section 3.5.6.1, " +
                "“Last Known Good UTC Time”." +
                "\n" +
                "If the node updates its UTCTime attribute, it shall accept the command with a status code of " +
                "SUCCESS. If it opts to not update its time, it shall fail the command with a cluster specific Status " +
                "Code of TimeNotAccepted.",

            children: [
                {
                    tag: "field", name: "UtcTime", xref: "core§11.17.9.1.1",
                    details: "This field shall give the Client’s UTC Time."
                },
                {
                    tag: "field", name: "Granularity", xref: "core§11.17.9.1.2",
                    details: "This field shall give the Client’s Granularity, as described in Granularity."
                },
                {
                    tag: "field", name: "TimeSource", xref: "core§11.17.9.1.3",
                    details: "This field shall give the Client’s TimeSource, as described in TimeSource."
                }
            ]
        },

        {
            tag: "command", name: "SetTrustedTimeSource", xref: "core§11.17.9.2",

            details: "This command is used to set the TrustedTimeSource attribute. Upon receipt of this command:" +
                "\n" +
                "  • If the TrustedTimeSource field in the command is null, the node shall set the TrustedTimeSource " +
                "    attribute to null and shall generate a MissingTrustedTimeSource event." +
                "\n" +
                "  • Otherwise, the node shall set the TrustedTimeSource attribute to a struct which has NodeID and " +
                "    Endpoint fields matching those in the TrustedTimeSource field and has its FabricIndex field set " +
                "    to the command’s accessing fabric index.",

            children: [{
                tag: "field", name: "TrustedTimeSource", xref: "core§11.17.9.2.1",
                details: "This field contains the Node ID and endpoint of a trusted time source on the accessing fabric."
            }]
        },

        {
            tag: "command", name: "SetTimeZone", xref: "core§11.17.9.3",

            details: "This command is used to set the time zone of the node." +
                "\n" +
                "If the given list is larger than the TimeZoneListMaxSize, the node shall respond with " +
                "RESOURCE_EXHAUSTED and the TimeZone attribute shall NOT be updated." +
                "\n" +
                "If the given list does not conform to the list requirements in TimeZone attribute the node shall " +
                "respond with a CONSTRAINT_ERROR and the TimeZone attribute shall NOT be updated." +
                "\n" +
                "If there are no errors in the list, the TimeZone field shall be copied to the TimeZone attribute. A " +
                "TimeZoneStatus event shall be generated with the new time zone information." +
                "\n" +
                "If the node supports a time zone database and it has information available for the time zone that " +
                "will be applied, it may set its DSTOffset attribute, otherwise the DSTOffset attribute shall be set " +
                "to an empty list. A DSTTableEmpty event shall be generated if the DSTOffset attribute is empty. A " +
                "DSTStatus event shall be generated if the node was previously applying a DST offset."
        },

        {
            tag: "command", name: "SetTimeZoneResponse", xref: "core§11.17.9.4",
            details: "THis command is used to report the result of a SetTimeZone command. This command shall be generated " +
                "in response to a SetTimeZone command.",

            children: [{
                tag: "field", name: "DstOffsetRequired", xref: "core§11.17.9.4.1",
                details: "If the node supports a time zone database with information for the time zone that will be applied, " +
                    "it may use this information to set the DSTOffset attribute. If the node is setting its own DSTOffset " +
                    "attribute, the DSTOffsetRequired field shall be set to false, otherwise it shall be set to true."
            }]
        },

        {
            tag: "command", name: "SetDstOffset", xref: "core§11.17.9.5",

            details: "This command is used to set the DST offsets for a node." +
                "\n" +
                "  • If the length of DSTOffset is larger than DSTOffsetListMaxSize, the node shall respond with " +
                "    RESOURCE_EXHAUSTED." +
                "\n" +
                "  • Else if the list entries do not conform to the list requirements for DSTOffset attribute, the " +
                "    node shall respond with CONSTRAINT_ERROR." +
                "\n" +
                "If there are no errors in the list, the DSTOffset field shall be copied to the DSTOffset attribute." +
                "\n" +
                "If the DSTOffset attribute change causes a corresponding change to the DST state, a DSTStatus event " +
                "shall be generated. If the list is empty, the node shall generate a DSTTableEmpty event."
        },

        {
            tag: "command", name: "SetDefaultNtp", xref: "core§11.17.9.6",

            details: "This command is used to set the DefaultNTP attribute." +
                "\n" +
                "If the DefaultNTP Address field does not conform to the requirements in the DefaultNTP attribute " +
                "description, the command shall fail with a status code of INVALID_COMMAND. If the node does not " +
                "support DNS resolution (as specified in SupportsDNSResolve) and the provided Address is a domain " +
                "name, the command shall fail with a status code of INVALID_COMMAND. Otherwise, the node shall set " +
                "the DefaultNTP attribute to match the DefaultNTP provided in this command.",

            children: [{
                tag: "field", name: "DefaultNtp", xref: "core§11.17.9.6.1",
                details: "This field contains the address of an NTP server than can be used as a fallback for time " +
                    "synchronization. The format of this field shall follow the requirements in the DefaultNTP attribute " +
                    "description."
            }]
        },

        {
            tag: "datatype", name: "GranularityEnum", xref: "core§11.17.6.1",

            children: [
                {
                    tag: "field", name: "NoTimeGranularity",
                    description: "This indicates that the node is not currently synchronized with a UTC Time source and its clock is based on the Last Known Good UTC Time only."
                },
                {
                    tag: "field", name: "MinutesGranularity",
                    description: "This indicates the node was synchronized to an upstream source in the past, but sufficient clock drift has occurred such that the clock error is now > 5 seconds."
                },
                {
                    tag: "field", name: "SecondsGranularity",
                    description: "This indicates the node is synchronized to an upstream source using a low resolution protocol. UTC Time is accurate to ± 5 seconds."
                },
                {
                    tag: "field", name: "MillisecondsGranularity",
                    description: "This indicates the node is synchronized to an upstream source using high resolution time-synchronization protocol such as NTP, or has built-in GNSS with some amount of jitter applying its GNSS timestamp. UTC Time is accurate to ± 50 ms."
                },
                {
                    tag: "field", name: "MicrosecondsGranularity",
                    description: "This indicates the node is synchronized to an upstream source using a highly precise time-synchronization protocol such as PTP, or has built-in GNSS. UTC time is accurate to ± 10 μs."
                }
            ]
        },

        {
            tag: "datatype", name: "TimeSourceEnum", xref: "core§11.17.6.2",

            children: [
                {
                    tag: "field", name: "None",
                    description: "Node is not currently synchronized with a UTC Time source."
                },
                { tag: "field", name: "Unknown", description: "Node uses an unlisted time source." },
                {
                    tag: "field", name: "Admin",
                    description: "Node received time from a client using the SetUTCTime Command."
                },
                {
                    tag: "field", name: "NodeTimeCluster",
                    description: "Synchronized time by querying the Time Synchronization cluster of another Node."
                },
                {
                    tag: "field", name: "NonMatterSntp",
                    description: "SNTP from a server not in the Matter network. NTS is not used."
                },
                {
                    tag: "field", name: "NonMatterNtp",
                    description: "NTP from servers not in the Matter network. None of the servers used NTS."
                },
                {
                    tag: "field", name: "MatterSntp",
                    description: "SNTP from a server within the Matter network. NTS is not used."
                },
                {
                    tag: "field", name: "MatterNtp",
                    description: "NTP from servers within the Matter network. None of the servers used NTS."
                },
                {
                    tag: "field", name: "MixedNtp",
                    description: "NTP from multiple servers in the Matter network and external. None of the servers used NTS."
                },
                {
                    tag: "field", name: "NonMatterSntpnts",
                    description: "SNTP from a server not in the Matter network. NTS is used."
                },
                {
                    tag: "field", name: "NonMatterNtpnts",
                    description: "NTP from servers not in the Matter network. NTS is used on at least one server."
                },
                {
                    tag: "field", name: "MatterSntpnts",
                    description: "SNTP from a server within the Matter network. NTS is used."
                },
                {
                    tag: "field", name: "MatterNtpnts",
                    description: "NTP from a server within the Matter network. NTS is used on at least one server."
                },
                {
                    tag: "field", name: "MixedNtpnts",
                    description: "NTP from multiple servers in the Matter network and external. NTS is used on at least one server."
                },
                {
                    tag: "field", name: "CloudSource",
                    description: "Time synchronization comes from a vendor cloud-based source (e.g. \"Date\" header in authenticated HTTPS connection)."
                },
                { tag: "field", name: "Ptp", description: "Time synchronization comes from PTP." },
                { tag: "field", name: "Gnss", description: "Time synchronization comes from a GNSS source." }
            ]
        },

        {
            tag: "datatype", name: "TimeZoneDatabaseEnum", xref: "core§11.17.6.3",
            details: "It indicates what the device knows about the contents of the IANA Time Zone Database. Partial " +
                "support on a device may be used to omit historical data, less commonly used time zones, and/or time " +
                "zones not related to the region a product is sold in.",
            children: [
                { tag: "field", name: "Full", description: "Node has a full list of the available time zones" },
                { tag: "field", name: "Partial", description: "Node has a partial list of the available time zones" },
                { tag: "field", name: "None", description: "Node does not have a time zone database" }
            ]
        },

        {
            tag: "datatype", name: "TrustedTimeSourceStruct", xref: "core§11.17.6.4",

            children: [
                {
                    tag: "field", name: "FabricIndex", xref: "core§11.17.6.4.1",
                    details: "The Fabric Index associated with the Fabric of the client which last set the value of the trusted " +
                        "time source node."
                },
                {
                    tag: "field", name: "NodeId", xref: "core§11.17.6.4.2",
                    details: "Node ID of the trusted time source node on the Fabric associated with the entry."
                },
                {
                    tag: "field", name: "Endpoint", xref: "core§11.17.6.4.3",
                    details: "Endpoint on the trusted time source node that contains the Time Synchronization cluster server."
                }
            ]
        },

        {
            tag: "datatype", name: "FabricScopedTrustedTimeSourceStruct", xref: "core§11.17.6.5",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.17.6.5.1",
                    details: "Node ID of the trusted time source node on the Fabric of the issuer."
                },

                {
                    tag: "field", name: "Endpoint", xref: "core§11.17.6.5.2",
                    details: "Endpoint on the trusted time source node that contains the Time Synchronization cluster server. This " +
                        "is provided to avoid having to do discovery of the location of that endpoint by walking over all " +
                        "endpoints and checking their Descriptor Cluster."
                }
            ]
        },

        {
            tag: "datatype", name: "TimeZoneStruct", xref: "core§11.17.6.6",

            children: [
                {
                    tag: "field", name: "Offset", xref: "core§11.17.6.6.1",
                    details: "The time zone offset from UTC in seconds."
                },
                {
                    tag: "field", name: "ValidAt", xref: "core§11.17.6.6.2",
                    details: "The UTC time when the offset shall be applied."
                },

                {
                    tag: "field", name: "Name", xref: "core§11.17.6.6.3",
                    details: "The time zone name SHOULD provide a human-readable time zone name and it SHOULD use the country/city " +
                        "format specified by the IANA Time Zone Database. The Name field may be used for display. If the node " +
                        "supports a TimeZoneDatabase it may use the Name field to set its own DST offsets if it has database " +
                        "information for the supplied time zone Name and the given Offset matches."
                }
            ]
        },

        {
            tag: "datatype", name: "DSTOffsetStruct", xref: "core§11.17.6.7",

            children: [
                {
                    tag: "field", name: "Offset", xref: "core§11.17.6.7.1",
                    details: "The DST offset in seconds. Normally this is in the range of 0 to 3600 seconds (1 hour), but this " +
                        "field will accept any values in the int32 range to accommodate potential future legislation that " +
                        "does not fit with these assumptions."
                },

                {
                    tag: "field", name: "ValidStarting", xref: "core§11.17.6.7.2",
                    details: "The UTC time when the offset shall be applied."
                },

                {
                    tag: "field", name: "ValidUntil", xref: "core§11.17.6.7.3",
                    details: "The UTC time when the offset shall stop being applied. Providing a null value here indicates a " +
                        "permanent DST change. If this value is non-null the value shall be larger than the ValidStarting " +
                        "time."
                }
            ]
        },

        {
            tag: "datatype", name: "StatusCodeEnum", xref: "core§11.17.7.1",
            children: [
                { tag: "field", name: "TimeNotAccepted", description: "Node rejected the attempt to set the UTC time" }
            ]
        }
    ]
});

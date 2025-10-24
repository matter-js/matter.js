/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ServiceArea", classification: "application", pics: "SEAR",
    xref: "cluster§1.17",

    details: "This cluster provides an interface for controlling the areas where a device should operate, for " +
        "reporting the status at each area, and for querying the current area." +
        "\n" +
        "The device may operate at one area at a time, as in the case of a mobile device, such as a robot. " +
        "Other devices may operate at (service) multiple areas simultaneously, as in the case of a sensor " +
        "that can monitor multiple areas. This cluster specification uses the term \"operate\" to describe both " +
        "the operating and servicing actions, regardless of the device type." +
        "\n" +
        "The cluster allows the client to select one or more areas on the server, to indicate where the " +
        "device SHOULD attempt to operate. An area is one of a list of options that may be presented by a " +
        "client for a user choice, or understood by the client, via the semantic data of the area." +
        "\n" +
        "The area semantic data is a combination of semantic tags, indicating one or more of the following: " +
        "the building floor, area type, landmark, and relative position.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§1.17.4",

            children: [
                {
                    tag: "field", name: "SELRUN", xref: "cluster§1.17.4.1",
                    details: "This feature indicates whether this device allows changing the selected areas, by using the " +
                        "SelectAreas command, while operating."
                },
                { tag: "field", name: "PROG", details: "The device implements the progress reporting feature" },
                { tag: "field", name: "MAPS", details: "The device has map support" }
            ]
        },

        {
            tag: "attribute", name: "SupportedAreas", xref: "cluster§1.17.6.1",

            details: "This attribute shall contain the list of areas that can be included in the SelectedAreas attribute’s " +
                "list. Each item in this list represents a unique area, as indicated by the AreaID field of " +
                "AreaStruct." +
                "\n" +
                "Each entry in this list shall have a unique value for the AreaID field." +
                "\n" +
                "If the SupportedMaps attribute is not empty, each entry in this list shall have a unique value for " +
                "the combination of the MapID and AreaInfo fields." +
                "\n" +
                "If the SupportedMaps attribute is empty, each entry in this list shall have a unique value for the " +
                "AreaInfo field and shall have the MapID field set to null." +
                "\n" +
                "An empty value indicates that the device is currently unable to provide the list of supported areas." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> due to the maximum size of this list and to the fact that the entries may include strings (see " +
                "  LocationName), care must be taken by implementers to avoid creating a data structure that is " +
                "  overly large, which can result in significant latency in accessing this attribute." +
                "\n" +
                "The value of this attribute may change at any time via an out-of-band interaction outside of the " +
                "server, such as interactions with a user interface, or due to internal device changes." +
                "\n" +
                "When removing entries in the SupportedAreas attribute list the server shall adjust the values of the " +
                "SelectedAreas, CurrentArea, and Progress attributes such that they only reference valid entries in " +
                "the updated SupportedAreas attribute list. These changes to the SelectedAreas, CurrentArea, and " +
                "Progress attributes may result in the server setting some or all of them to empty (for SelectedAreas " +
                "and Progress) or null (for CurrentArea), or updating them with data that matches the constraints " +
                "from the description of the respective attributes. These actions are required to ensure having a " +
                "consistent representation of the maps and locations available to the clients." +
                "\n" +
                "The SupportedAreas attribute list changes mentioned above SHOULD NOT be allowed while the device is " +
                "operating, to reduce the impact on the clients, and the potential confusion for the users." +
                "\n" +
                "A few examples are provided below. Valid list of areas:" +
                "\n" +
                "  • AreaID=0, LocationName=\"yellow bedroom\", MapID=null" +
                "\n" +
                "  • AreaID=1, LocationName=\"orange bedroom\", MapID=null Valid list of areas:" +
                "\n" +
                "  • AreaID=5, LocationName=\"hallway\", MapID=1" +
                "\n" +
                "  • AreaID=3, LocationName=\"hallway\", MapID=2"
        },

        {
            tag: "attribute", name: "SupportedMaps", xref: "cluster§1.17.6.2",

            details: "This attribute shall contain the list of supported maps." +
                "\n" +
                "A map is a full or a partial representation of a home, known to the device. For example:" +
                "\n" +
                "  • a single level home may be represented using a single map" +
                "\n" +
                "  • a two level home may be represented using two maps, one for each level" +
                "\n" +
                "  • a single level home may be represented using two maps, each including a different set of rooms, " +
                "    such as \"map of living room and kitchen\" and \"map of bedrooms and hallway\"" +
                "\n" +
                "  • a single level home may be represented using one map for the indoor areas (living room, bedrooms " +
                "    etc.) and one for the outdoor areas (garden, swimming pool etc.)" +
                "\n" +
                "Each map includes one or more areas - see the SupportedAreas attribute. In the context of this " +
                "cluster specification, a map is effectively a group label for a set of areas, rather than a " +
                "graphical representation that the clients can display to the users. The clients that present the " +
                "list of available areas for user selection (see the SelectAreas command) may choose to filter the " +
                "SupportedAreas list based on the associated map. For example, the clients may allow the user to " +
                "indicate that the device is to operate on the first floor, and allow the user to choose only from " +
                "the areas situated on that level." +
                "\n" +
                "If empty, that indicates that the device is currently unable to provide this information. Each entry " +
                "in this list shall have a unique value for the MapID field." +
                "\n" +
                "Each entry in this list shall have a unique value for the Name field." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> due to the maximum size of this list and to the fact that the entries may include strings (see the " +
                "  Name field of the MapStruct data type), care must be taken by implementers to avoid creating a " +
                "  data structure that is overly large, which can result in significant latency in accessing this " +
                "  attribute." +
                "\n" +
                "The value of this attribute may change at any time via an out-of-band interaction outside of the " +
                "server, such as interactions with a user interface." +
                "\n" +
                "When updating the SupportedMaps attribute list by deleting entries, or by setting the attribute to " +
                "an empty list, the SupportedAreas attribute shall be updated such that all entries in that list meet " +
                "the constraints indicated in the description of the SupportedAreas attribute. This may result in the " +
                "server removing entries from the SupportedAreas attribute list. See the SupportedAreas attribute " +
                "description for the implications of changing that attribute." +
                "\n" +
                "The SupportedMaps attribute list changes mentioned above SHOULD NOT be allowed while the device is " +
                "operating, to reduce the impact on the clients, and the potential confusion for the users."
        },

        {
            tag: "attribute", name: "SelectedAreas", xref: "cluster§1.17.6.3",

            details: "Indicates the set of areas where the device SHOULD attempt to operate." +
                "\n" +
                "The mobile devices may travel without operating across any areas while attempting to reach the areas " +
                "indicated by the SelectedAreas attribute. For example, a robotic vacuum cleaner may drive without " +
                "cleaning when traveling without operating." +
                "\n" +
                "If this attribute is empty, the device is not constrained to operate in any specific areas. If this " +
                "attribute is not empty:" +
                "\n" +
                "  • each item in this list shall match the AreaID field of an entry in the SupportedAreas " +
                "    attribute’s list" +
                "\n" +
                "  • each entry in this list shall have a unique value"
        },

        {
            tag: "attribute", name: "CurrentArea", xref: "cluster§1.17.6.4",

            details: "If the device is mobile, this attribute shall indicate the area where the device is currently " +
                "located, regardless of whether it is operating or not, such as while traveling between areas." +
                "\n" +
                "If the device is not mobile and can operate at multiple areas sequentially, this attribute shall " +
                "indicate the area which is currently being serviced, or the area which is currently traversed by the " +
                "device. For example, a camera device may use this attribute to indicate which area it currently " +
                "takes video of (serviced area) or which area it currently has in view but not taking video of (e.g. " +
                "an area which is traversed while panning)." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> A device may traverse an area regardless of the status of the area (pending, skipped, or " +
                "  completed)." +
                "\n" +
                "If a device can simultaneously operate at multiple areas, such as in the case of a sensor that can " +
                "monitor multiple areas at the same time, the CurrentArea attribute shall NOT be implemented, since " +
                "it doesn’t apply. Else this attribute shall be optionally implemented." +
                "\n" +
                "A null value indicates that the device is currently unable to provide this information. For example, " +
                "the device is traversing an unknown area, or the SupportedAreas attribute was updated and the area " +
                "where the device is located was removed from that list." +
                "\n" +
                "If not null, the value of this attribute shall match the AreaID field of an entry on the " +
                "SupportedAreas attribute’s list."
        },

        {
            tag: "attribute", name: "EstimatedEndTime", xref: "cluster§1.17.6.5",

            details: "Indicates the estimated Epoch time for completing operating at the area indicated by the CurrentArea " +
                "attribute, in seconds." +
                "\n" +
                "A value of 0 means that the operation has completed." +
                "\n" +
                "When this attribute is null, that represents that there is no time currently defined until operation " +
                "completion. This may happen, for example, because no operation is in progress or because the " +
                "completion time is unknown." +
                "\n" +
                "Null if the CurrentArea attribute is null." +
                "\n" +
                "If the Progress attribute is available, and it contains an entry matching CurrentArea, the server " +
                "may use the time estimate provided in the EstimatedTime field of that entry to compute the " +
                "EstimatedEndTime attribute." +
                "\n" +
                "The value of this attribute shall only be reported in the following cases:" +
                "\n" +
                "  • when it changes to or from 0" +
                "\n" +
                "  • when it decreases" +
                "\n" +
                "  • when it changes to or from null" +
                "\n" +
                "    > [!NOTE]" +
                "\n" +
                "    > If the device is capable of pausing its operation, this attribute may be set to null, to " +
                "      indicate that completion time is unknown, or increment the value while being in the paused " +
                "      state."
        },

        {
            tag: "attribute", name: "Progress", xref: "cluster§1.17.6.6",

            details: "Indicates the operating status at one or more areas. Each entry in this list shall have a unique " +
                "value for the AreaID field." +
                "\n" +
                "For each entry in this list, the AreaID field shall match an entry on the SupportedAreas attribute’s " +
                "list." +
                "\n" +
                "When this attribute is empty, that represents that no progress information is currently available." +
                "\n" +
                "If the SelectedAreas attribute is empty, indicating the device is not constrained to operate in any " +
                "specific areas, the Progress attribute list may change while the device operates, due to the device " +
                "adding new entries dynamically, when it determines which ones it can attempt to operate at." +
                "\n" +
                "If the SelectedAreas attribute is not empty, and the device starts operating:" +
                "\n" +
                "  • the Progress attribute list shall be updated so each entry of SelectedAreas has a matching " +
                "    Progress list entry, based on the AreaID field" +
                "\n" +
                "  • the length of the Progress and SelectedAreas list shall be the same" +
                "\n" +
                "  • the entries in the Progress list shall be initialized by the server, by having their status set " +
                "    to Pending or Operating, and the TotalOperationalTime field set to null" +
                "\n" +
                "When the device ends operation unexpectedly, such as due to an error, the server shall update all " +
                "Progress list entries with the Status field set to Operating or Pending to Skipped." +
                "\n" +
                "When the device finishes operating, successfully or not, it shall NOT change the Progress attribute, " +
                "except in the case of an unexpected end of operation as described above, or due to changes to the " +
                "SupportedMaps or SupportedAreas attributes, so the clients can retrieve the progress information at " +
                "that time." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> if the device implements the Operational Status cluster, or a derivation of it, in case the device " +
                "  fails to service any locations in the SelectedAreas list before ending the operation, it SHOULD " +
                "  use the Operational Status cluster to indicate that the device was unable to complete the " +
                "  operation (see the UnableToCompleteOperation error from that cluster specification). The clients " +
                "  SHOULD then read the Progress attribute, and indicate which areas have been successfully serviced " +
                "  (marked as completed)."
        },

        {
            tag: "command", name: "SelectAreas", xref: "cluster§1.17.7.1",
            details: "This command is used to select a set of device areas, where the device is to operate." +
                "\n" +
                "On receipt of this command the device shall respond with a SelectAreasResponse command.",

            children: [{
                tag: "field", name: "NewAreas", xref: "cluster§1.17.7.1.1",

                details: "This field indicates which areas the device is to operate at." +
                    "\n" +
                    "If this field is empty, that indicates that the device is to operate without being constrained to " +
                    "any specific areas, and the operation will not allow skipping using the SkipArea Command, otherwise " +
                    "the field shall be a list of unique values that match the AreaID field of entries on the " +
                    "SupportedAreas list."
            }]
        },

        {
            tag: "command", name: "SelectAreasResponse", xref: "cluster§1.17.7.2",
            details: "This command is sent by the device on receipt of the SelectAreas command.",

            children: [{
                tag: "field", name: "Status", xref: "cluster§1.17.7.2.1",

                details: "If the Status field is set to Success or UnsupportedArea, the server may use a non-empty string for " +
                    "the StatusText field to provide additional information. For example, if Status is set to Unsupport " +
                    "edArea, the server may use StatusText to indicate which areas are unsupported." +
                    "\n" +
                    "If the Status field is not set to Success, or UnsupportedArea, the StatusText field shall include a " +
                    "vendor-defined error description which can be used to explain the error to the user. For example, if " +
                    "the Status field is set to InvalidInMode, the StatusText field SHOULD indicate why the request is " +
                    "not allowed, given the current mode of the device, which may involve other clusters."
            }]
        },

        {
            tag: "command", name: "SkipArea", xref: "cluster§1.17.7.3",
            details: "This command is used to skip the given area, and to attempt operating at other areas on the " +
                "SupportedAreas attribute list." +
                "\n" +
                "On receipt of this command the device shall respond with a SkipAreaResponse command.",

            children: [{
                tag: "field", name: "SkippedArea", xref: "cluster§1.17.7.3.1",
                details: "The SkippedArea field indicates the area to be skipped." +
                    "\n" +
                    "The SkippedArea field shall match an entry in the SupportedAreas list."
            }]
        },

        {
            tag: "command", name: "SkipAreaResponse", xref: "cluster§1.17.7.4",
            details: "This command is sent by the device on receipt of the SkipArea command.",

            children: [{
                tag: "field", name: "Status", xref: "cluster§1.17.7.4.1",

                details: "If the Status field is set to Success or InvalidAreaList, the server may use a non-empty string for " +
                    "the StatusText field to provide additional information. For example, if Status is set to " +
                    "InvalidAreaList, the server may use StatusText to indicate why this list is invalid." +
                    "\n" +
                    "If the Status field is not set to Success or InvalidAreaList, the StatusText field shall include a " +
                    "vendor defined error description which can be used to explain the error to the user. For example, if " +
                    "the Status field is set to InvalidInMode, the StatusText field SHOULD indicate why the request is " +
                    "not allowed, given the current mode of the device, which may involve other clusters."
            }]
        },

        {
            tag: "datatype", name: "LandmarkInfoStruct", xref: "cluster§1.17.5.1",
            details: "The data from this structure indicates a landmark and position relative to the landmark.",

            children: [
                {
                    tag: "field", name: "LandmarkTag", xref: "cluster§1.17.5.1.1",
                    details: "This field shall indicate that the area is associated with a landmark." +
                        "\n" +
                        "This field shall be the ID of a landmark semantic tag, located within the Common Landmark Namespace. " +
                        "For example, this tag may indicate that the area refers to an area next to a table."
                },

                {
                    tag: "field", name: "RelativePositionTag", xref: "cluster§1.17.5.1.2",

                    details: "This field shall identify the position of the area relative to a landmark. This is a static " +
                        "description of a zone known to the server, and this field never reflects the device’s own proximity " +
                        "or position relative to the landmark, but that of the zone." +
                        "\n" +
                        "This field shall be the ID of a relative position semantic tag, located within the Common Relative " +
                        "Position Namespace." +
                        "\n" +
                        "If the RelativePositionTag field is null, this field indicates proximity to the landmark. Otherwise, " +
                        "the RelativePositionTag field indicates the position of the area relative to the landmark indicated " +
                        "by the LandmarkTag field. For example, this tag, in conjunction with the LandmarkTag field, may " +
                        "indicate that the area refers to a zone under a table."
                }
            ]
        },

        {
            tag: "datatype", name: "AreaInfoStruct", xref: "cluster§1.17.5.2",

            details: "The data from this structure indicates the name and/or semantic data describing an area, as detailed " +
                "below." +
                "\n" +
                "This data type includes the LocationInfo field, with the following fields: LocationName, " +
                "FloorNumber, AreaType. Additional semantic data may be available in the LandmarkInfo field." +
                "\n" +
                "For an area description to be meaningful, it shall have at least one of the following:" +
                "\n" +
                "  • a non-empty name (LocationInfo’s LocationName field) OR" +
                "\n" +
                "  • some semantic data (one or more of these: FloorNumber, AreaType or LandmarkTag) The normative " +
                "    text from the remainder of this section describes these constraints." +
                "\n" +
                "If the LocationInfo field is null, the LandmarkInfo field shall NOT be null. If the LandmarkInfo " +
                "field is null, the LocationInfo field shall NOT be null." +
                "\n" +
                "If LocationInfo is not null, and its LocationName field is an empty string, at least one of the " +
                "following shall NOT be null:" +
                "\n" +
                "  • LocationInfo’s FloorNumber field" +
                "\n" +
                "  • LocationInfo’s AreaType field" +
                "\n" +
                "  • LandmarkInfo field" +
                "\n" +
                "If all three of the following are null, LocationInfo’s LocationName field shall NOT be an empty " +
                "string:" +
                "\n" +
                "  • LocationInfo’s FloorNumber field" +
                "\n" +
                "  • LocationInfo’s AreaType field" +
                "\n" +
                "  • LandmarkInfo field",

            children: [
                {
                    tag: "field", name: "LocationInfo", xref: "cluster§1.17.5.2.1",

                    details: "This field shall indicate the name of the area, floor number and/or area type. A few examples are " +
                        "provided below." +
                        "\n" +
                        "  • An area can have LocationInfo’s LocationName field set to \"blue room\", and the AreaType field " +
                        "    set to the ID of a \"Living Room\" semantic tag. Clients wishing to direct the device to operate " +
                        "    in (or service) the living room can use this area." +
                        "\n" +
                        "  • An area can have LocationInfo set to null, the LandmarkInfo’s LandmarkTag field set to the ID of " +
                        "    the \"Table\" landmark semantic tag, and the RelativePositionTag field set to the ID of the " +
                        "    \"Under\" position semantic tag. With such an area indication, the client can request the device " +
                        "    to operate in (or service) the area located under the table."
                },

                {
                    tag: "field", name: "LandmarkInfo", xref: "cluster§1.17.5.2.2",

                    details: "This field shall indicate an association with a landmark. A value of null indicates that the " +
                        "information is not available or known. For example, this may indicate that the area refers to a zone " +
                        "next to a table." +
                        "\n" +
                        "If this field is not null, that indicates that the area is restricted to the zone where the landmark " +
                        "is located, as indicated by the LandmarkTag and, if not null, by the RelativePositionTag fields, " +
                        "rather than to the entire room or floor where the landmark is located, if those are indicated by the " +
                        "LocationInfo field."
                }
            ]
        },

        {
            tag: "datatype", name: "MapStruct", xref: "cluster§1.17.5.3",
            details: "This is a struct representing a map.",

            children: [
                {
                    tag: "field", name: "MapId", xref: "cluster§1.17.5.3.1",
                    details: "This field shall represent the map’s identifier."
                },
                {
                    tag: "field", name: "Name", xref: "cluster§1.17.5.3.2",
                    details: "This field shall represent a human understandable map description. For example: \"Main Floor\", or " +
                        "\"Second Level\"."
                }
            ]
        },

        {
            tag: "datatype", name: "AreaStruct", xref: "cluster§1.17.5.4",
            details: "This is a struct representing an area known to the server.",

            children: [
                {
                    tag: "field", name: "AreaId", xref: "cluster§1.17.5.4.1",
                    details: "This field shall represent the identifier of the area."
                },

                {
                    tag: "field", name: "MapId", xref: "cluster§1.17.5.4.2",

                    details: "This field shall indicate the map identifier which the area is associated with. A value of null " +
                        "indicates that the area is not associated with a map." +
                        "\n" +
                        "If the SupportedMaps attribute is not empty, this field shall match the MapID field of an entry from " +
                        "the SupportedMaps attribute’s list. If the SupportedMaps attribute is empty, this field shall be " +
                        "null."
                },

                {
                    tag: "field", name: "AreaInfo", xref: "cluster§1.17.5.4.3",

                    details: "This field shall contain data describing the area." +
                        "\n" +
                        "This SHOULD be used by clients to determine the name and/or the full, or the partial, semantics of a " +
                        "certain area." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> If any entries on the SupportedAreas attribute’s list have the AreaInfo field missing the semantic " +
                        "  data, the client may remind the user to assign the respective data."
                }
            ]
        },

        {
            tag: "datatype", name: "ProgressStruct", xref: "cluster§1.17.5.5",
            details: "This is a struct indicating the progress.",

            children: [
                {
                    tag: "field", name: "AreaId", xref: "cluster§1.17.5.5.1",
                    details: "This field shall indicate the identifier of the area, and the identifier shall be an entry in the " +
                        "SupportedAreas attribute’s list."
                },
                {
                    tag: "field", name: "Status", xref: "cluster§1.17.5.5.2",
                    details: "This field shall indicate the operational status of the device regarding the area indicated by the " +
                        "AreaID field."
                },

                {
                    tag: "field", name: "TotalOperationalTime", xref: "cluster§1.17.5.5.3",

                    details: "This field shall indicate the total operational time, in seconds, from when the device started to " +
                        "operate at the area indicated by the AreaID field, until the operation finished, due to completion " +
                        "or due to skipping, including any time spent while paused." +
                        "\n" +
                        "A value of null indicates that the total operational time is unknown." +
                        "\n" +
                        "There may be cases where the total operational time exceeds the maximum value that can be conveyed " +
                        "by this attribute, and in such instances this attribute shall be populated with null." +
                        "\n" +
                        "Null if the Status field is not set to Completed or Skipped."
                },

                {
                    tag: "field", name: "EstimatedTime", xref: "cluster§1.17.5.5.4",

                    details: "This field shall indicate the estimated time for the operation, in seconds, from when the device " +
                        "will start operating at the area indicated by the AreaID field, until the operation completes, " +
                        "excluding any time spent while not operating in the area." +
                        "\n" +
                        "A value of null indicates that the estimated time is unknown. If the estimated time is unknown, or " +
                        "if it exceeds the maximum value that can be conveyed by this attribute, this attribute shall be " +
                        "null." +
                        "\n" +
                        "After initializing the ProgressStruct instance, the server SHOULD NOT change the value of this " +
                        "field, except when repopulating the entire instance, to avoid excessive reporting of the Progress " +
                        "attribute changes."
                }
            ]
        },

        {
            tag: "datatype", name: "OperationalStatusEnum", xref: "cluster§1.17.5.6",
            details: "The following table defines the status values.",

            children: [
                {
                    tag: "field", name: "Pending",
                    description: "The device has not yet started operating at the given area, or has not finished operating at that area but it is not currently operating at the area"
                },
                { tag: "field", name: "Operating", description: "The device is currently operating at the given area" },
                {
                    tag: "field", name: "Skipped",
                    description: "The device has skipped the given area, before or during operating at it, due to a SkipArea command, due an out of band command (e.g. from the vendor’s application), due to a vendor specific reason, such as a time limit used by the device, or due the device ending operating unsuccessfully"
                },
                {
                    tag: "field", name: "Completed",
                    description: "The device has completed operating at the given area"
                }
            ]
        },

        {
            tag: "datatype", name: "SelectAreasStatus", xref: "cluster§1.17.5.6.1",

            children: [
                {
                    tag: "field", name: "Success",
                    description: "Attempting to operate in the areas identified by the entries of the NewAreas field is allowed and possible. The SelectedAreas attribute is set to the value of the NewAreas field."
                },
                {
                    tag: "field", name: "UnsupportedArea",
                    description: "The value of at least one of the entries of the NewAreas field doesn’t match any entries in the SupportedAreas attribute."
                },
                {
                    tag: "field", name: "InvalidInMode",
                    description: "The received request cannot be handled due to the current mode of the device."
                },
                {
                    tag: "field", name: "InvalidSet",
                    description: "The set of values is invalid. For example, areas on different floors, that a robot knows it can’t reach on its own."
                }
            ]
        },

        {
            tag: "datatype", name: "SkipAreaStatus", xref: "cluster§1.17.5.6.2",

            children: [
                {
                    tag: "field", name: "Success",
                    description: "Skipping the area is allowed and possible, or the device was operating at the last available area and has stopped."
                },
                { tag: "field", name: "InvalidAreaList", description: "The SelectedAreas attribute is empty." },
                {
                    tag: "field", name: "InvalidInMode",
                    description: "The received request cannot be handled due to the current mode of the device. For example, the CurrentArea attribute is null or the device is not operating."
                },
                {
                    tag: "field", name: "InvalidSkippedArea",
                    description: "The SkippedArea field doesn’t match an entry in the SupportedAreas list."
                }
            ]
        }
    ]
});

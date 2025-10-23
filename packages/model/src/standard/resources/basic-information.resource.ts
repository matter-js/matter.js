/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "BasicInformation", classification: "node", pics: "BINFO", xref: "core§11.1",
    details: "This cluster provides attributes and events for determining basic information about Nodes, which " +
        "supports both Commissioning and operational determination of Node characteristics, such as Vendor " +
        "ID, Product ID and serial number, which apply to the whole Node.",

    children: [
        {
            tag: "attribute", name: "DataModelRevision", xref: "core§11.1.5.1",
            details: "This attribute shall be set to the revision number of the Data Model against which the Node is " +
                "certified. The value of this attribute shall be one of the valid values listed in Section 7.1.1, " +
                "“Revision History”."
        },

        {
            tag: "attribute", name: "VendorName", xref: "core§11.1.5.2",
            details: "This attribute shall specify a human readable (displayable) name of the vendor for the Node."
        },
        {
            tag: "attribute", name: "VendorId", xref: "core§11.1.5.3",
            details: "This attribute shall specify the Vendor ID."
        },
        {
            tag: "attribute", name: "ProductName", xref: "core§11.1.5.4",
            details: "This attribute shall specify a human readable (displayable) name of the model for the Node such as " +
                "the model number (or other identifier) assigned by the vendor."
        },
        {
            tag: "attribute", name: "ProductId", xref: "core§11.1.5.5",
            details: "This attribute shall specify the Product ID assigned by the vendor that is unique to the specific " +
                "product of the Node."
        },
        {
            tag: "attribute", name: "NodeLabel", xref: "core§11.1.5.6",
            details: "Indicates a user defined name for the Node. This attribute SHOULD be set during initial " +
                "commissioning and may be updated by further reconfigurations."
        },

        {
            tag: "attribute", name: "Location", xref: "core§11.1.5.7",

            details: "This attribute shall be an ISO 3166-1 alpha-2 code to represent the country, dependent territory, or " +
                "special area of geographic interest in which the Node is located at the time of the attribute being " +
                "set. This attribute shall be set during initial commissioning (unless already set) and may be " +
                "updated by further reconfigurations. This attribute may affect some regulatory aspects of the Node’s " +
                "operation, such as radio transmission power levels in given spectrum allocation bands if " +
                "technologies where this is applicable are used. The Location’s region code shall be interpreted in a " +
                "case-insensitive manner. If the Node cannot understand the location code with which it was " +
                "configured, or the location code has not yet been configured, it shall configure itself in a " +
                "region-agnostic manner as determined by the vendor, avoiding region-specific assumptions as much as " +
                "is practical. The special value XX shall indicate that region-agnostic mode is used."
        },

        {
            tag: "attribute", name: "HardwareVersion", xref: "core§11.1.5.8",
            details: "This attribute shall specify the version number of the hardware of the Node. The meaning of its " +
                "value, and the versioning scheme, are vendor defined."
        },

        {
            tag: "attribute", name: "HardwareVersionString", xref: "core§11.1.5.9",
            details: "This attribute shall specify the version number of the hardware of the Node. The meaning of its " +
                "value, and the versioning scheme, are vendor defined. The HardwareVersionString attribute shall be " +
                "used to provide a more user-friendly value than that represented by the HardwareVersion attribute."
        },

        {
            tag: "attribute", name: "SoftwareVersion", xref: "core§11.1.5.10",
            details: "This attribute shall contain the current version number for the software running on this Node. A " +
                "larger value of SoftwareVersion is newer than a lower value, from the perspective of software " +
                "updates (see Section 11.20.3.3, “Availability of Software Images”). Nodes may query this field to " +
                "determine the currently running version of software on another given Node."
        },

        {
            tag: "attribute", name: "SoftwareVersionString", xref: "core§11.1.5.11",

            details: "This attribute shall contain a current human-readable representation for the software running on the " +
                "Node. This version information may be conveyed to users. The maximum length of the " +
                "SoftwareVersionString attribute is 64 bytes of UTF-8 characters. The contents SHOULD only use simple " +
                "7-bit ASCII alphanumeric and punctuation characters, so as to simplify the conveyance of the value " +
                "to a variety of cultures." +
                "\n" +
                "Examples of version strings include \"1.0\", \"1.2.3456\", \"1.2-2\", \"1.0b123\", \"1.2_3\"."
        },

        {
            tag: "attribute", name: "ManufacturingDate", xref: "core§11.1.5.12",
            details: "This attribute shall specify the date that the Node was manufactured. The first 8 characters shall " +
                "specify the date of manufacture of the Node in international date notation according to ISO 8601, " +
                "i.e., YYYYMMDD, e.g., 20060814. The final 8 characters may include country, factory, line, shift or " +
                "other related information at the option of the vendor. The format of this information is vendor " +
                "defined."
        },

        {
            tag: "attribute", name: "PartNumber", xref: "core§11.1.5.13",

            details: "This attribute shall specify a human-readable (displayable) vendor assigned part number for the Node " +
                "whose meaning and numbering scheme is vendor defined." +
                "\n" +
                "Multiple products (and hence PartNumbers) can share a ProductID. For instance, there may be " +
                "different packaging (with different PartNumbers) for different regions; also different colors of a " +
                "product might share the ProductID but may have a different PartNumber."
        },

        {
            tag: "attribute", name: "ProductUrl", xref: "core§11.1.5.14",
            details: "This attribute shall specify a link to a product specific web page. The specified URL SHOULD resolve " +
                "to a maintained web page available for the lifetime of the product. The syntax of this attribute " +
                "shall follow the syntax as specified in RFC 1738 and shall use the https scheme. The maximum length " +
                "of this attribute is 256 ASCII characters."
        },

        {
            tag: "attribute", name: "ProductLabel", xref: "core§11.1.5.15",
            details: "This attribute shall specify a vendor specific human readable (displayable) product label. The " +
                "ProductLabel attribute may be used to provide a more user-friendly value than that represented by " +
                "the ProductName attribute. The ProductLabel attribute SHOULD NOT include the name of the vendor as " +
                "defined within the VendorName attribute."
        },

        {
            tag: "attribute", name: "SerialNumber", xref: "core§11.1.5.16",
            details: "This attribute shall specify a human readable (displayable) serial number."
        },

        {
            tag: "attribute", name: "LocalConfigDisabled", xref: "core§11.1.5.17",
            details: "This attribute shall allow a local Node configuration to be disabled. When this attribute is set to " +
                "True the Node shall disable the ability to configure the Node through an on-Node user interface. The " +
                "value of the LocalConfigDisabled attribute shall NOT in any way modify, disable, or otherwise affect " +
                "the user’s ability to trigger a factory reset on the Node."
        },

        {
            tag: "attribute", name: "Reachable", xref: "core§11.1.5.18",
            details: "This attribute (when used) shall indicate whether the Node can be reached. For a native Node this is " +
                "implicitly True (and its use is optional)." +
                "\n" +
                "Its main use case is in the derived Bridged Device Basic Information cluster where it is used to " +
                "indicate whether the bridged device is reachable by the bridge over the non-native network."
        },

        {
            tag: "attribute", name: "UniqueId", xref: "core§11.1.5.19",

            details: "Indicates a unique identifier for the device, which is constructed in a manufacturer specific " +
                "manner." +
                "\n" +
                "It may be constructed using a permanent device identifier (such as device MAC address) as basis. In " +
                "order to prevent tracking," +
                "\n" +
                "  • it SHOULD NOT be identical to (or easily derived from) such permanent device identifier" +
                "\n" +
                "  • it shall be updated when the device is factory reset" +
                "\n" +
                "  • it shall NOT be identical to the SerialNumber attribute" +
                "\n" +
                "  • it shall NOT be printed on the product or delivered with the product" +
                "\n" +
                "The value does not need to be human readable, since it is intended for machine to machine (M2M) " +
                "communication." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> The conformance of the UniqueID attribute was optional in cluster revisions prior to revision 4." +
                "\n" +
                "This UniqueID attribute shall NOT be the same as the Persistent Unique ID which is used in the " +
                "Rotating Device Identifier mechanism."
        },

        {
            tag: "attribute", name: "CapabilityMinima", xref: "core§11.1.5.20",

            details: "This attribute shall provide the minimum guaranteed value for some system-wide resource capabilities " +
                "that are not otherwise cluster-specific and do not appear elsewhere. This attribute may be used by " +
                "clients to optimize communication with Nodes by allowing them to use more than the strict minimum " +
                "values required by this specification, wherever available." +
                "\n" +
                "The values supported by the server in reality may be larger than the values provided in this " +
                "attribute, such as if a server is not resource-constrained at all. However, clients SHOULD only rely " +
                "on the amounts provided in this attribute." +
                "\n" +
                "Note that since the fixed values within this attribute may change over time, both increasing and " +
                "decreasing, as software versions change for a given Node, clients SHOULD take care not to assume " +
                "forever unchanging values and SHOULD NOT cache this value permanently at Commissioning time."
        },

        {
            tag: "attribute", name: "ProductAppearance", xref: "core§11.1.5.21",
            details: "This attribute shall provide information about the appearance of the product, which could be useful " +
                "to a user trying to locate or identify the node."
        },

        {
            tag: "attribute", name: "SpecificationVersion", xref: "core§11.1.5.22",

            details: "This attribute shall contain the current version number for the specification version this Node was " +
                "certified against. A larger value of SpecificationVersion is newer than a lower value." +
                "\n" +
                "Nodes may query this field to determine the currently supported version of the specification on " +
                "another given Node." +
                "\n" +
                "The format of this number is segmented as its four component bytes. Bit positions for the fields are " +
                "as follows:" +
                "\n" +
                "For example, a SpecificationVersion value of 0x01040200 is composed of 4 version components, " +
                "representing a version 1.4.2.0." +
                "\n" +
                "In the example above:" +
                "\n" +
                "  • Major version is the most significant byte (0x01)." +
                "\n" +
                "  • Minor version is the second most significant byte (0x04)." +
                "\n" +
                "  • Dot version is the third most significant byte (0x02)." +
                "\n" +
                "  • Reserved1 value is the least significant byte (0x00)." +
                "\n" +
                "The initial revision (1.0) of this specification (1.0) was 0x01000000. Matter Spring 2024 release " +
                "(1.3) was 0x01030000." +
                "\n" +
                "If the SpecificationVersion is absent or zero, such as in Basic Information cluster revisions prior " +
                "to Revision 3, the specification version cannot be properly inferred unless other heuristics are " +
                "employed." +
                "\n" +
                "Comparison of SpecificationVersion shall always include the total value over 32 bits, without " +
                "masking reserved parts."
        },

        {
            tag: "attribute", name: "MaxPathsPerInvoke", xref: "core§11.1.5.23",

            details: "Indicates the maximum number of elements in a single InvokeRequests list (see Section 8.8.2, “Invoke " +
                "Request Action”) that the Node is able to process. Note that since this attribute may change over " +
                "time, both increasing and decreasing, as software versions change for a given Node, clients SHOULD " +
                "take care not to assume forever unchanging values and SHOULD NOT cache this value permanently at " +
                "Commissioning time." +
                "\n" +
                "If the MaxPathsPerInvoke attribute is absent or zero, such as in Basic Information cluster revisions " +
                "prior to Revision 3, clients shall assume a value of 1."
        },

        {
            tag: "attribute", name: "ConfigurationVersion", xref: "core§11.1.5.24",
            details: "This attribute shall contain the current version number for the configuration of the Node. A larger " +
                "value of ConfigurationVersion shall indicate a newer configuration than a lower value."
        },

        {
            tag: "event", name: "StartUp", xref: "core§11.1.6.1",
            details: "The StartUp event shall be generated by a Node as soon as reasonable after completing a boot or " +
                "reboot process. The StartUp event SHOULD be the first Data Model event recorded by the Node after it " +
                "completes a boot or reboot process.",
            children: [{
                tag: "field", name: "SoftwareVersion", xref: "core§11.1.6.1.1",
                details: "This field shall be set to the same value as the one available in the SoftwareVersion attribute."
            }]
        },

        {
            tag: "event", name: "ShutDown", xref: "core§11.1.6.2",
            details: "The ShutDown event SHOULD be generated by a Node prior to any orderly shutdown sequence on a " +
                "best-effort basis. When a ShutDown event is generated, it SHOULD be the last Data Model event " +
                "recorded by the Node. This event SHOULD be delivered urgently to current subscribers on a " +
                "best-effort basis. Any subsequent incoming interactions to the Node may be dropped until the " +
                "completion of a future boot or reboot process."
        },

        {
            tag: "event", name: "Leave", xref: "core§11.1.6.3",

            details: "The Leave event SHOULD be generated by a Node prior to permanently leaving a given Fabric, such as " +
                "when the RemoveFabric command is invoked for a given fabric, or triggered by factory reset or some " +
                "other manufacturer specific action to disable or reset the operational data in the Node. When a " +
                "Leave event is generated, it SHOULD be assumed that the fabric recorded in the event is no longer " +
                "usable, and subsequent interactions targeting that fabric will most likely fail." +
                "\n" +
                "Upon receipt of Leave Event on a subscription, the receiving Node may update other nodes in the " +
                "fabric by removing related bindings, access control list entries and other data referencing the " +
                "leaving Node.",

            children: [{
                tag: "field", name: "FabricIndex", xref: "core§11.1.6.3.1",
                details: "This field shall contain the local fabric-index of the fabric which the node is about to leave."
            }]
        },

        {
            tag: "event", name: "ReachableChanged", xref: "core§11.1.6.4",
            details: "This event (when supported) shall be generated when there is a change in the Reachable attribute." +
                "\n" +
                "Its main use case is in the derived Bridged Device Basic Information cluster.",
            children: [{
                tag: "field", name: "ReachableNewValue", xref: "core§11.1.6.4.1",
                details: "This field shall indicate the value of the Reachable attribute after it was changed."
            }]
        },

        {
            tag: "datatype", name: "ProductFinishEnum", xref: "core§11.1.4.1",
            details: "The data type of ProductFinishEnum is derived from enum8.",

            children: [
                { tag: "field", name: "Other", description: "Product has some other finish not listed below." },
                { tag: "field", name: "Matte", description: "Product has a matte finish." },
                { tag: "field", name: "Satin", description: "Product has a satin finish." },
                { tag: "field", name: "Polished", description: "Product has a polished or shiny finish." },
                { tag: "field", name: "Rugged", description: "Product has a rugged finish." },
                { tag: "field", name: "Fabric", description: "Product has a fabric finish." }
            ]
        },

        {
            tag: "datatype", name: "ColorEnum", xref: "core§11.1.4.2",
            details: "The data type of ColorEnum is derived from enum8.",

            children: [
                { tag: "field", name: "Black", description: "Approximately RGB #000000." },
                { tag: "field", name: "Navy", description: "Approximately RGB #000080." },
                { tag: "field", name: "Green", description: "Approximately RGB #008000." },
                { tag: "field", name: "Teal", description: "Approximately RGB #008080." },
                { tag: "field", name: "Maroon", description: "Approximately RGB #800080." },
                { tag: "field", name: "Purple", description: "Approximately RGB #800080." },
                { tag: "field", name: "Olive", description: "Approximately RGB #808000." },
                { tag: "field", name: "Gray", description: "Approximately RGB #808080." },
                { tag: "field", name: "Blue", description: "Approximately RGB #0000FF." },
                { tag: "field", name: "Lime", description: "Approximately RGB #00FF00." },
                { tag: "field", name: "Aqua", description: "Approximately RGB #00FFFF." },
                { tag: "field", name: "Red", description: "Approximately RGB #FF0000." },
                { tag: "field", name: "Fuchsia", description: "Approximately RGB #FF00FF." },
                { tag: "field", name: "Yellow", description: "Approximately RGB #FFFF00." },
                { tag: "field", name: "White", description: "Approximately RGB #FFFFFF." },
                { tag: "field", name: "Nickel", description: "Typical hardware \"Nickel\" color." },
                { tag: "field", name: "Chrome", description: "Typical hardware \"Chrome\" color." },
                { tag: "field", name: "Brass", description: "Typical hardware \"Brass\" color." },
                { tag: "field", name: "Copper", description: "Typical hardware \"Copper\" color." },
                { tag: "field", name: "Silver", description: "Typical hardware \"Silver\" color." },
                { tag: "field", name: "Gold", description: "Typical hardware \"Gold\" color." }
            ]
        },

        {
            tag: "datatype", name: "ProductAppearanceStruct", xref: "core§11.1.4.3",
            details: "This structure provides a description of the product’s appearance.",

            children: [
                {
                    tag: "field", name: "Finish", xref: "core§11.1.4.3.1",
                    details: "This field shall indicate the visible finish of the product."
                },
                {
                    tag: "field", name: "PrimaryColor", xref: "core§11.1.4.3.2",
                    details: "This field indicates the representative color of the visible parts of the product. If the product " +
                        "has no representative color, the field shall be null."
                }
            ]
        },

        {
            tag: "datatype", name: "CapabilityMinimaStruct", xref: "core§11.1.4.4",
            details: "This structure provides constant values related to overall global capabilities of this Node, that " +
                "are not cluster-specific.",

            children: [
                {
                    tag: "field", name: "CaseSessionsPerFabric", xref: "core§11.1.4.4.1",
                    details: "This field shall indicate the actual minimum number of concurrent CASE sessions that are supported " +
                        "per fabric." +
                        "\n" +
                        "This value shall NOT be smaller than the required minimum indicated in Section 4.14.2.8, “Minimal " +
                        "Number of CASE Sessions”."
                },

                {
                    tag: "field", name: "SubscriptionsPerFabric", xref: "core§11.1.4.4.2",
                    details: "This field shall indicate the actual minimum number of concurrent subscriptions supported per " +
                        "fabric." +
                        "\n" +
                        "This value shall NOT be smaller than the required minimum indicated in Section 8.5.1, “Subscribe " +
                        "Transaction”."
                }
            ]
        }
    ]
});

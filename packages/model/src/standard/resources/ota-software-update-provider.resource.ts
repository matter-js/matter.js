/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "OtaSoftwareUpdateProvider", pics: "OTAP", xref: "core§11.20.6",

        children: [
            {
                tag: "command", name: "QueryImage", xref: "core§11.20.6.5.1",
                details: "Upon receipt, this command shall trigger an attempt to find an updated Software Image by the OTA " +
                    "Provider to match the OTA Requestor’s constraints provided in the payload fields.",

                children: [
                    {
                        tag: "field", name: "VendorId", xref: "core§11.20.6.5.1.1",
                        details: "The value shall be the Vendor ID applying to the OTA Requestor’s Node and shall match the value " +
                            "reported by the Basic Information Cluster VendorID attribute."
                    },
                    {
                        tag: "field", name: "ProductId", xref: "core§11.20.6.5.1.2",
                        details: "The value shall be the Product ID applying to the OTA Requestor’s Node and shall match the value " +
                            "reported by the Basic Information Cluster ProductID attribute."
                    },

                    {
                        tag: "field", name: "SoftwareVersion", xref: "core§11.20.6.5.1.3",
                        details: "The SoftwareVersion included in the request payload shall provide the value representing the current " +
                            "version running on the OTA Requestor invoking the command. This version shall be equal to the " +
                            "Software Version attribute of the Basic Information Cluster."
                    },

                    {
                        tag: "field", name: "ProtocolsSupported", xref: "core§11.20.6.5.1.4",

                        details: "This field shall contain a list of all download protocols supported by the OTA Requestor." +
                            "\n" +
                            "This field shall be used by the OTA Provider to generate the correct URI for the location of the " +
                            "Software Image when one is found to be available. The values of BDX Synchronous and BDX Asynchronous " +
                            "shall always be supported by an OTA Provider. Furthermore, OTA Providers with access to external " +
                            "networking SHOULD support the HTTPS protocol. OTA Providers may support other protocols." +
                            "\n" +
                            "The algorithm to select the specific protocol to use in a given Software Image URI is " +
                            "implementation-dependent, provided that the rules in Section 11.20.3.3.1, “Download Protocol " +
                            "selection” are followed." +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” and Section 11.20.3.5, “Transfer of OTA Software " +
                            "Update images” for more details about usage of this field."
                    },

                    {
                        tag: "field", name: "HardwareVersion", xref: "core§11.20.6.5.1.5",
                        details: "The value of this field, if present, shall contain the OTA Requestor’s hardware version, and shall " +
                            "be equal to the HardwareVersion attribute of the Basic Information Cluster."
                    },

                    {
                        tag: "field", name: "Location", xref: "core§11.20.6.5.1.6",
                        details: "The location, if present, shall provide the same value as the Basic Information Cluster Location " +
                            "attribute for the OTA Requestor as configured. This may be used by the OTA Provider logic to allow " +
                            "per-region selection of the Software Image."
                    },

                    {
                        tag: "field", name: "RequestorCanConsent", xref: "core§11.20.6.5.1.7",
                        details: "This field shall be set to true by an OTA Requestor that is capable of obtaining user consent for " +
                            "OTA application by virtue of built-in user interface capabilities. Otherwise, it shall be false." +
                            "\n" +
                            "See Section 11.20.3.4, “Obtaining user consent for updating software” for application details about " +
                            "usage."
                    },

                    {
                        tag: "field", name: "MetadataForProvider", xref: "core§11.20.6.5.1.8",

                        details: "This optional field, if present, shall consist of a top-level anonymous list; each list element " +
                            "shall have a profile-specific tag encoded in fully-qualified form. Each list element shall contain a " +
                            "manufacturer-specific payload, which the OTA Requestor invoking this command wants to expose to the " +
                            "receiving OTA Provider. This payload may be used for any purpose and SHOULD be as small as " +
                            "practical." +
                            "\n" +
                            "The use of this field SHOULD be restricted to Vendor-specific usage and shall NOT be used as a " +
                            "selector required to match for the selection of a Software Image in production environments, unless " +
                            "absolutely necessary, as the interpretation of this field may be ambiguous to OTA Providers " +
                            "implementing the Cluster in a compliant but divergent way from the sender." +
                            "\n" +
                            "An example of usage for this field is for an OTA Requestor to provide specific data about grouping " +
                            "or authentication in field trial environments, where the OTA Provider is likely to understand it and " +
                            "be able to act upon it, either for special selection of image, or recording of activity." +
                            "\n" +
                            "An OTA Provider shall report the availability of Software Images, if one is found to be applicable " +
                            "using the other provided fields, even if the MetadataForProvider field is deemed to contain invalid " +
                            "or unknown information. That is, the contents of the MetadataForProvider field shall NOT be used to " +
                            "deny a software update to an OTA Requestor, unless both OTA Requestor and OTA Provider have an " +
                            "externally agreed-upon policy whereby strictly correct additional MetadataForProvider is expected to " +
                            "fulfill the OTA Software Update process." +
                            "\n" +
                            "### Usage of the QueryImage Command" +
                            "\n" +
                            "OTA Requestors shall send a QueryImage command to the OTA Provider to determine the availability of " +
                            "a new Software Image." +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” for full details about the OTA Software Update " +
                            "Query flow which makes use of this command."
                    }
                ]
            },

            {
                tag: "command", name: "QueryImageResponse", xref: "core§11.20.6.5.2",

                children: [
                    {
                        tag: "field", name: "Status", xref: "core§11.20.6.5.2.1",
                        details: "This field shall contain the primary response regarding the availability of a Software Image." +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” for details about the possible values for this " +
                            "field and their meaning."
                    },

                    {
                        tag: "field", name: "DelayedActionTime", xref: "core§11.20.6.5.2.2",

                        details: "This field shall convey the minimum time to wait, in seconds from the time of this response, before " +
                            "sending another QueryImage command or beginning a download from the OTA Provider. OTA Requestors " +
                            "shall respect this minimum delay, unless they had previously restarted and lost track of it. OTA " +
                            "Providers SHOULD expect OTA Requestors to follow this value to their best capability, however, a " +
                            "restarting Node may come back sooner, due to having lost track of this state response." +
                            "\n" +
                            "Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2, " +
                            "“QueryImageResponse Command”." +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” for details about the rules regarding this field."
                    },

                    {
                        tag: "field", name: "ImageUri", xref: "core§11.20.6.5.2.3",

                        details: "This field, when present, shall contain a URI where the OTA Requestor SHOULD download a Soft ware " +
                            "Image. The syntax of the ImageURI field shall follow the URI syntax as specified in RFC 3986." +
                            "\n" +
                            "Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2, " +
                            "“QueryImageResponse Command”." +
                            "\n" +
                            "If the ImageURI specifies a BDX Protocol bdx: scheme, then the following rules describe the location " +
                            "to be used for download:" +
                            "\n" +
                            "  1. The URI’s scheme field shall be exactly bdx in lowercase characters." +
                            "\n" +
                            "  2. The URI’s authority field shall contain only the host portion and shall use string " +
                            "     representation of the Operational Node ID of the Node where to proceed with the download, on " +
                            "     the same Fabric on which the OTA Requestor received the QueryImageResponse." +
                            "\n" +
                            "  3. The encoding of the Node ID in the host field shall use an uppercase hexadecimal format, using " +
                            "     exactly 16 characters to encode the network byte order value of the NodeID, in a similar " +
                            "     fashion as the Node Identifier portion of the Operational Instance Name." +
                            "\n" +
                            "    a. The Operational Node ID in the host field shall match the NodeID of the OTA Provider " +
                            "       responding with the QueryImageResponse. The usage of a different Node ID than that of the " +
                            "       provider is reserved for future use. This constraint reduces the number of independent CASE " +
                            "       secure channel sessions that have to be maintained to proceed with OTA software updates, thus " +
                            "       reducing energy and resource utilization for the software update process." +
                            "\n" +
                            "  4. The user section of the authority field shall be absent, as there are no \"users\" to be " +
                            "     considered." +
                            "\n" +
                            "  5. The port section of the authority field shall be absent, as the port for transport shall be " +
                            "     determined through Operational Discovery of the target Node." +
                            "\n" +
                            "  6. The URI shall NOT contain a query field." +
                            "\n" +
                            "  7. The URI shall NOT contain a fragment field." +
                            "\n" +
                            "  8. The path field shall employ absolute path representation and shall contain the file designator " +
                            "     of the software image to download at the BDX server. When used with the BDX server, the leading " +
                            "     / separating the URI authority from the path shall be omitted. When contacting the BDX server, " +
                            "     further processing of the file designator shall NOT be done, including handling of URL-encoded " +
                            "     escape sequences. Rather, the exact octets of the path, as received shall be the values used by " +
                            "     both client and server in handling the file designator." +
                            "\n" +
                            "    a. The path shall only contain valid URI characters." +
                            "\n" +
                            "These rules above for BDX URIs simplify parsing for OTA Requestors receiving Image URIs. The " +
                            "following example procedure shows how the format constraints simplify the extraction of the " +
                            "necessary data to reach the BDX server for download." +
                            "\n" +
                            "  1. Verify that the URI is 24 characters or longer, which is the minimum length of a valid BDX URI " +
                            "     with all elements present, for example bdx://00112233AABBCCDD/0." +
                            "\n" +
                            "  2. Verify the presence of prefix bdx:// indicating a BDX URI." +
                            "\n" +
                            "  3. Extract the next 16 characters and convert from uppercase hexadecimal to a 64-bit scalar value, " +
                            "     considering network byte order. This is the destination Node ID." +
                            "\n" +
                            "  4. Verify the presence of a path separator / and skip it." +
                            "\n" +
                            "  5. Extract the remaining characters of the string as the file designator to employ when initiating " +
                            "     the BDX transfer." +
                            "\n" +
                            "Example ImageURI values are below, and illustrate some but not all of valid and invalid cases:" +
                            "\n" +
                            "  • Synchronous or Asynchronous BDX Protocol:" +
                            "\n" +
                            "    ◦ Valid: bdx://8899AABBCCDDEEFF/the_file_designator123" +
                            "\n" +
                            "      ▪ Node ID: 0x8899AABBCCDDEEFF" +
                            "\n" +
                            "      ▪ File designator: the_file_designator123" +
                            "\n" +
                            "    ◦ Valid: bdx://0099AABBCCDDEE77/the%20file%20designator/some_more" +
                            "\n" +
                            "      ▪ Node ID: 0x0099AABBCCDDEE77" +
                            "\n" +
                            "      ▪ File designator: the%20file%20designator/some_more. Note that the %20 are retained and not " +
                            "        converted to ASCII 0x20 (space). The file designator is the path as received verbatim, after " +
                            "        the first '/' (U+002F / SOLIDUS) following the host." +
                            "\n" +
                            "    ◦ Invalid: bdx://99AABBCCDDEE77/the_file_designator123" +
                            "\n" +
                            "      ▪ Node ID: Invalid since it is not exactly 16 characters long, due to having omitted leading " +
                            "        zeros." +
                            "\n" +
                            "    ◦ Invalid: bdx://0099aabbccddee77/the_file_designator123" +
                            "\n" +
                            "      ▪ Node ID: Invalid since lowercase hexadecimal was used." +
                            "\n" +
                            "    ◦ Invalid: bdx:8899AABBCCDDEEFF/the_file_designator123" +
                            "\n" +
                            "      ▪ Invalid since bdx scheme does not contain an authority, that is, it does not have // after " +
                            "        the first :." +
                            "\n" +
                            "  • HTTP over TLS:" +
                            "\n" +
                            "    ◦ Valid: https://example.domain:8466/software/image.bin" +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” for additional details about the flow."
                    },

                    {
                        tag: "field", name: "SoftwareVersion", xref: "core§11.20.6.5.2.4",

                        details: "This field indicates the version of the image being provided to the OTA Requestor by the OTA " +
                            "Provider." +
                            "\n" +
                            "Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2, " +
                            "“QueryImageResponse Command”." +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” for additional details about the flow and " +
                            "acceptable values."
                    },

                    {
                        tag: "field", name: "SoftwareVersionString", xref: "core§11.20.6.5.2.5",

                        details: "This field provides a string version of the image being provided to the OTA Requestor by the OTA " +
                            "Provider." +
                            "\n" +
                            "Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2," +
                            "\n" +
                            "“QueryImageResponse Command”." +
                            "\n" +
                            "See Section 11.20.3.2, “Querying the OTA Provider” for additional details about the flow and " +
                            "acceptable values."
                    },

                    {
                        tag: "field", name: "UpdateToken", xref: "core§11.20.6.5.2.6",
                        details: "Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2, " +
                            "“QueryImageResponse Command”." +
                            "\n" +
                            "See Section 11.20.3.6.1, “UpdateToken usage” for additional details about the generation and usage " +
                            "of UpdateToken."
                    },

                    {
                        tag: "field", name: "UserConsentNeeded", xref: "core§11.20.6.5.2.7",

                        details: "This field, if present, shall only be interpreted if the OTA Requestor had previously indicated a " +
                            "value of True in the RequestorCanConsent field of the QueryImageRequest. This field, when present " +
                            "and set to True, shall indicate that a capable OTA Requestor must obtain user-visible consent prior " +
                            "to downloading the OTA Software Image." +
                            "\n" +
                            "See Section 11.20.3.4, “Obtaining user consent for updating software” for application details about " +
                            "usage."
                    },

                    {
                        tag: "field", name: "MetadataForRequestor", xref: "core§11.20.6.5.2.8",

                        details: "This optional field, if present, shall consist of a top-level anonymous list; each list element " +
                            "shall have a profile-specific tag encoded in fully-qualified form. Each list element shall contain a " +
                            "manufacturer-specific payload, which the OTA Provider wants to expose to the receiving OTA " +
                            "Requestor. This payload may be used for any purpose and SHOULD be as small as practical." +
                            "\n" +
                            "The presence of this field shall NOT be required for correct operation of any OTA Provider compliant " +
                            "with this Cluster specification." +
                            "\n" +
                            "The data for this field does not exist in any Distributed Compliance Ledger record and SHOULD only " +
                            "be emitted by an OTA Provider with this additional knowledge if it has knowledge that the receiving " +
                            "OTA Requestor may be able to use it."
                    }
                ]
            },

            {
                tag: "command", name: "ApplyUpdateRequest", xref: "core§11.20.6.5.3",

                children: [
                    {
                        tag: "field", name: "UpdateToken", xref: "core§11.20.6.5.3.1",
                        details: "This field shall contain the UpdateToken as specified in Section 11.20.3.6.1, “UpdateToken usage”. " +
                            "This field may be used by the OTA Provider to track minimal lifecycle state to allow finer-grained " +
                            "scheduling of the application of Software Images by OTA Requestors."
                    },

                    {
                        tag: "field", name: "NewVersion", xref: "core§11.20.6.5.3.2",

                        details: "The NewVersion field included in the request payload shall provide the SoftwareVersion value of the " +
                            "new Software Image which the OTA Requestor is ready to start applying. The OTA Provider may use this " +
                            "new version to track or record Software Image application by OTA Requestors." +
                            "\n" +
                            "### When Generated" +
                            "\n" +
                            "The ApplyUpdateRequest Command shall be invoked by an OTA Requestor once it is ready to apply a " +
                            "previously downloaded Software Image." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "Upon receipt of this command the OTA Provider shall respond with an Action field consistent with the " +
                            "next action the OTA Requestor should take, including any possible time delay." +
                            "\n" +
                            "The OTA Provider shall NOT refer to previously stored state about any download progress to reply. If " +
                            "any state keeping is done by the OTA Provider, it shall only relate to the UpdateToken and the " +
                            "history of prior ApplyUpdateRequest commands." +
                            "\n" +
                            "See Section 11.20.3.6, “Applying a software update” for a description of the flow in response to an " +
                            "OTA Provider receiving an invocation of this command." +
                            "\n" +
                            "### Handling Error Cases" +
                            "\n" +
                            "See Section 11.20.3.6, “Applying a software update” for all error-handling information."
                    }
                ]
            },

            {
                tag: "command", name: "ApplyUpdateResponse", xref: "core§11.20.6.5.4",

                children: [
                    {
                        tag: "field", name: "Action", xref: "core§11.20.6.5.4.1",
                        details: "The Action field shall express the action that the OTA Provider requests from the OTA Requestor. See " +
                            "Section 11.20.3.6, “Applying a software update” for a description of the Action values provided in " +
                            "response to an OTA Provider receiving an invocation of this command."
                    },

                    {
                        tag: "field", name: "DelayedActionTime", xref: "core§11.20.6.5.4.2",
                        details: "The minimum time period the OTA Requestor shall wait before executing the Action, in seconds from " +
                            "receipt." +
                            "\n" +
                            "If this field has a value higher than 86400 seconds (24 hours), then the OTA Requestor may assume a " +
                            "value of 86400, in order to reduce undue Software Image application delays."
                    }
                ]
            },

            {
                tag: "command", name: "NotifyUpdateApplied", xref: "core§11.20.6.5.5",

                children: [
                    {
                        tag: "field", name: "UpdateToken", xref: "core§11.20.6.5.5.1",
                        details: "This field shall contain the UpdateToken as specified in Section 11.20.3.6.1, “UpdateToken usage”."
                    },

                    {
                        tag: "field", name: "SoftwareVersion", xref: "core§11.20.6.5.5.2",

                        details: "The SoftwareVersion included in the request payload shall provide the same value as the " +
                            "SoftwareVersion attribute in the invoking OTA Requestor’s Basic Information Cluster, and SHOULD be " +
                            "consistent with the value representing a new version running on the Node invoking the command." +
                            "\n" +
                            "### When Generated" +
                            "\n" +
                            "The NotifyUpdateApplied command SHOULD be invoked in the following two circumstances:" +
                            "\n" +
                            "  1. An OTA Requestor has just successfully applied a Software Image it had obtained from a previous " +
                            "     QueryImageResponse." +
                            "\n" +
                            "  2. An OTA Requestor has just successfully applied a Software Image it had obtained through means " +
                            "     different than those of this Cluster." +
                            "\n" +
                            "An OTA Provider may use the state of invocation of this command to help track the progress of update " +
                            "for OTA Requestors it knows require a new OTA Software Image. However, due to the possibility that " +
                            "an OTA Requestor may never come back (e.g. device removed from Fabric altogether, or a critical " +
                            "malfunction), an OTA Provider shall NOT expect every OTA Requestor to invoke this command for " +
                            "correct operation of the OTA Provider." +
                            "\n" +
                            "This command shall be considered optional and shall NOT result in reduced availability of the OTA " +
                            "Provider functionality if OTA Requestors never invoke this command." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "An OTA Provider receiving an invocation of this command may log it internally." +
                            "\n" +
                            "On receiving this command, an OTA Provider may use the information to update its bookkeeping of " +
                            "cached Software Images, or use it for other similar administrative purposes."
                    }
                ]
            },

            {
                tag: "datatype", name: "StatusEnum", xref: "core§11.20.6.4.1",
                details: "See Section 11.20.3.2, “Querying the OTA Provider” for the semantics of these values.",

                children: [
                    {
                        tag: "field", name: "UpdateAvailable",
                        description: "Indicates that the OTA Provider has an update available."
                    },
                    {
                        tag: "field", name: "Busy",
                        description: "Indicates OTA Provider may have an update, but it is not ready yet."
                    },
                    {
                        tag: "field", name: "NotAvailable",
                        description: "Indicates that there is definitely no update currently available from the OTA Provider."
                    },
                    {
                        tag: "field", name: "DownloadProtocolNotSupported",
                        description: "Indicates that the requested download protocol is not supported by the OTA Provider."
                    }
                ]
            },

            {
                tag: "datatype", name: "ApplyUpdateActionEnum", xref: "core§11.20.6.4.2",
                details: "See Section 11.20.3.6, “Applying a software update” for the semantics of the values. This " +
                    "enumeration is used in the Action field of the ApplyUpdateResponse command. See (Action).",

                children: [
                    { tag: "field", name: "Proceed", description: "Apply the update." },
                    { tag: "field", name: "AwaitNextAction", description: "Wait at least the given delay time." },
                    {
                        tag: "field", name: "Discontinue",
                        description: "The OTA Provider is conveying a desire to rescind a previously provided Software Image."
                    }
                ]
            },

            {
                tag: "datatype", name: "DownloadProtocolEnum", xref: "core§11.20.6.4.3",
                details: "Note that only HTTP over TLS (HTTPS) is supported (see RFC 7230). Using HTTP without TLS shall NOT " +
                    "be supported, as there is no way to authenticate the involved participants.",

                children: [
                    { tag: "field", name: "BdxSynchronous", description: "Indicates support for synchronous BDX." },
                    { tag: "field", name: "BdxAsynchronous", description: "Indicates support for asynchronous BDX." },
                    { tag: "field", name: "Https", description: "Indicates support for HTTPS." },
                    {
                        tag: "field", name: "VendorSpecific",
                        description: "Indicates support for vendor specific protocol."
                    }
                ]
            }
        ]
    }
);

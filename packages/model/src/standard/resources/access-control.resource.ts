/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "AccessControl", classification: "node", pics: "ACL", xref: "core§9.10",

        details: "The Access Control Cluster exposes a data model view of a Node’s Access Control List (ACL), which " +
            "codifies the rules used to manage and enforce Access Control for the Node’s endpoints and their " +
            "associated cluster instances. Access to this Access Control Cluster itself requires a special " +
            "Administer privilege level, such that only Nodes granted such privilege (hereafter termed " +
            "\"Administrators\") can manage the Access Control Cluster." +
            "\n" +
            "The Access Control Cluster shall be present on the root node endpoint of each Node, and shall NOT be " +
            "present on any other Endpoint of any Node.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "core§9.10.4",

                children: [
                    {
                        tag: "field", name: "EXTS", xref: "core§9.10.4.1",
                        details: "This feature indicates the device supports ACL Extension attribute."
                    },

                    {
                        tag: "field", name: "MNGD", xref: "core§9.10.4.2",

                        details: "This feature is for a device that is managed by a service associated with the device vendor and " +
                            "which imposes default access restrictions upon each new fabric added to it. This could arise, for " +
                            "example, if the device is managed by a service provider under contract to an end-user, in such away " +
                            "that the manager of the device does not unconditionally grant universal access to all of a device’s " +
                            "functionality, even for fabric administrators. For example, many Home Routers are managed by an " +
                            "Internet Service Provider (a service), and these services often have a policy that requires them to " +
                            "obtain user consent before certain administrative functions can be delegated to a third party (e.g., " +
                            "a fabric Administrator). These restrictions are expressed using an Access Restriction List (ARL)." +
                            "\n" +
                            "The purpose of this feature on the Access Control cluster is to indicate to a fabric Administrator " +
                            "that access by it to specific attributes, commands and/or events for specific clusters is currently " +
                            "prohibited. Attempts to access these restricted data model elements shall result in an error of " +
                            "ACCESS_RESTRICTED." +
                            "\n" +
                            "A device that implements this feature shall have a mechanism to honor the ReviewFabricRestrictions " +
                            "command, such as user interfaces or service interactions associated with a service provider or the " +
                            "device manufacturer, which allows the owner (or subscriber) to manage access restrictions for each " +
                            "fabric. The user interface design, which includes the way restrictions are organized and presented " +
                            "to the user, is not specified, but SHOULD be usable by non-expert end-users from common mobile " +
                            "devices, personal computers, or an on-device user interface." +
                            "\n" +
                            "Controllers and clients SHOULD incorporate generic handling of the ACCESS_RESTRICTED error code, " +
                            "when it appears in allowed contexts, in order to gracefully handle situations where this feature is " +
                            "encountered. Device vendors that adopt this feature SHOULD be judicious in its use given the risk of " +
                            "unexpected behavior in controllers and clients." +
                            "\n" +
                            "For certification testing, a device that implements this feature shall provide a way for all " +
                            "restrictions to be removed." +
                            "\n" +
                            "The ARL attribute provides the set of restrictions currently applied to this fabric." +
                            "\n" +
                            "The ReviewFabricRestrictions command provides a way for the fabric Administrator to request that the " +
                            "server triggers a review of the current fabric restrictions, by involving external entities such as " +
                            "end-users, or other services associated with the manager of the device hosting the server. This " +
                            "review process may involve communication between external services and the user, and may take an " +
                            "unpredictable amount of time to complete since an end-user may need to visit some resources, such as " +
                            "a mobile application or web site. A FabricRestrictionReviewUpdate event will be generated by the " +
                            "device within a predictable time period of the ReviewFabricRestrictionsResponse (see Section " +
                            "9.10.8.1, “ReviewFabricRestrictions Command” for specification of this time period), and this event " +
                            "can be correlated with the ReviewFabricRestrictionsResponse using a token provided in both. The " +
                            "device may provide instructions or a Redirect URL in the FabricRestrictionReviewUpdate event in " +
                            "order to help the user access the features required for managing per-fabric restrictions." +
                            "\n" +
                            "See Section 6.6.2, “Model” for a description of how access control is impacted by the ARL attribute." +
                            "\n" +
                            "### Managed Device Feature Usage Restrictions" +
                            "\n" +
                            "Use of this feature shall be limited to the mandatory clusters of endpoints having a device type " +
                            "that explicitly permits its use in the Device Library Specification. As a reminder, the device types " +
                            "associated with an endpoint are listed in the Descriptor cluster of the endpoint." +
                            "\n" +
                            "In addition, use of this feature shall NOT restrict the following clusters on any endpoint:" +
                            "\n" +
                            "  1. the Descriptor Cluster (0x001D)" +
                            "\n" +
                            "  2. the Binding Cluster (0x001E)" +
                            "\n" +
                            "  3. the Network Commissioning Cluster (0x0031)" +
                            "\n" +
                            "  4. the Identify Cluster (0x0003)" +
                            "\n" +
                            "  5. the Groups Cluster (0x0004)" +
                            "\n" +
                            "In addition, use of this feature shall NOT restrict the global attributes of any cluster." +
                            "\n" +
                            "Because ARLs cannot be used to restrict root node access or access to any clusters required for " +
                            "commissioning, administrators may determine the current restrictions of the ARL at any point, " +
                            "including during commissioning after joining the fabric."
                    }
                ]
            },

            {
                tag: "attribute", name: "Acl", xref: "core§9.10.6.3",

                details: "An attempt to add an Access Control Entry when no more entries are available shall result in a " +
                    "RESOURCE_EXHAUSTED error being reported and the ACL attribute shall NOT have the entry added to it. " +
                    "See access control limits." +
                    "\n" +
                    "See the AccessControlEntriesPerFabric attribute for the actual value of the number of entries per " +
                    "fabric supported by the server." +
                    "\n" +
                    "Each Access Control Entry codifies a single grant of privilege on this Node, and is used by the " +
                    "Access Control Privilege Granting algorithm to determine if a subject has privilege to interact with " +
                    "targets on the Node."
            },

            {
                tag: "attribute", name: "Extension", xref: "core§9.10.6.4",
                details: "If present, the Access Control Extensions may be used by Administrators to store arbitrary data " +
                    "related to fabric’s Access Control Entries." +
                    "\n" +
                    "The Access Control Extension list shall support a single extension entry per supported fabric."
            },

            {
                tag: "attribute", name: "SubjectsPerAccessControlEntry", xref: "core§9.10.6.5",

                details: "This attribute shall provide the minimum number of Subjects per entry that are supported by this " +
                    "server." +
                    "\n" +
                    "Since reducing this value over time may invalidate ACL entries already written, this value shall NOT " +
                    "decrease across time as software updates occur that could impact this value. If this is a concern " +
                    "for a given implementation, it is recommended to only use the minimum value required and avoid " +
                    "reporting a higher value than the required minimum."
            },

            {
                tag: "attribute", name: "TargetsPerAccessControlEntry", xref: "core§9.10.6.6",

                details: "This attribute shall provide the minimum number of Targets per entry that are supported by this " +
                    "server." +
                    "\n" +
                    "Since reducing this value over time may invalidate ACL entries already written, this value shall NOT " +
                    "decrease across time as software updates occur that could impact this value. If this is a concern " +
                    "for a given implementation, it is recommended to only use the minimum value required and avoid " +
                    "reporting a higher value than the required minimum."
            },

            {
                tag: "attribute", name: "AccessControlEntriesPerFabric", xref: "core§9.10.6.7",

                details: "This attribute shall provide the minimum number of ACL Entries per fabric that are supported by this " +
                    "server." +
                    "\n" +
                    "Since reducing this value over time may invalidate ACL entries already written, this value shall NOT " +
                    "decrease across time as software updates occur that could impact this value. If this is a concern " +
                    "for a given implementation, it is recommended to only use the minimum value required and avoid " +
                    "reporting a higher value than the required minimum."
            },

            {
                tag: "attribute", name: "CommissioningArl", xref: "core§9.10.6.8",

                details: "This attribute shall provide the set of CommissioningAccessRestrictionEntryStruct applied during " +
                    "commissioning on a managed device." +
                    "\n" +
                    "When present, the CommissioningARL attribute shall indicate the access restrictions applying during " +
                    "commissioning." +
                    "\n" +
                    "Attempts to access data model elements described by an entry in the CommissioningARL attribute " +
                    "during commissioning shall result in an error of ACCESS_RESTRICTED. See Access Control Model for " +
                    "more information about the features related to controlling access to a Node’s Endpoint Clusters " +
                    "(\"Targets\" hereafter) from other Nodes." +
                    "\n" +
                    "See Section 9.10.4.2.1, “Managed Device Feature Usage Restrictions” for limitations on the use of " +
                    "access restrictions."
            },

            {
                tag: "attribute", name: "Arl", xref: "core§9.10.6.9",

                details: "This attribute shall provide the set of AccessRestrictionEntryStruct applied to the associated " +
                    "fabric on a managed device." +
                    "\n" +
                    "When present, the ARL attribute shall indicate the access restrictions applying to the accessing " +
                    "fabric. In contrast, the CommissioningARL attribute indicates the accessing restrictions that apply " +
                    "when there is no accessing fabric, such as during commissioning." +
                    "\n" +
                    "The access restrictions are externally added/removed based on the particular relationship the device " +
                    "hosting this server has with external entities such as its owner, external service provider, or " +
                    "end-user." +
                    "\n" +
                    "Attempts to access data model elements described by an entry in the ARL attribute for the accessing " +
                    "fabric shall result in an error of ACCESS_RESTRICTED. See Access Control Model for more information " +
                    "about the features related to controlling access to a Node’s Endpoint Clusters (\"Targets\" hereafter) " +
                    "from other Nodes." +
                    "\n" +
                    "See Section 9.10.4.2.1, “Managed Device Feature Usage Restrictions” for limitations on the use of " +
                    "access restrictions."
            },

            {
                tag: "event", name: "AccessControlEntryChanged", xref: "core§9.10.9.1",

                details: "The cluster shall generate AccessControlEntryChanged events whenever its ACL attribute data is " +
                    "changed by an Administrator." +
                    "\n" +
                    "  • Each added entry shall generate an event with ChangeType Added." +
                    "\n" +
                    "  • Each changed entry shall generate an event with ChangeType Changed." +
                    "\n" +
                    "  • Each removed entry shall generate an event with ChangeType Removed.",

                children: [
                    {
                        tag: "field", name: "AdminNodeId", xref: "core§9.10.9.1.1",
                        details: "The Node ID of the Administrator that made the change, if the change occurred via a CASE session." +
                            "\n" +
                            "Exactly one of AdminNodeID and AdminPasscodeID shall be set, depending on whether the change " +
                            "occurred via a CASE or PASE session; the other shall be null."
                    },

                    {
                        tag: "field", name: "AdminPasscodeId", xref: "core§9.10.9.1.2",

                        details: "The Passcode ID of the Administrator that made the change, if the change occurred via a PASE " +
                            "session. Non-zero values are reserved for future use (see PasscodeId generation in " +
                            "PBKDFParamRequest)." +
                            "\n" +
                            "Exactly one of AdminNodeID and AdminPasscodeID shall be set, depending on whether the change " +
                            "occurred via a CASE or PASE session; the other shall be null."
                    },

                    {
                        tag: "field", name: "ChangeType", xref: "core§9.10.9.1.3",
                        details: "The type of change as appropriate."
                    },

                    {
                        tag: "field", name: "LatestValue", xref: "core§9.10.9.1.4",
                        details: "The latest value of the changed entry." +
                            "\n" +
                            "This field SHOULD be set if resources are adequate for it; otherwise it shall be set to NULL if " +
                            "resources are scarce."
                    }
                ]
            },

            {
                tag: "event", name: "AccessControlExtensionChanged", xref: "core§9.10.9.2",

                details: "The cluster shall generate AccessControlExtensionChanged events whenever its extension attribute " +
                    "data is changed by an Administrator." +
                    "\n" +
                    "  • Each added extension shall generate an event with ChangeType Added." +
                    "\n" +
                    "  • Each changed extension shall generate an event with ChangeType Changed." +
                    "\n" +
                    "  • Each removed extension shall generate an event with ChangeType Removed.",

                children: [
                    {
                        tag: "field", name: "AdminNodeId", xref: "core§9.10.9.2.1",
                        details: "The Node ID of the Administrator that made the change, if the change occurred via a CASE session." +
                            "\n" +
                            "Exactly one of AdminNodeID and AdminPasscodeID shall be set, depending on whether the change " +
                            "occurred via a CASE or PASE session; the other shall be null."
                    },

                    {
                        tag: "field", name: "AdminPasscodeId", xref: "core§9.10.9.2.2",

                        details: "The Passcode ID of the Administrator that made the change, if the change occurred via a PASE " +
                            "session. Non-zero values are reserved for future use (see PasscodeId generation in " +
                            "PBKDFParamRequest)." +
                            "\n" +
                            "Exactly one of AdminNodeID and AdminPasscodeID shall be set, depending on whether the change " +
                            "occurred via a CASE or PASE session; the other shall be null."
                    },

                    {
                        tag: "field", name: "ChangeType", xref: "core§9.10.9.2.3",
                        details: "The type of change as appropriate."
                    },

                    {
                        tag: "field", name: "LatestValue", xref: "core§9.10.9.2.4",
                        details: "The latest value of the changed extension." +
                            "\n" +
                            "This field SHOULD be set if resources are adequate for it; otherwise it shall be set to NULL if " +
                            "resources are scarce."
                    }
                ]
            },

            {
                tag: "event", name: "FabricRestrictionReviewUpdate", xref: "core§9.10.9.3",
                details: "The cluster shall generate a FabricRestrictionReviewUpdate event to indicate completion of a fabric " +
                    "restriction review. Due to the requirement to generate this event within a bound time frame of " +
                    "successful receipt of the ReviewFabricRestrictions command, this event may include additional steps " +
                    "that the client may present to the user in order to help the user locate the user interface for the " +
                    "Managed Device feature.",

                children: [
                    {
                        tag: "field", name: "Token", xref: "core§9.10.9.3.1",
                        details: "This field shall indicate the Token that can be used to correlate a ReviewFabricRestrictionsResponse " +
                            "with a FabricRestrictionReviewUpdate event."
                    },

                    {
                        tag: "field", name: "Instruction", xref: "core§9.10.9.3.2",

                        details: "This field shall provide human readable text that may be displayed to the user to help them locate " +
                            "the user interface for managing access restrictions for each fabric." +
                            "\n" +
                            "A device SHOULD implement the Localization Configuration Cluster when it has no other means to " +
                            "determine the locale to use for this text." +
                            "\n" +
                            "Examples include \"Please try again and immediately access device display for further instructions.\" " +
                            "or \"Please check email associated with your Acme account.\""
                    },

                    {
                        tag: "field", name: "ArlRequestFlowUrl", xref: "core§9.10.9.3.3",

                        details: "This field shall indicate the URL for the service associated with the device maker which the user " +
                            "can visit to manage fabric limitations. The syntax of this field shall follow the syntax as " +
                            "specified in RFC 1738 and shall use the https scheme for internet-hosted URLs." +
                            "\n" +
                            "  • The URL may embed the token, fabric index, fabric vendor, or other information transparently in " +
                            "    order to pass context about the originating ReviewFabricRestrictions command to the service " +
                            "    associated with the URL. The service associated with the device vendor may perform vendor ID " +
                            "    verification on the fabric from which the ReviewFabricRestrictions command originated." +
                            "\n" +
                            "  • If the device grants the request, the ARL attribute in the Access Control Cluster shall be " +
                            "    updated to reflect the new access rights and a successful response shall be returned to the " +
                            "    device making the request using the MTaer field of the callbackUrl. If the request is denied, " +
                            "    the ARL attribute shall remain unchanged and a failure response shall be returned to the device " +
                            "    making the request using the MTaer field of the callbackUrl." +
                            "\n" +
                            "  • The device using this mechanism shall provide a service at the URL that can accept requests for " +
                            "    additional access and return responses indicating whether the requests were granted or denied." +
                            "\n" +
                            "  • This URL will typically lead to a server which (e.g. by looking at the User-Agent) redirects the " +
                            "    user to allow viewing, downloading, installing or using a manufacturer-provided means for " +
                            "    guiding the user through the process to review and approve or deny the request. The device " +
                            "    manufacturer may choose to use a constructed URL which is valid in a HTTP GET request (i.e. " +
                            "    dedicated for the product) such as, for example, https://domain.example/arl-app?vid=FFF1& " +
                            "    pid=1234. If a client follows or launches the ARLRequestFlowUrl, it shall expand it as described " +
                            "    in Section 9.10.9.3.4, “ARLRequestFlowUrl format”." +
                            "\n" +
                            "  • A manufacturer contemplating using this flow should realize that" +
                            "\n" +
                            "    ◦ This flow typically requires internet access to access the URL, and access extension may fail " +
                            "      when internet connectivity is not available." +
                            "\n" +
                            "    ◦ If the flow prefers to redirect the user to an app which is available on popular platforms, it " +
                            "      SHOULD also provide a fallback option such as a web browser interface to ensure users can " +
                            "      complete access extension." +
                            "\n" +
                            "### ARLRequestFlowUrl format" +
                            "\n" +
                            "The ARLRequestFlowUrl shall contain a query component (see RFC 3986 section 3.4) composed of one or " +
                            "more key-value pairs:" +
                            "\n" +
                            "  • The query shall use the & delimiter between key/value pairs." +
                            "\n" +
                            "  • The key-value pairs shall in the format name=<value> where name is the key name, and <value> is " +
                            "    the contents of the value encoded with proper URL-encoded escaping." +
                            "\n" +
                            "  • If key MTcu is present, it shall have a value of \"_\" (i.e. MTcu=_). This is the \"callback URL " +
                            "    (Call backUrl) placeholder\"." +
                            "\n" +
                            "  • Any key whose name begins with MT not mentioned in the previous bullets shall be reserved for " +
                            "    future use by this specification. Manufacturers shall NOT include query keys starting with MT in " +
                            "    the ARLRequestFlowUrl unless they are referenced by a version of this specification." +
                            "\n" +
                            "Any other element in the ARLRequestFlowUrl query field not covered by the above rules, as well as " +
                            "the fragment field (if present), shall remain including the order of query key/value pairs present." +
                            "\n" +
                            "### Expansion of ARLRequestFlowUrl by client" +
                            "\n" +
                            "Once the URL is obtained, it shall be expanded to form a final URL (ExpandedARLRequestFlowUrl) by " +
                            "proceeding with the following substitution algorithm on the original ARLRequestFlowUrl:" +
                            "\n" +
                            "  1. If key MTcu is present, compute the CallbackUrl desired (see Section 9.10.9.3.5, “CallbackUrl " +
                            "     format for ARL Request Flow response”), and substitute the placeholder value \"_\" (i.e. in " +
                            "     MTcu=_) in the ARLRequestFlowUrl with the desired contents, encoded with proper URL-encoded " +
                            "     escaping (see RFC 3986 section 2)." +
                            "\n" +
                            "The final URL after expansion (ExpandedARLRequestFlowUrl) shall be the one to follow, rather than " +
                            "the original value obtained from the FabricRestrictionReviewUpdate event." +
                            "\n" +
                            "### CallbackUrl format for ARL Request Flow response" +
                            "\n" +
                            "If a CallbackUrl field (i.e. MTcu=) query field placeholder is present in the ARLRequestFlowUrl, the " +
                            "client may replace the placeholder value \"_\" in the ExpandedARLRequestFlowUrl with a URL that the " +
                            "manufacturer flow can use to make a smooth return to the client when the ARL flow has terminated." +
                            "\n" +
                            "This URL field may contain a query component (see RFC 3986 section 3.4). If a query is present, it " +
                            "shall be composed of one or more key-value pairs:" +
                            "\n" +
                            "  • The query shall use the & delimiter between key/value pairs." +
                            "\n" +
                            "  • The key-value pairs shall follow the format name=<value> where name is the key name, and <value> " +
                            "    is the contents of the value encoded with proper URL-encoded escaping." +
                            "\n" +
                            "  • If key MTaer is present, it shall have a value of \"_\" (i.e. MTaer=_). This is the placeholder " +
                            "    for a \"access extension response\" provided by the manufacturer flow to the client. The " +
                            "    manufacturer flow shall replace this placeholder with the final status of the access extension " +
                            "    request, which shall be formatted following Expansion of CallbackUrl by the manufacturer custom " +
                            "    flow and encoded with proper URL-encoded escaping." +
                            "\n" +
                            "  • Any key whose name begins with MT not mentioned in the previous bullets shall be reserved for " +
                            "    future use by this specification." +
                            "\n" +
                            "Any other element in the CallbackUrl query field not covered by the above rules, as well as the " +
                            "fragment field (if present), shall remain as provided by the client through embedding within the " +
                            "ExpandedARLRequestFlowUrl, including the order of query key/value pairs present." +
                            "\n" +
                            "### Expansion of CallbackUrl by the manufacturer custom flow" +
                            "\n" +
                            "Once the CallbackUrl is obtained by the manufacturer flow, it may be expanded to form a final " +
                            "ExpandedARLRequestCallbackUrl URL to be used by proceeding with the following substitution algorithm " +
                            "on the provided CallbackUrl:" +
                            "\n" +
                            "  • If key MTaer is present, the manufacturer custom flow having received the initial query " +
                            "    containing the CallbackUrl shall substitute the placeholder value \"_\" (i.e. in MTaer=_) in the " +
                            "    CallbackUrl with the final status of the access extension request flow which shall be one of the " +
                            "    following. Any value returned in the MTaer field not listed above shall be considered an error " +
                            "    and shall be treated as GeneralFailure." +
                            "\n" +
                            "    ◦ Success - The flow completed successfully and the ARL attribute was updated. The client may " +
                            "      now read the ARL attribute to determine the new access restrictions." +
                            "\n" +
                            "    ◦ NoChange - The ARL attribute was already listing minimum restrictions for the requesting " +
                            "      fabric." +
                            "\n" +
                            "    ◦ GeneralFailure - The flow failed for an unspecified reason." +
                            "\n" +
                            "    ◦ FlowAuthFailure - The user failed to authenticate to the flow." +
                            "\n" +
                            "    ◦ NotFound - Access extension failed because the target fabric was not found." +
                            "\n" +
                            "A manufacturer custom flow having received an ExpandedARLRequestFlowUrl SHOULD attempt to open the " +
                            "ExpandedARLRequestCallbackUrl, on completion of the request, if an ExpandedARLRequestCallbackUrl was " +
                            "computed from the CallbackUrl and opening such a URL is supported." +
                            "\n" +
                            "### Examples of ARLRequestFlowUrl URLs" +
                            "\n" +
                            "Below are some examples of valid ExpandedARLRequestFlowUrl for several valid values of " +
                            "ARLRequestFlowUrl, as well as some examples of invalid values of ARLRequestFlowUrl:" +
                            "\n" +
                            "  • Invalid URL with no query string: http scheme is not allowed:" +
                            "\n" +
                            "    ◦ http://company.domain.example/matter/arl/vFFF1p1234" +
                            "\n" +
                            "  • Valid URL :" +
                            "\n" +
                            "    ◦ https://company.domain.example/matter/arl/vFFF1p1234" +
                            "\n" +
                            "  • Valid URL, CallbackUrl requested:" +
                            "\n" +
                            "    ◦ Before expansion:" +
                            "\n" +
                            "https://company.domain.example/matter/arl?vid=FFF1&pid=1234&MTcu=_" +
                            "\n" +
                            "  ◦ After expansion: " +
                            "    https://company.domain.example/matter/arl?vid=FFF1&pid=1234&MTcu=https%3A%2F%2Fc " +
                            "    lient.domain.example%2Fcb%3Ftoken%3DmAsJ6_vqbr-vjDiG_w%253D%253D%26MTaer%3D_" +
                            "\n" +
                            "  ◦ The ExpandedARLRequestFlowUrl URL contains:" +
                            "\n" +
                            "    ▪ A CallbackUrl with a client-provided arbitrary token= key/value pair and the MTaer= key/value " +
                            "      pair place-holder to indicate support for a return access extension completion status: " +
                            "      https://client.domain.example/cb?token=mAsJ6_vqbr-vjDiG_w%3D%3D&MTaer=_" +
                            "\n" +
                            "    ▪ After expansion of the CallbackUrl (MTcu key) into an ExpandedCallbackUrl, with an example " +
                            "      return access extension completion status of Success, the ExpandedARLRequestCallbackUrl would " +
                            "      be:" +
                            "\n" +
                            "https://client.domain.example/cb?token=mAsJ6_vqbr-vjDiG_w%3D%3D&MTaer=Success" +
                            "\n" +
                            "Note that the MTcu key/value pair was initially provided URL-encoded within the " +
                            "ExpandedARLRequestFlowUrl URL and the MTaer=_ key/value pair placeholder now contains a substituted " +
                            "returned completion status." +
                            "\n" +
                            "  • Invalid URL, due to MTza=79 key/value pair in reserved MT-prefixed keys reserved for future use:" +
                            "\n" +
                            "    ◦ https://company.domain.example/matter/arl?vid=FFF1&pid=1234&MTop=_&MTza=79"
                    }
                ]
            },

            {
                tag: "command", name: "ReviewFabricRestrictions", xref: "core§9.10.8.1",

                details: "This command signals to the service associated with the device vendor that the fabric administrator " +
                    "would like a review of the current restrictions on the accessing fabric. This command includes an " +
                    "optional list of ARL entries that the fabric administrator would like removed." +
                    "\n" +
                    "In response, a ReviewFabricRestrictionsResponse is sent which contains a token that can be used to " +
                    "correlate a review request with a FabricRestrictionReviewUpdate event." +
                    "\n" +
                    "Within 1 hour of the ReviewFabricRestrictionsResponse, the FabricRestrictionReviewUpdate event shall " +
                    "be generated, in order to indicate completion of the review and any additional steps required by the " +
                    "user for the review." +
                    "\n" +
                    "A review may include obtaining consent from the user, which can take time. For example, the user may " +
                    "need to respond to an email or a push notification." +
                    "\n" +
                    "The ARL attribute may change at any time due to actions taken by the user, or the service associated " +
                    "with the device vendor.",

                children: [{
                    tag: "field", name: "Arl", xref: "core§9.10.8.1.1",
                    details: "When the ARL field is provided, it indicates the specific restrictions that are requested for " +
                        "review. An empty list represents a generic request for review of all restrictions."
                }]
            },

            {
                tag: "command", name: "ReviewFabricRestrictionsResponse", xref: "core§9.10.8.2",
                details: "Returns the review token for the request, which can be used to correlate with a " +
                    "FabricRestrictionReviewUpdate event.",
                children: [{
                    tag: "field", name: "Token", xref: "core§9.10.8.2.1",
                    details: "This field shall specify a Token that can be used to correlate a ReviewFabricRestrictionsResponse " +
                        "with a FabricRestrictionReviewUpdate event."
                }]
            },

            {
                tag: "datatype", name: "ChangeTypeEnum", xref: "core§9.10.5.1",
                children: [
                    { tag: "field", name: "Changed", description: "Entry or extension was changed" },
                    { tag: "field", name: "Added", description: "Entry or extension was added" },
                    { tag: "field", name: "Removed", description: "Entry or extension was removed" }
                ]
            },

            {
                tag: "datatype", name: "AccessControlEntryPrivilegeEnum", xref: "core§9.10.5.2",

                children: [
                    { tag: "field", name: "View", description: "Can read and observe all (except Access Control Cluster)" },

                    {
                        tag: "field", name: "Operate",
                        description: "View privileges, and can perform the primary function of this Node (except Access Control Cluster)",
                        xref: "core§9.10.5.2.1",
                        details: "### This value implicitly grants View privileges"
                    },

                    {
                        tag: "field", name: "Manage",
                        description: "Operate privileges, and can modify persistent configuration of this Node (except Access Control Cluster)",
                        xref: "core§9.10.5.2.2",
                        details: "This value implicitly grants Operate & View privileges"
                    },

                    {
                        tag: "field", name: "Administer",
                        description: "Manage privileges, and can observe and modify the Access Control Cluster",
                        xref: "core§9.10.5.2.3",
                        details: "This value implicitly grants Manage, Operate & View privileges"
                    }
                ]
            },

            {
                tag: "datatype", name: "AccessRestrictionTypeEnum", xref: "core§9.10.5.3",

                children: [
                    {
                        tag: "field", name: "AttributeAccessForbidden",
                        description: "Clients on this fabric are currently forbidden from reading and writing an attribute"
                    },
                    {
                        tag: "field", name: "AttributeWriteForbidden",
                        description: "Clients on this fabric are currently forbidden from writing an attribute"
                    },
                    {
                        tag: "field", name: "CommandForbidden",
                        description: "Clients on this fabric are currently forbidden from invoking a command"
                    },
                    {
                        tag: "field", name: "EventForbidden",
                        description: "Clients on this fabric are currently forbidden from reading an event"
                    }
                ]
            },

            {
                tag: "datatype", name: "AccessControlEntryAuthModeEnum", xref: "core§9.10.5.4",
                children: [
                    { tag: "field", name: "Pase", description: "Passcode authenticated session" },
                    { tag: "field", name: "Case", description: "Certificate authenticated session" },
                    { tag: "field", name: "Group", description: "Group authenticated session" }
                ]
            },

            { tag: "datatype", name: "AccessControlTargetStruct", xref: "core§9.10.5.5" },

            {
                tag: "datatype", name: "AccessControlEntryStruct", xref: "core§9.10.5.6",

                children: [
                    {
                        tag: "field", name: "Privilege", xref: "core§9.10.5.6.1",

                        details: "The privilege field shall specify the level of privilege granted by this Access Control Entry." +
                            "\n" +
                            "Each privilege builds upon its predecessor, expanding the set of actions that can be performed upon " +
                            "a Node. Administer is the highest privilege, and is special as it pertains to the administration of " +
                            "privileges itself, via the Access Control Cluster." +
                            "\n" +
                            "When a Node is granted a particular privilege, it is also implicitly granted all logically lower " +
                            "privilege levels as well. The following diagram illustrates how the higher privilege levels subsume " +
                            "the lower privilege levels:" +
                            "\n" +
                            "Individual clusters shall define whether attributes are readable, writable, or both readable and " +
                            "writable. Clusters also shall define which privilege is minimally required to be able to perform a " +
                            "particular read or write action on those attributes, or invoke particular commands. Device type " +
                            "specifications may further restrict the privilege required." +
                            "\n" +
                            "The Access Control Cluster shall require the Administer privilege to observe and modify the Access " +
                            "Control Cluster itself. The Administer privilege shall NOT be used on Access Control Entries which " +
                            "use the Group auth mode."
                    },

                    {
                        tag: "field", name: "AuthMode", xref: "core§9.10.5.6.2",
                        details: "The AuthMode field shall specify the authentication mode required by this Access Control Entry."
                    },

                    {
                        tag: "field", name: "Subjects", xref: "core§9.10.5.6.3",

                        details: "The subjects field shall specify a list of Subject IDs, to which this Access Control Entry grants " +
                            "access." +
                            "\n" +
                            "Device types may impose additional constraints on the minimum number of subjects per Access Control " +
                            "Entry." +
                            "\n" +
                            "An attempt to create an entry with more subjects than the node can support shall result in a " +
                            "RESOURCE_EXHAUSTED error and the entry shall NOT be created." +
                            "\n" +
                            "### Subject ID shall be of type uint64 with semantics depending on the entry’s AuthMode as follows:" +
                            "\n" +
                            "### Subject Semantics" +
                            "\n" +
                            "An empty subjects list indicates a wildcard; that is, this entry shall grant access to any Node that " +
                            "successfully authenticates via AuthMode. The subjects list shall NOT be empty if the entry’s " +
                            "AuthMode is PASE." +
                            "\n" +
                            "The PASE AuthMode is reserved for future use (see Section 6.6.2.9, “Bootstrapping of the Access " +
                            "Control Cluster”). An attempt to write an entry with AuthMode set to PASE shall fail with a status " +
                            "code of CONSTRAINT_ERROR." +
                            "\n" +
                            "For PASE authentication, the Passcode ID identifies the required passcode verifier, and shall be 0 " +
                            "for the default commissioning passcode." +
                            "\n" +
                            "For CASE authentication, the Subject ID is a distinguished name within the Operational Certificate " +
                            "shared during CASE session establishment, the type of which is determined by its range to be one of:" +
                            "\n" +
                            "  • a Node ID, which identifies the required source node directly (by ID)" +
                            "\n" +
                            "  • a CASE Authenticated Tag, which identifies the required source node indirectly (by tag)" +
                            "\n" +
                            "For Group authentication, the Group ID identifies the required group, as defined in the Group Key " +
                            "Management Cluster."
                    },

                    {
                        tag: "field", name: "Targets", xref: "core§9.10.5.6.4",

                        details: "The targets field shall specify a list of AccessControlTargetStruct, which define the clusters on " +
                            "this Node to which this Access Control Entry grants access." +
                            "\n" +
                            "Device types may impose additional constraints on the minimum number of targets per Access Control " +
                            "Entry." +
                            "\n" +
                            "An attempt to create an entry with more targets than the node can support shall result in a " +
                            "RESOURCE_EXHAUSTED error and the entry shall NOT be created." +
                            "\n" +
                            "A single target shall contain at least one field (Cluster, Endpoint, or DeviceType), and shall NOT " +
                            "contain both an Endpoint field and a DeviceType field." +
                            "\n" +
                            "A target grants access based on the presence of fields as follows:" +
                            "\n" +
                            "### Target Semantics" +
                            "\n" +
                            "An empty targets list indicates a wildcard: that is, this entry shall grant access to all cluster " +
                            "instances on all endpoints on this Node."
                    }
                ]
            },

            {
                tag: "datatype", name: "AccessControlExtensionStruct", xref: "core§9.10.5.7",

                children: [{
                    tag: "field", name: "Data", xref: "core§9.10.5.7.1",

                    details: "This field may be used by manufacturers to store arbitrary TLV-encoded data related to a fabric’s " +
                        "Access Control Entries." +
                        "\n" +
                        "The contents shall consist of a top-level anonymous list; each list element shall include a " +
                        "profile-specific tag encoded in fully-qualified form." +
                        "\n" +
                        "Administrators may iterate over this list of elements, and interpret selected elements at their " +
                        "discretion. The content of each element is not specified, but may be coordinated among manufacturers " +
                        "at their discretion."
                }]
            },

            {
                tag: "datatype", name: "AccessRestrictionStruct", xref: "core§9.10.5.8",
                details: "This structure describes an access restriction that would be applied to a specific data model " +
                    "element on a given endpoint/cluster pair (see AccessRestrictionEntryStruct).",

                children: [
                    {
                        tag: "field", name: "Type", xref: "core§9.10.5.8.1",
                        details: "This field shall indicate the type of restriction, for example, AttributeAccessForbidden."
                    },

                    {
                        tag: "field", name: "Id", xref: "core§9.10.5.8.2",

                        details: "This field shall indicate the element Manufacturer Extensible Identifier (MEI) associated with the " +
                            "element type subject to the access restriction, based upon the AccessRestrictionTypeEnum. When the " +
                            "Type is AttributeAccessForbidden or AttributeWriteForbidden, this value shall be considered of type " +
                            "attrib-id (i.e. an attribute identifier). When the Type is CommandForbidden, this value shall be " +
                            "considered of type command-id (i.e. an attribute identifier). When the Type is EventForbidden, this " +
                            "value shall be considered of type event-id (i.e. an event identifier)." +
                            "\n" +
                            "A null value shall indicate the wildcard value for the given value of Type (i.e. all elements " +
                            "associated with the Type under the associated endpoint and cluster for the containing " +
                            "AccessRestrictionEntryStruct)."
                    }
                ]
            },

            {
                tag: "datatype", name: "AccessRestrictionEntryStruct", xref: "core§9.10.5.9",
                details: "This structure describes a current access restriction on the fabric.",

                children: [
                    {
                        tag: "field", name: "Endpoint", xref: "core§9.10.5.9.1",
                        details: "This field shall indicate the endpoint having associated access restrictions scoped to the " +
                            "associated fabric of the list containing the entry."
                    },
                    {
                        tag: "field", name: "Cluster", xref: "core§9.10.5.9.2",
                        details: "This field shall indicate the cluster having associated access restrictions under the entry’s " +
                            "Endpoint, scoped to the associated fabric of the list containing the entry."
                    },

                    {
                        tag: "field", name: "Restrictions", xref: "core§9.10.5.9.3",
                        details: "This field shall indicate the set of restrictions applying to the Cluster under the given Endpoint, " +
                            "scoped to the associated fabric of the list containing the entry." +
                            "\n" +
                            "This list shall NOT be empty."
                    }
                ]
            },

            {
                tag: "datatype", name: "CommissioningAccessRestrictionEntryStruct", xref: "core§9.10.5.10",
                details: "This structure describes a current access restriction when there is no accessing fabric.",

                children: [
                    {
                        tag: "field", name: "Endpoint", xref: "core§9.10.5.10.1",
                        details: "This field shall indicate the endpoint having associated access restrictions scoped to the " +
                            "associated fabric of the list containing the entry."
                    },
                    {
                        tag: "field", name: "Cluster", xref: "core§9.10.5.10.2",
                        details: "This field shall indicate the cluster having associated access restrictions under the entry’s " +
                            "Endpoint, scoped to the associated fabric of the list containing the entry."
                    },

                    {
                        tag: "field", name: "Restrictions", xref: "core§9.10.5.10.3",
                        details: "This field shall indicate the set of restrictions applying to the Cluster under the given Endpoint, " +
                            "scoped to the associated fabric of the list containing the entry." +
                            "\n" +
                            "This list shall NOT be empty."
                    }
                ]
            }
        ]
    }
);

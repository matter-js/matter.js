/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "OtaSoftwareUpdateRequestor", classification: "node", pics: "OTAR",
    xref: "core§11.20.7",

    children: [
        {
            tag: "attribute", name: "DefaultOtaProviders", xref: "core§11.20.7.5.1",

            details: "This field is a list of ProviderLocation whose entries shall be set by Administrators, either during " +
                "Commissioning or at a later time, to set the ProviderLocation for the default OTA Provider Node to " +
                "use for software updates on a given Fabric." +
                "\n" +
                "There shall NOT be more than one entry per Fabric. On a list update that would introduce more than " +
                "one entry per fabric, the write shall fail with CONSTRAINT_ERROR status code." +
                "\n" +
                "Provider Locations obtained using the AnnounceOTAProvider command shall NOT overwrite values set in " +
                "the DefaultOTAProviders attribute."
        },

        {
            tag: "attribute", name: "UpdatePossible", xref: "core§11.20.7.5.2",
            details: "This field shall be set to True if the OTA Requestor is currently able to be updated. Otherwise, it " +
                "shall be set to False in case of any condition preventing update being possible, such as " +
                "insufficient capacity of an internal battery. This field is merely informational for diagnostics " +
                "purposes and shall NOT affect the responses provided by an OTA Provider to an OTA Requestor."
        },

        {
            tag: "attribute", name: "UpdateState", xref: "core§11.20.7.5.3",
            details: "This field shall reflect the current state of the OTA Requestor with regards to obtaining software " +
                "updates. See Section 11.20.7.4.2, “UpdateStateEnum Type” for possible values." +
                "\n" +
                "This field SHOULD be updated in a timely manner whenever OTA Requestor internal state updates."
        },

        {
            tag: "attribute", name: "UpdateStateProgress", xref: "core§11.20.7.5.4",

            details: "This field shall reflect the percentage value of progress, relative to the current UpdateState, if " +
                "applicable to the state." +
                "\n" +
                "The value of this field shall be null if a progress indication does not apply to the current state." +
                "\n" +
                "A value of 0 shall indicate that the beginning has occurred. A value of 100 shall indicate " +
                "completion." +
                "\n" +
                "This field may be updated infrequently. Some care SHOULD be taken by Nodes to avoid over-reporting " +
                "progress when this attribute is part of a subscription."
        },

        {
            tag: "event", name: "StateTransition", xref: "core§11.20.7.7.1",
            details: "This event shall be generated when a change of the UpdateState attribute occurs due to an OTA " +
                "Requestor moving through the states necessary to query for updates.",

            children: [
                {
                    tag: "field", name: "PreviousState", xref: "core§11.20.7.7.1.1",
                    details: "This field shall be set to the state that preceded the transition causing this event to be " +
                        "generated, if such a state existed. If no previous state exists, the value shall be Unknown."
                },
                {
                    tag: "field", name: "NewState", xref: "core§11.20.7.7.1.2",
                    details: "This field shall be set to the state now in effect through the transition causing this event to be " +
                        "generated."
                },
                {
                    tag: "field", name: "Reason", xref: "core§11.20.7.7.1.3",
                    details: "This field shall be set to the reason why this event was generated."
                },

                {
                    tag: "field", name: "TargetSoftwareVersion", xref: "core§11.20.7.7.1.4",
                    details: "This field shall be set to the target SoftwareVersion which is the subject of the operation, " +
                        "whenever the NewState is Downloading, Applying or RollingBack. Otherwise TargetSoftwareVersion shall " +
                        "be null."
                }
            ]
        },

        {
            tag: "event", name: "VersionApplied", xref: "core§11.20.7.7.2",
            details: "This event shall be generated whenever a new version starts executing after being applied due to a " +
                "software update. This event SHOULD be generated even if a software update was done using means " +
                "outside of this cluster.",

            children: [
                {
                    tag: "field", name: "SoftwareVersion", xref: "core§11.20.7.7.2.1",
                    details: "This field shall be set to the same value as the one available in the Software Version attribute of " +
                        "the Basic Information Cluster for the newly executing version."
                },

                {
                    tag: "field", name: "ProductId", xref: "core§11.20.7.7.2.2",
                    details: "This field shall be set to the ProductID applying to the executing version, as reflected by the " +
                        "Basic Information Cluster. This can be used to detect a product updating its definition due to a " +
                        "large-scale functional update that may impact aspects of the product reflected in the DeviceModel " +
                        "schema of the Distributed Compliance Ledger."
                }
            ]
        },

        {
            tag: "event", name: "DownloadError", xref: "core§11.20.7.7.3",
            details: "This event shall be generated whenever an error occurs during OTA Requestor download operation.",

            children: [
                {
                    tag: "field", name: "SoftwareVersion", xref: "core§11.20.7.7.3.1",
                    details: "This field shall be set to the value of the SoftwareVersion being downloaded, matching the " +
                        "SoftwareVersion field of the QueryImageResponse that caused the failing download to take place."
                },
                {
                    tag: "field", name: "BytesDownloaded", xref: "core§11.20.7.7.3.2",
                    details: "This field shall be set to the number of bytes that have been downloaded during the failing transfer " +
                        "that caused this event to be generated."
                },

                {
                    tag: "field", name: "ProgressPercent", xref: "core§11.20.7.7.3.3",
                    details: "This field shall be set to the nearest integer percent value reflecting how far within the transfer " +
                        "the failure occurred during the failing transfer that caused this event to be generated, unless the " +
                        "total length of the transfer is unknown, in which case it shall be null."
                },

                {
                    tag: "field", name: "PlatformCode", xref: "core§11.20.7.7.3.4",
                    details: "This field SHOULD be set to some internal product-specific error code, closest in " +
                        "temporal/functional proximity to the failure that caused this event to be generated. Otherwise, it " +
                        "shall be null. This event field may be used for debugging purposes and no uniform definition exists " +
                        "related to its meaning."
                }
            ]
        },

        {
            tag: "command", name: "AnnounceOtaProvider", xref: "core§11.20.7.6.1",
            details: "This command may be invoked by Administrators to announce the presence of a particular OTA Provider." +
                "\n" +
                "This command shall be scoped to the accessing fabric." +
                "\n" +
                "If the accessing fabric index is 0, this command shall fail with an UNSUPPORTED_ACCESS status code.",

            children: [
                {
                    tag: "field", name: "ProviderNodeId", xref: "core§11.20.7.6.1.1",
                    details: "This field shall contain the Node ID of a Node implementing the OTA Provider cluster server, on the " +
                        "accessing fabric."
                },
                {
                    tag: "field", name: "VendorId", xref: "core§11.20.7.6.1.2",
                    details: "This field shall contain the assigned Vendor ID of the Node invoking this command, as it would " +
                        "appear in that Node’s Basic Information Cluster VendorID attribute."
                },
                {
                    tag: "field", name: "AnnouncementReason", xref: "core§11.20.7.6.1.3",
                    details: "This field shall contain a value expressing the reason for the announcement."
                },

                {
                    tag: "field", name: "MetadataForNode", xref: "core§11.20.7.6.1.4",

                    details: "This optional field, if present, shall consist of a top-level anonymous list; each list element " +
                        "shall have a profile-specific tag encoded in fully-qualified form. Each list element shall contain a " +
                        "manufacturer-specific payload, which the Node invoking this command wants to expose to the receiving " +
                        "Node. This payload may be used for any purpose and SHOULD be as small as practical, especially if " +
                        "invoked to groups, in order to reduce networking burden of these payloads." +
                        "\n" +
                        "This field SHOULD only be included if the sending OTA Provider has knowledge that some recipient can " +
                        "make use of it."
                },

                {
                    tag: "field", name: "Endpoint", xref: "core§11.20.7.6.1.5",

                    details: "This field shall contain the endpoint number which has the OTA Provider device type and OTA Software " +
                        "Update Provider cluster server on the ProviderNodeID. This is provided to avoid having to do " +
                        "discovery of the location of that endpoint by walking over all endpoints and checking their " +
                        "Descriptor Cluster." +
                        "\n" +
                        "### When Generated" +
                        "\n" +
                        "An OTA Provider may invoke this command directly to an OTA Requestor, to announce its presence as an " +
                        "OTA Provider on the Fabric." +
                        "\n" +
                        "These announcements, if made, SHOULD be made at most once every 24 hours for any given target Node, " +
                        "to assist OTA Requestors in discovering available OTA Provider resources, unless the " +
                        "AnnouncementReason is UrgentUpdateAvailable, in which case this command may be more frequent." +
                        "\n" +
                        "Any invocation shall be made with a delay of at least 1 second between invocations from a given OTA " +
                        "Provider, to reduce burden on the networking infrastructure and affect a form of serialized jitter. " +
                        "It is recommended to offset the first announcement of a round (i.e. new set of announcements after a " +
                        "previous complete set) by a random delay time with a distribution span of >= 60 seconds to jitter " +
                        "announcement schedules over time." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "On receipt of this command, an OTA Requestor SHOULD consider the new ProviderNodeID and " +
                        "AnnouncementReason to possibly query for new software sooner than it would have with its default " +
                        "behavior." +
                        "\n" +
                        "The OTA Requestor SHOULD NOT update entries in the DefaultOTAProviders list based on announcements." +
                        "\n" +
                        "The receiving Node may ignore the content of the announcement if it is unable or unwilling to " +
                        "further query OTA Providers temporarily, or if its provider list is full. If the announcement is " +
                        "ignored, the response SHOULD be SUCCESS." +
                        "\n" +
                        "Depending on the value of the AnnouncementReason field, the OTA Requestor may have to query the OTA " +
                        "Provider. See Section 11.20.7.6.1.3, “AnnouncementReason Field” for the different values and their " +
                        "meaning." +
                        "\n" +
                        "If present, the MetadataForNode field’s may be used by a receiving OTA Requestor in any way it deems " +
                        "satisfactory. The MetadataForNode field SHOULD be empty under most normal operational circumstance, " +
                        "but can be useful in environments such as field trials or integration test environments to hint at " +
                        "additional capabilities which OTA Requestors may use in a particular Vendor-specific context."
                }
            ]
        },

        {
            tag: "datatype", name: "AnnouncementReasonEnum", xref: "core§11.20.7.4.1",

            children: [
                {
                    tag: "field", name: "SimpleAnnouncement",
                    description: "An OTA Provider is announcing its presence.", xref: "core§11.20.7.4.1.1",
                    details: "An OTA Provider is announcing its presence, but there is no implication that an OTA Requestor would " +
                        "have a new Software Image available if it queried immediately."
                },

                {
                    tag: "field", name: "UpdateAvailable",
                    description: "An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software Image MAY be available.",
                    xref: "core§11.20.7.4.1.2",
                    details: "An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software " +
                        "Image may be available. The details may only be obtained by executing a OTA Software Update Query " +
                        "procedure. A receiving OTA Requestor SHOULD only query the indicated OTA Provider at the " +
                        "ProviderLocation at its next upcoming OTA Provider query."
                },

                {
                    tag: "field", name: "UrgentUpdateAvailable",
                    description: "An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software Image MAY be available, which contains an update that needs to be applied urgently.",
                    xref: "core§11.20.7.4.1.3",

                    details: "An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software " +
                        "Image may be available, which contains an update that needs to be applied urgently. The details may " +
                        "only be obtained by executing a OTA Software Update Query procedure. A receiving OTA Requestor " +
                        "SHOULD query the indicated OTA Provider at the ProviderLocation after a random jitter delay between " +
                        "1 and 600 seconds. This particular reason SHOULD only be employed when an urgent update is " +
                        "available, such as an important security update, or just after initial commissioning of a device, to " +
                        "assist OTA Requestors in more rapidly obtaining updated software."
                }
            ]
        },

        {
            tag: "datatype", name: "UpdateStateEnum", xref: "core§11.20.7.4.2",

            children: [
                {
                    tag: "field", name: "Unknown", description: "Current state is not yet determined.",
                    xref: "core§11.20.7.4.2.1",
                    details: "This value shall indicate that the current state is not yet determined. Nodes SHOULD attempt a " +
                        "better state reporting."
                },

                {
                    tag: "field", name: "Idle",
                    description: "Indicate a Node not yet in the process of software update.",
                    xref: "core§11.20.7.4.2.2",
                    details: "This value shall indicate a Node not yet in the process of software update, for example because it " +
                        "is awaiting the moment when a query will be made."
                },

                {
                    tag: "field", name: "Querying",
                    description: "Indicate a Node in the process of querying an OTA Provider.",
                    xref: "core§11.20.7.4.2.3",
                    details: "This value shall indicate a Node in the process of querying an OTA Provider with QueryImage command, " +
                        "including during the process of awaiting a response to that command."
                },

                {
                    tag: "field", name: "DelayedOnQuery", description: "Indicate a Node waiting after a Busy response.",
                    xref: "core§11.20.7.4.2.4",
                    details: "This value shall indicate a Node waiting because it received a prior QueryImageResponse with a " +
                        "Status field indicating Busy."
                },

                {
                    tag: "field", name: "Downloading",
                    description: "Indicate a Node currently in the process of downloading a software update.",
                    xref: "core§11.20.7.4.2.5",
                    details: "This value shall indicate a Node currently in the process of downloading a software update."
                },

                {
                    tag: "field", name: "Applying",
                    description: "Indicate a Node currently in the process of verifying and applying a software update.",
                    xref: "core§11.20.7.4.2.6",
                    details: "This value shall indicate a Node currently in the process of verifying and applying a software " +
                        "update."
                },

                {
                    tag: "field", name: "DelayedOnApply",
                    description: "Indicate a Node waiting caused by AwaitNextAction response.",
                    xref: "core§11.20.7.4.2.7",
                    details: "This value shall indicate a Node waiting because it received a prior ApplyUpdateResponse with an " +
                        "Action field set to AwaitNextAction."
                },

                {
                    tag: "field", name: "RollingBack",
                    description: "Indicate a Node in the process of recovering to a previous version.",
                    xref: "core§11.20.7.4.2.8",
                    details: "This value shall indicate a Node in the process of recovering to a previous version from a new " +
                        "version that was applied, but that could not remain in force, for reasons such as invalid data " +
                        "detected on boot, or significant runtime issues such as reboot loops. Eventually, the next state " +
                        "seen SHOULD be Unknown or Idle."
                },

                {
                    tag: "field", name: "DelayedOnUserConsent",
                    description: "Indicate a Node is capable of user consent."
                }
            ]
        },

        {
            tag: "datatype", name: "ChangeReasonEnum", xref: "core§11.20.7.4.3",

            children: [
                {
                    tag: "field", name: "Unknown", description: "The reason for a state change is unknown.",
                    xref: "core§11.20.7.4.3.1",
                    details: "This value shall indicate that the reason for a state change is unknown."
                },

                {
                    tag: "field", name: "Success",
                    description: "The reason for a state change is the success of a prior operation.",
                    xref: "core§11.20.7.4.3.2",
                    details: "This value shall indicate that the reason for a state change is the success of a prior operation."
                },

                {
                    tag: "field", name: "Failure",
                    description: "The reason for a state change is the failure of a prior operation.",
                    xref: "core§11.20.7.4.3.3",
                    details: "This value shall indicate that the reason for a state change is the failure of a prior operation."
                },

                {
                    tag: "field", name: "TimeOut", description: "The reason for a state change is a time-out.",
                    xref: "core§11.20.7.4.3.4",
                    details: "This value shall indicate that the reason for a state change is a time-out condition as determined " +
                        "by the OTA Requestor."
                },

                {
                    tag: "field", name: "DelayByProvider",
                    description: "The reason for a state change is a request by the OTA Provider to wait.",
                    xref: "core§11.20.7.4.3.5",
                    details: "This value shall indicate that the reason for a state change is a request by the OTA Provider to " +
                        "await for a delay."
                }
            ]
        },

        {
            tag: "datatype", name: "ProviderLocation", xref: "core§11.20.7.4.4",
            details: "This structure encodes a fabric-scoped location of an OTA provider on a given fabric.",

            children: [
                {
                    tag: "field", name: "ProviderNodeId", xref: "core§11.20.7.4.4.1",
                    details: "This field shall contain the Node ID of the OTA Provider to contact within the Fabric identified by " +
                        "the FabricIndex."
                },

                {
                    tag: "field", name: "Endpoint", xref: "core§11.20.7.4.4.2",
                    details: "This field shall contain the endpoint number which has the OTA Provider device type and OTA Software " +
                        "Update Provider cluster server on the ProviderNodeID. This is provided to avoid having to do " +
                        "discovery of the location of that endpoint by walking over all endpoints and checking their " +
                        "Descriptor Cluster."
                }
            ]
        }
    ]
});

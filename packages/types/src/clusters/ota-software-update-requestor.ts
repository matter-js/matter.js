/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableFabricScopedAttribute, Attribute, OptionalCommand, TlvNoResponse, Event } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvNodeId } from "../datatype/NodeId.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvEnum, TlvUInt8, TlvUInt32, TlvUInt16, TlvUInt64, TlvInt64 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace OtaSoftwareUpdateRequestor {
    /**
     * This structure encodes a fabric-scoped location of an OTA provider on a given fabric.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.4
     */
    export const TlvProviderLocation = TlvObject({
        /**
         * This field shall contain the Node ID of the OTA Provider to contact within the Fabric identified by the
         * FabricIndex.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.4.1
         */
        providerNodeId: TlvField(1, TlvNodeId),

        /**
         * This field shall contain the endpoint number which has the OTA Provider device type and OTA Software Update
         * Provider cluster server on the ProviderNodeID. This is provided to avoid having to do discovery of the
         * location of that endpoint by walking over all endpoints and checking their Descriptor Cluster.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.4.2
         */
        endpoint: TlvField(2, TlvEndpointNumber),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * This structure encodes a fabric-scoped location of an OTA provider on a given fabric.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.4
     */
    export interface ProviderLocation extends TypeFromSchema<typeof TlvProviderLocation> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2
     */
    export enum UpdateState {
        /**
         * Current state is not yet determined.
         *
         * This value shall indicate that the current state is not yet determined. Nodes SHOULD attempt a better state
         * reporting.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.1
         */
        Unknown = 0,

        /**
         * Indicate a Node not yet in the process of software update.
         *
         * This value shall indicate a Node not yet in the process of software update, for example because it is
         * awaiting the moment when a query will be made.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.2
         */
        Idle = 1,

        /**
         * Indicate a Node in the process of querying an OTA Provider.
         *
         * This value shall indicate a Node in the process of querying an OTA Provider with QueryImage command,
         * including during the process of awaiting a response to that command.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.3
         */
        Querying = 2,

        /**
         * Indicate a Node waiting after a Busy response.
         *
         * This value shall indicate a Node waiting because it received a prior QueryImageResponse with a Status field
         * indicating Busy.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.4
         */
        DelayedOnQuery = 3,

        /**
         * Indicate a Node currently in the process of downloading a software update.
         *
         * This value shall indicate a Node currently in the process of downloading a software update.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.5
         */
        Downloading = 4,

        /**
         * Indicate a Node currently in the process of verifying and applying a software update.
         *
         * This value shall indicate a Node currently in the process of verifying and applying a software update.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.6
         */
        Applying = 5,

        /**
         * Indicate a Node waiting caused by AwaitNextAction response.
         *
         * This value shall indicate a Node waiting because it received a prior ApplyUpdateResponse with an Action field
         * set to AwaitNextAction.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.7
         */
        DelayedOnApply = 6,

        /**
         * Indicate a Node in the process of recovering to a previous version.
         *
         * This value shall indicate a Node in the process of recovering to a previous version from a new version that
         * was applied, but that could not remain in force, for reasons such as invalid data detected on boot, or
         * significant runtime issues such as reboot loops. Eventually, the next state seen SHOULD be Unknown or Idle.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.2.8
         */
        RollingBack = 7,

        /**
         * Indicate a Node is capable of user consent.
         */
        DelayedOnUserConsent = 8
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.1
     */
    export enum AnnouncementReason {
        /**
         * An OTA Provider is announcing its presence.
         *
         * An OTA Provider is announcing its presence, but there is no implication that an OTA Requestor would have a
         * new Software Image available if it queried immediately.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.1.1
         */
        SimpleAnnouncement = 0,

        /**
         * An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software Image MAY
         * be available.
         *
         * An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software Image may
         * be available. The details may only be obtained by executing a OTA Software Update Query procedure. A
         * receiving OTA Requestor SHOULD only query the indicated OTA Provider at the ProviderLocation at its next
         * upcoming OTA Provider query.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.1.2
         */
        UpdateAvailable = 1,

        /**
         * An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software Image MAY
         * be available, which contains an update that needs to be applied urgently.
         *
         * An OTA Provider is announcing, either to a single Node or to a group of Nodes, that a new Software Image may
         * be available, which contains an update that needs to be applied urgently. The details may only be obtained by
         * executing a OTA Software Update Query procedure. A receiving OTA Requestor SHOULD query the indicated OTA
         * Provider at the ProviderLocation after a random jitter delay between 1 and 600 seconds. This particular
         * reason SHOULD only be employed when an urgent update is available, such as an important security update, or
         * just after initial commissioning of a device, to assist OTA Requestors in more rapidly obtaining updated
         * software.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.1.3
         */
        UrgentUpdateAvailable = 2
    }

    /**
     * Input to the OtaSoftwareUpdateRequestor announceOtaProvider command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1
     */
    export const TlvAnnounceOtaProviderRequest = TlvObject({
        /**
         * This field shall contain the Node ID of a Node implementing the OTA Provider cluster server, on the accessing
         * fabric.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1.1
         */
        providerNodeId: TlvField(0, TlvNodeId),

        /**
         * This field shall contain the assigned Vendor ID of the Node invoking this command, as it would appear in that
         * Node’s Basic Information Cluster VendorID attribute.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1.2
         */
        vendorId: TlvField(1, TlvVendorId),

        /**
         * This field shall contain a value expressing the reason for the announcement.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1.3
         */
        announcementReason: TlvField(2, TlvEnum<AnnouncementReason>()),

        /**
         * This optional field, if present, shall consist of a top-level anonymous list; each list element shall have a
         * profile-specific tag encoded in fully-qualified form. Each list element shall contain a manufacturer-specific
         * payload, which the Node invoking this command wants to expose to the receiving Node. This payload may be used
         * for any purpose and SHOULD be as small as practical, especially if invoked to groups, in order to reduce
         * networking burden of these payloads.
         *
         * This field SHOULD only be included if the sending OTA Provider has knowledge that some recipient can make use
         * of it.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1.4
         */
        metadataForNode: TlvOptionalField(3, TlvByteString.bound({ maxLength: 512 })),

        /**
         * This field shall contain the endpoint number which has the OTA Provider device type and OTA Software Update
         * Provider cluster server on the ProviderNodeID. This is provided to avoid having to do discovery of the
         * location of that endpoint by walking over all endpoints and checking their Descriptor Cluster.
         *
         * ### When Generated
         *
         * An OTA Provider may invoke this command directly to an OTA Requestor, to announce its presence as an OTA
         * Provider on the Fabric.
         *
         * These announcements, if made, SHOULD be made at most once every 24 hours for any given target Node, to assist
         * OTA Requestors in discovering available OTA Provider resources, unless the AnnouncementReason is
         * UrgentUpdateAvailable, in which case this command may be more frequent.
         *
         * Any invocation shall be made with a delay of at least 1 second between invocations from a given OTA Provider,
         * to reduce burden on the networking infrastructure and affect a form of serialized jitter. It is recommended
         * to offset the first announcement of a round (i.e. new set of announcements after a previous complete set) by
         * a random delay time with a distribution span of >= 60 seconds to jitter announcement schedules over time.
         *
         * ### Effect on Receipt
         *
         * On receipt of this command, an OTA Requestor SHOULD consider the new ProviderNodeID and AnnouncementReason to
         * possibly query for new software sooner than it would have with its default behavior.
         *
         * The OTA Requestor SHOULD NOT update entries in the DefaultOTAProviders list based on announcements.
         *
         * The receiving Node may ignore the content of the announcement if it is unable or unwilling to further query
         * OTA Providers temporarily, or if its provider list is full. If the announcement is ignored, the response
         * SHOULD be SUCCESS.
         *
         * Depending on the value of the AnnouncementReason field, the OTA Requestor may have to query the OTA Provider.
         * See Section 11.20.7.6.1.3, “AnnouncementReason Field” for the different values and their meaning.
         *
         * If present, the MetadataForNode field’s may be used by a receiving OTA Requestor in any way it deems
         * satisfactory. The MetadataForNode field SHOULD be empty under most normal operational circumstance, but can
         * be useful in environments such as field trials or integration test environments to hint at additional
         * capabilities which OTA Requestors may use in a particular Vendor-specific context.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1.5
         */
        endpoint: TlvField(4, TlvEndpointNumber),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * Input to the OtaSoftwareUpdateRequestor announceOtaProvider command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1
     */
    export interface AnnounceOtaProviderRequest extends TypeFromSchema<typeof TlvAnnounceOtaProviderRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.3
     */
    export enum ChangeReason {
        /**
         * The reason for a state change is unknown.
         *
         * This value shall indicate that the reason for a state change is unknown.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.3.1
         */
        Unknown = 0,

        /**
         * The reason for a state change is the success of a prior operation.
         *
         * This value shall indicate that the reason for a state change is the success of a prior operation.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.3.2
         */
        Success = 1,

        /**
         * The reason for a state change is the failure of a prior operation.
         *
         * This value shall indicate that the reason for a state change is the failure of a prior operation.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.3.3
         */
        Failure = 2,

        /**
         * The reason for a state change is a time-out.
         *
         * This value shall indicate that the reason for a state change is a time-out condition as determined by the OTA
         * Requestor.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.3.4
         */
        TimeOut = 3,

        /**
         * The reason for a state change is a request by the OTA Provider to wait.
         *
         * This value shall indicate that the reason for a state change is a request by the OTA Provider to await for a
         * delay.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.4.3.5
         */
        DelayByProvider = 4
    }

    /**
     * Body of the OtaSoftwareUpdateRequestor stateTransition event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1
     */
    export const TlvStateTransitionEvent = TlvObject({
        /**
         * This field shall be set to the state that preceded the transition causing this event to be generated, if such
         * a state existed. If no previous state exists, the value shall be Unknown.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1.1
         */
        previousState: TlvField(0, TlvEnum<UpdateState>()),

        /**
         * This field shall be set to the state now in effect through the transition causing this event to be generated.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1.2
         */
        newState: TlvField(1, TlvEnum<UpdateState>()),

        /**
         * This field shall be set to the reason why this event was generated.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1.3
         */
        reason: TlvField(2, TlvEnum<ChangeReason>()),

        /**
         * This field shall be set to the target SoftwareVersion which is the subject of the operation, whenever the
         * NewState is Downloading, Applying or RollingBack. Otherwise TargetSoftwareVersion shall be null.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1.4
         */
        targetSoftwareVersion: TlvField(3, TlvNullable(TlvUInt32))
    });

    /**
     * Body of the OtaSoftwareUpdateRequestor stateTransition event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1
     */
    export interface StateTransitionEvent extends TypeFromSchema<typeof TlvStateTransitionEvent> {}

    /**
     * Body of the OtaSoftwareUpdateRequestor versionApplied event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.2
     */
    export const TlvVersionAppliedEvent = TlvObject({
        /**
         * This field shall be set to the same value as the one available in the Software Version attribute of the Basic
         * Information Cluster for the newly executing version.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.2.1
         */
        softwareVersion: TlvField(0, TlvUInt32),

        /**
         * This field shall be set to the ProductID applying to the executing version, as reflected by the Basic
         * Information Cluster. This can be used to detect a product updating its definition due to a large-scale
         * functional update that may impact aspects of the product reflected in the DeviceModel schema of the
         * Distributed Compliance Ledger.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.2.2
         */
        productId: TlvField(1, TlvUInt16)
    });

    /**
     * Body of the OtaSoftwareUpdateRequestor versionApplied event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.2
     */
    export interface VersionAppliedEvent extends TypeFromSchema<typeof TlvVersionAppliedEvent> {}

    /**
     * Body of the OtaSoftwareUpdateRequestor downloadError event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3
     */
    export const TlvDownloadErrorEvent = TlvObject({
        /**
         * This field shall be set to the value of the SoftwareVersion being downloaded, matching the SoftwareVersion
         * field of the QueryImageResponse that caused the failing download to take place.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3.1
         */
        softwareVersion: TlvField(0, TlvUInt32),

        /**
         * This field shall be set to the number of bytes that have been downloaded during the failing transfer that
         * caused this event to be generated.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3.2
         */
        bytesDownloaded: TlvField(1, TlvUInt64),

        /**
         * This field shall be set to the nearest integer percent value reflecting how far within the transfer the
         * failure occurred during the failing transfer that caused this event to be generated, unless the total length
         * of the transfer is unknown, in which case it shall be null.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3.3
         */
        progressPercent: TlvField(2, TlvNullable(TlvUInt8.bound({ max: 100 }))),

        /**
         * This field SHOULD be set to some internal product-specific error code, closest in temporal/functional
         * proximity to the failure that caused this event to be generated. Otherwise, it shall be null. This event
         * field may be used for debugging purposes and no uniform definition exists related to its meaning.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3.4
         */
        platformCode: TlvField(3, TlvNullable(TlvInt64))
    });

    /**
     * Body of the OtaSoftwareUpdateRequestor downloadError event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3
     */
    export interface DownloadErrorEvent extends TypeFromSchema<typeof TlvDownloadErrorEvent> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x2a,
        name: "OtaSoftwareUpdateRequestor",
        revision: 1,

        attributes: {
            /**
             * This field is a list of ProviderLocation whose entries shall be set by Administrators, either during
             * Commissioning or at a later time, to set the ProviderLocation for the default OTA Provider Node to use
             * for software updates on a given Fabric.
             *
             * There shall NOT be more than one entry per Fabric. On a list update that would introduce more than one
             * entry per fabric, the write shall fail with CONSTRAINT_ERROR status code.
             *
             * Provider Locations obtained using the AnnounceOTAProvider command shall NOT overwrite values set in the
             * DefaultOTAProviders attribute.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.5.1
             */
            defaultOtaProviders: WritableFabricScopedAttribute(
                0x0,
                TlvArray(TlvProviderLocation),
                { persistent: true, default: [], writeAcl: AccessLevel.Administer }
            ),

            /**
             * This field shall be set to True if the OTA Requestor is currently able to be updated. Otherwise, it shall
             * be set to False in case of any condition preventing update being possible, such as insufficient capacity
             * of an internal battery. This field is merely informational for diagnostics purposes and shall NOT affect
             * the responses provided by an OTA Provider to an OTA Requestor.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.5.2
             */
            updatePossible: Attribute(0x1, TlvBoolean, { default: true }),

            /**
             * This field shall reflect the current state of the OTA Requestor with regards to obtaining software
             * updates. See Section 11.20.7.4.2, “UpdateStateEnum Type” for possible values.
             *
             * This field SHOULD be updated in a timely manner whenever OTA Requestor internal state updates.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.5.3
             */
            updateState: Attribute(0x2, TlvEnum<UpdateState>(), { default: UpdateState.Unknown }),

            /**
             * This field shall reflect the percentage value of progress, relative to the current UpdateState, if
             * applicable to the state.
             *
             * The value of this field shall be null if a progress indication does not apply to the current state.
             *
             * A value of 0 shall indicate that the beginning has occurred. A value of 100 shall indicate completion.
             *
             * This field may be updated infrequently. Some care SHOULD be taken by Nodes to avoid over-reporting
             * progress when this attribute is part of a subscription.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.5.4
             */
            updateStateProgress: Attribute(0x3, TlvNullable(TlvUInt8.bound({ max: 100 })), { default: null })
        },

        commands: {
            /**
             * This command may be invoked by Administrators to announce the presence of a particular OTA Provider.
             *
             * This command shall be scoped to the accessing fabric.
             *
             * If the accessing fabric index is 0, this command shall fail with an UNSUPPORTED_ACCESS status code.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.6.1
             */
            announceOtaProvider: OptionalCommand(
                0x0,
                TlvAnnounceOtaProviderRequest,
                0x0,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        },

        events: {
            /**
             * This event shall be generated when a change of the UpdateState attribute occurs due to an OTA Requestor
             * moving through the states necessary to query for updates.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.1
             */
            stateTransition: Event(0x0, Priority.Info, TlvStateTransitionEvent),

            /**
             * This event shall be generated whenever a new version starts executing after being applied due to a
             * software update. This event SHOULD be generated even if a software update was done using means outside of
             * this cluster.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.2
             */
            versionApplied: Event(0x1, Priority.Critical, TlvVersionAppliedEvent),

            /**
             * This event shall be generated whenever an error occurs during OTA Requestor download operation.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.7.7.3
             */
            downloadError: Event(0x2, Priority.Info, TlvDownloadErrorEvent)
        }
    });

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type OtaSoftwareUpdateRequestorCluster = OtaSoftwareUpdateRequestor.Cluster;
export const OtaSoftwareUpdateRequestorCluster = OtaSoftwareUpdateRequestor.Cluster;
ClusterRegistry.register(OtaSoftwareUpdateRequestor.Complete);

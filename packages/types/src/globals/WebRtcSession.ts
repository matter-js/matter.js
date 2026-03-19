/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNodeId } from "../datatype/NodeId.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { StreamUsage } from "./StreamUsage.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * This type stores all the relevant values associated with an active WebRTC session.
 *
 * This values of PeerNodeID and FabricIndex are used to validate the source of, or select the correct remote target,
 * for WebRTC session related commands. The implicit field FabricIndex exists since this structure is defined as Fabric
 * Scoped.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5
 */
export const TlvWebRtcSession = TlvObject({
    /**
     * This field contains the WebRTC Session ID for this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.1
     */
    id: TlvField(0, TlvUInt16),

    /**
     * This field contains the NodeId for the peer entity involved in this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.2
     */
    peerNodeId: TlvField(1, TlvNodeId),

    /**
     * This field contains the EndpointId for the peer entity involved in this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.3
     */
    peerEndpointId: TlvField(2, TlvEndpointNumber),

    /**
     * This field contains the StreamUsageEnum of this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.4
     */
    streamUsage: TlvField(3, TlvEnum<StreamUsage>()),

    /**
     * This field contains the VideoStreamIDType that is used by this session. A null value means no video stream is
     * currently associated with this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.5
     */
    videoStreamId: TlvField(4, TlvNullable(TlvUInt16)),

    /**
     * This field contains the AudioStreamIDType that is used by this session. A null value means no audio stream is
     * currently associated with this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.6
     */
    audioStreamId: TlvField(5, TlvNullable(TlvUInt16)),

    /**
     * This field indicates if metadata is active in this session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5.7
     */
    metadataEnabled: TlvField(6, TlvBoolean),

    fabricIndex: TlvField(254, TlvFabricIndex)
});

/**
 * This type stores all the relevant values associated with an active WebRTC session.
 *
 * This values of PeerNodeID and FabricIndex are used to validate the source of, or select the correct remote target,
 * for WebRTC session related commands. The implicit field FabricIndex exists since this structure is defined as Fabric
 * Scoped.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.5
 */
export interface WebRtcSession extends TypeFromSchema<typeof TlvWebRtcSession> {}

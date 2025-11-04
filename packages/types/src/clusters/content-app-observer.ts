/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command } from "../cluster/Cluster.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ContentAppObserver {
    /**
     * Input to the ContentAppObserver contentAppMessage command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1
     */
    export const TlvContentAppMessageRequest = TlvObject({
        /**
         * This field shall indicate content app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1.1
         */
        data: TlvField(0, TlvString.bound({ maxLength: 500 })),

        /**
         * This optional field shall indicate a content app-specific hint to the encoding of the data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1.2
         */
        encodingHint: TlvOptionalField(1, TlvString.bound({ maxLength: 100 }))
    });

    /**
     * Input to the ContentAppObserver contentAppMessage command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1
     */
    export interface ContentAppMessageRequest extends TypeFromSchema<typeof TlvContentAppMessageRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.4.1
     */
    export enum Status {
        /**
         * Command succeeded
         */
        Success = 0,

        /**
         * Data field in command was not understood by the Observer
         */
        UnexpectedData = 1
    }

    /**
     * Thrown for cluster status code {@link Status.UnexpectedData}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.4.1
     */
    export class UnexpectedDataError extends StatusResponseError {
        constructor(
            message = "Data field in command was not understood by the Observer",
            code = GlobalStatus.Failure,
            clusterCode = Status.UnexpectedData
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * This command shall be generated in response to ContentAppMessage command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2
     */
    export const TlvContentAppMessageResponse = TlvObject({
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This optional field shall indicate content app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2.2
         */
        data: TlvOptionalField(1, TlvString.bound({ maxLength: 500 })),

        /**
         * This optional field shall indicate a content app-specific hint to the encoding of the data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2.3
         */
        encodingHint: TlvOptionalField(2, TlvString.bound({ maxLength: 100 }))
    });

    /**
     * This command shall be generated in response to ContentAppMessage command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2
     */
    export interface ContentAppMessageResponse extends TypeFromSchema<typeof TlvContentAppMessageResponse> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x510,
        name: "ContentAppObserver",
        revision: 1,

        commands: {
            /**
             * Upon receipt, the data field may be parsed and interpreted. Message encoding is specific to the Content
             * App. A Content App may when possible read attributes from the Basic Information Cluster on the Observer
             * and use this to determine the Message encoding.
             *
             * This command returns a ContentAppMessage Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1
             */
            contentAppMessage: Command(0x0, TlvContentAppMessageRequest, 0x1, TlvContentAppMessageResponse)
        }
    });

    /**
     * This cluster provides an interface for sending targeted commands to an Observer of a Content App on a Video
     * Player device such as a Streaming Media Player, Smart TV or Smart Screen.
     *
     * The cluster server for Content App Observer is implemented by an endpoint that communicates with a Content App,
     * such as a Casting Video Client.
     *
     * The cluster client for Content App Observer is implemented by a Content App endpoint.
     *
     * A Content App is informed of the NodeId of an Observer when a binding is set on the Content App. For a Content
     * App Platform, the binding is set by the platform when a CastingVideoClient is granted access to the Content App,
     * and the CastingVideoClient supports the Content App Observer cluster. The Content App can then send the
     * ContentAppMessage to the Observer (server cluster), and the Observer responds with a ContentAppMessageResponse.
     *
     * The Data and EncodingHint fields of the ContentAppMessage and ContentAppMessageResponse contain content
     * app-specific values, the format and interpretation of which is defined by the Content App vendor, analogous to
     * the custom message features offered by other popular casting protocols. Standardized cluster and commands are
     * used here rather than manufacturer-specific cluster and commands because of the role that the Content App
     * Platform plays in creating the ACLs and Bindings on both sides of the communication between the Content App
     * Observer endpoint and the Content App endpoint.
     *
     * By using standard cluster and commands:
     *
     *   1. The Content App Platform is able to easily determine that a binding is needed on the Content App endpoint
     *      because it can recognize the Content App Observer cluster implemented by a client node.
     *
     *   2. The Content App Platform is able to easily identify commands that are allowed to be sent by the Content App
     *      to a client node because those commands use the Content App Observer cluster.
     *
     *   3. The Content App is able to easily determine that a node supports the Content App Observer cluster because it
     *      has received a binding which specifies the Content App Observer cluster.
     *
     *   4. The Casting Video Client is able to support a single cluster for receiving commands from any Content App and
     *      does not need to explicitly list every Content App it understands.
     *
     * A Content App Observer SHOULD ignore the Data and EncodingHint field values in commands from a Content App it
     * does not recognize. A Content App SHOULD ignore the Data field values in responses when the EncodingHint value is
     * blank or not recognized.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type ContentAppObserverCluster = ContentAppObserver.Cluster;
export const ContentAppObserverCluster = ContentAppObserver.Cluster;
ClusterRegistry.register(ContentAppObserver.Complete);

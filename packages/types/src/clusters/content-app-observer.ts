/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ContentAppObserver as ContentAppObserverModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ContentAppObserver cluster.
 */
export namespace ContentAppObserver {
    /**
     * {@link ContentAppObserver} always supports these elements.
     */
    export namespace Base {
        export interface Commands {
            /**
             * Upon receipt, the data field may be parsed and interpreted. Message encoding is specific to the Content
             * App. A Content App may when possible read attributes from the Basic Information Cluster on the Observer
             * and use this to determine the Message encoding.
             *
             * This command returns a ContentAppMessage Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1
             */
            contentAppMessage(request: ContentAppMessageRequest): MaybePromise<ContentAppMessageResponse>;
        }
    }

    export interface Commands extends Base.Commands {}
    export type Components = [{ flags: {}, commands: Base.Commands }];

    /**
     * Upon receipt, the data field may be parsed and interpreted. Message encoding is specific to the Content App. A
     * Content App may when possible read attributes from the Basic Information Cluster on the Observer and use this to
     * determine the Message encoding.
     *
     * This command returns a ContentAppMessage Response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1
     */
    export interface ContentAppMessageRequest {
        /**
         * This field shall indicate content app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1.1
         */
        data: string;

        /**
         * This optional field shall indicate a content app-specific hint to the encoding of the data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.1.2
         */
        encodingHint?: string;
    }

    /**
     * This command shall be generated in response to ContentAppMessage command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2
     */
    export interface ContentAppMessageResponse {
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2.1
         */
        status: Status;

        /**
         * This optional field shall indicate content app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2.2
         */
        data?: string;

        /**
         * This optional field shall indicate a content app-specific hint to the encoding of the data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.12.5.2.3
         */
        encodingHint?: string;
    }

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

    export const id = ClusterId(0x510);
    export const name = "ContentAppObserver" as const;
    export const revision = 1;
    export const schema = ContentAppObserverModel;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export type Cluster = typeof ContentAppObserver;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ContentAppObserver` instead of
     * `ContentAppObserver.Complete`)
     */
    export type Complete = typeof ContentAppObserver;

    export declare const Complete: Complete;
    export declare const Typing: ContentAppObserver;
}

ClusterNamespace.define(ContentAppObserver);
export type ContentAppObserverCluster = ContentAppObserver.Cluster;
export const ContentAppObserverCluster = ContentAppObserver.Cluster;
export interface ContentAppObserver extends ClusterTyping { Commands: ContentAppObserver.Commands; Components: ContentAppObserver.Components }

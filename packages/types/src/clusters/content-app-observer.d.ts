/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status as GlobalStatus } from "../globals/Status.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ContentAppObserver as ContentAppObserverModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ContentAppObserver cluster.
 */
export declare namespace ContentAppObserver {
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
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    export const id: ClusterId;
    export const name: "ContentAppObserver";
    export const revision: 1;
    export const schema: typeof ContentAppObserverModel;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export const Cluster: typeof ContentAppObserver;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ContentAppObserver` instead of
     * `ContentAppObserver.Complete`)
     */
    export const Complete: typeof ContentAppObserver;

    export const Typing: ContentAppObserver;
}

export declare const ContentAppObserverCluster: typeof ContentAppObserver;
export interface ContentAppObserver extends ClusterTyping { Commands: ContentAppObserver.Commands; Components: ContentAppObserver.Components }

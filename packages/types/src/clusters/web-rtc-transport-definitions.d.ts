/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the WebRtcTransportDefinitions cluster.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 11.4
 */
export declare namespace WebRtcTransportDefinitions {
    /**
     * Textual cluster identifier.
     */
    export const name: "WebRtcTransportDefinitions";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the WebRtcTransportDefinitions cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * @deprecated Use {@link WebRtcTransportDefinitions}.
     */
    export const Complete: typeof WebRtcTransportDefinitions;

    export const Typing: WebRtcTransportDefinitions;
};

export interface WebRtcTransportDefinitions extends ClusterTyping {}

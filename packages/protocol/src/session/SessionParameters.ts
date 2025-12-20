/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedTransportsBitmap, SupportedTransportsSchema } from "#common/SupportedTransportsBitmap.js";
import { Specification } from "#model";
import { SessionIntervals } from "./SessionIntervals.js";

export interface SessionParameters extends SessionIntervals {
    /** Version of Data Model for the Session parameters side where it appears. */
    dataModelRevision: number;

    /** Version of Interaction Model for the Session parameters side where it appears. */
    interactionModelRevision: number;

    /** Version of Specification for the Session parameters side where it appears. */
    specificationVersion: number;

    /** The maximum number of elements in the InvokeRequests list that the Node is able to process. */
    maxPathsPerInvoke: number;

    /** A bitmap of the supported transport protocols in addition to MRP. */
    supportedTransports: SessionParameters.SupportedTransports;

    /**
     * Maximum size of the message carried over TCP, excluding the framing message length field, that the node is
     * capable of receiving from its peer.
     */
    maxTcpMessageSize?: number;
}

export function SessionParameters(config?: SessionParameters.Config): SessionParameters {
    // Decode supported transports if supplied as a number
    let supportedTransports = config?.supportedTransports;
    if (typeof supportedTransports === "number") {
        supportedTransports = SupportedTransportsSchema.decode(supportedTransports);
    }
    supportedTransports ??= SessionParameters.fallbacks.supportedTransports;

    // The MAX_TCP_MESSAGE_SIZE field SHALL only be present if the SUPPORTED_TRANSPORTS field indicates that TCP is
    // supported
    let maxTcpMessageSize: number | undefined;
    if (supportedTransports.tcpClient || supportedTransports.tcpServer) {
        maxTcpMessageSize = config?.maxTcpMessageSize;
        maxTcpMessageSize ??= SessionParameters.fallbacks.maxTcpMessageSize;
    }

    // Ensure that undefined values in config are not overriding the fallbacks
    const sanitizedConfig: Record<string, unknown> = { ...config };
    for (const key of Object.keys(sanitizedConfig)) {
        if ((sanitizedConfig as any)[key] === undefined) {
            delete sanitizedConfig[key];
        }
    }

    return { ...SessionParameters.fallbacks, ...sanitizedConfig, supportedTransports, maxTcpMessageSize };
}

export namespace SessionParameters {
    export interface SupportedTransports extends Partial<SupportedTransportsBitmap> {}

    export interface Config extends Partial<Omit<SessionParameters, "supportedTransports">> {
        supportedTransports?: number | SupportedTransports;
    }

    /**
     * Session parameters we use for peers if not supplied by the peer.
     */
    export const fallbacks = {
        ...SessionIntervals.defaults,

        /**
         * Fallback value for Data Model Revision when not provided in Session parameters. We use Matter 1.2 as
         * assumption.
         */
        dataModelRevision: 17,

        /**
         * Fallback value for Interaction Model Revision when not provided in Session parameters. We use Matter 1.2 as
         * assumption.
         */
        interactionModelRevision: 11,

        /**
         * Fallback value for Specification Version when not provided in Session parameters. We use 0 as assumption which is
         * "before 1.3".
         */
        specificationVersion: 0,

        /**
         * Fallback value for the maximum number of paths that can be included in a single invoke message when not provided in
         * Session parameters.
         */
        maxPathsPerInvoke: 1,

        /**
         * No TCP support by default.
         */
        supportedTransports: {},

        maxTcpMessageSize: 64000,
    };

    /**
     * Session parameters we use for ourselves.
     */
    export const defaults = {
        ...fallbacks,

        dataModelRevision: Specification.DATA_MODEL_REVISION,
        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        specificationVersion: Specification.SPECIFICATION_VERSION,
    };
}

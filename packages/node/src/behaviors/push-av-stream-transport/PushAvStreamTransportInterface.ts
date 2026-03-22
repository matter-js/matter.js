/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { PushAvStreamTransport } from "@matter/types/clusters/push-av-stream-transport";

export namespace PushAvStreamTransportInterface {
    export interface Base {
        /**
         * This command shall allocate a transport and return a PushTransportConnectionID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.1
         */
        allocatePushTransport(request: PushAvStreamTransport.AllocatePushTransportRequest): MaybePromise<PushAvStreamTransport.AllocatePushTransportResponse>;

        /**
         * This command shall be generated to request the Node deallocates the specified transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.3
         */
        deallocatePushTransport(request: PushAvStreamTransport.DeallocatePushTransportRequest): MaybePromise;

        /**
         * This command is used to request the Node modifies the configuration of the specified push transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.4
         */
        modifyPushTransport(request: PushAvStreamTransport.ModifyPushTransportRequest): MaybePromise;

        /**
         * This command shall be generated to request the Node modifies the Transport Status of a specified transport or
         * all transports.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.5
         */
        setTransportStatus(request: PushAvStreamTransport.SetTransportStatusRequest): MaybePromise;

        /**
         * This command shall be generated to request the Node to manually start the specified push transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6
         */
        manuallyTriggerTransport(request: PushAvStreamTransport.ManuallyTriggerTransportRequest): MaybePromise;

        /**
         * This command shall return the Transport Configuration for the specified push transport or all allocated
         * transports for the fabric if null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.7
         */
        findTransport(request: PushAvStreamTransport.FindTransportRequest): MaybePromise<PushAvStreamTransport.FindTransportResponse>;
    }
}

export type PushAvStreamTransportInterface = { components: [{ flags: {}, methods: PushAvStreamTransportInterface.Base }] };

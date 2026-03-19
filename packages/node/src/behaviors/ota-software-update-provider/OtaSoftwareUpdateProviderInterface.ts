/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";

export namespace OtaSoftwareUpdateProviderInterface {
    export interface Base {
        /**
         * Upon receipt, this command shall trigger an attempt to find an updated Software Image by the OTA Provider to
         * match the OTA Requestor’s constraints provided in the payload fields.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.20.6.5.1
         */
        queryImage(request: OtaSoftwareUpdateProvider.QueryImageRequest): MaybePromise<OtaSoftwareUpdateProvider.QueryImageResponse>;

        /**
         * This command requests the specified version be installed on the device.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.20.6.5.3
         */
        applyUpdateRequest(request: OtaSoftwareUpdateProvider.ApplyUpdateRequest): MaybePromise<OtaSoftwareUpdateProvider.ApplyUpdateResponse>;

        /**
         * This command tells the Provider that the specified update has been applied.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.20.6.5.5
         */
        notifyUpdateApplied(request: OtaSoftwareUpdateProvider.NotifyUpdateAppliedRequest): MaybePromise;
    }
}

export type OtaSoftwareUpdateProviderInterface = {
    components: [{ flags: {}, methods: OtaSoftwareUpdateProviderInterface.Base }]
};

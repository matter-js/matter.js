/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";

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
         * @see {@link MatterSpecification.v142.Core} § 11.20.6.5.3
         */
        applyUpdateRequest(request: OtaSoftwareUpdateProvider.ApplyUpdateRequest): MaybePromise<OtaSoftwareUpdateProvider.ApplyUpdateResponse>;

        /**
         * @see {@link MatterSpecification.v142.Core} § 11.20.6.5.5
         */
        notifyUpdateApplied(request: OtaSoftwareUpdateProvider.NotifyUpdateAppliedRequest): MaybePromise;
    }
}

export type OtaSoftwareUpdateProviderInterface = {
    components: [{ flags: {}, methods: OtaSoftwareUpdateProviderInterface.Base }]
};

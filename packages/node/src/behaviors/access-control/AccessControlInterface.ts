/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { AccessControl } from "#clusters/access-control";

export namespace AccessControlInterface {
    export interface ManagedDevice {
        /**
         * This command signals to the service associated with the device vendor that the fabric administrator would
         * like a review of the current restrictions on the accessing fabric. This command includes an optional list of
         * ARL entries that the fabric administrator would like removed.
         *
         * In response, a ReviewFabricRestrictionsResponse is sent which contains a token that can be used to correlate
         * a review request with a FabricRestrictionReviewUpdate event.
         *
         * Within 1 hour of the ReviewFabricRestrictionsResponse, the FabricRestrictionReviewUpdate event shall be
         * generated, in order to indicate completion of the review and any additional steps required by the user for
         * the review.
         *
         * A review may include obtaining consent from the user, which can take time. For example, the user may need to
         * respond to an email or a push notification.
         *
         * The ARL attribute may change at any time due to actions taken by the user, or the service associated with the
         * device vendor.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.10.8.1
         */
        reviewFabricRestrictions(request: AccessControl.ReviewFabricRestrictionsRequest): MaybePromise<AccessControl.ReviewFabricRestrictionsResponse>;
    }
}

export type AccessControlInterface = {
    components: [{ flags: { managedDevice: true }, methods: AccessControlInterface.ManagedDevice }]
};

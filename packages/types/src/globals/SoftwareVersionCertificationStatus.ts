/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * The values 0 through 2 shall correspond to the values 0 through 2 used in certification_type in the Certification
 * Declaration.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.23.10.5
 */
export enum SoftwareVersionCertificationStatus {
    /**
     * used for development and test purposes (These will typically not be placed in DCL)
     */
    DevTest = 0,

    /**
     * used for a SoftwareVersion to allow production and distribution to occur in parallel with certification (with
     * potential software fixes yielding a higher SoftwareVersion which gets certification)
     */
    Provisional = 1,

    /**
     * used for a SoftwareVersion which has been certified
     */
    Certified = 2,

    /**
     * used for a SoftwareVersion which has been revoked
     */
    Revoked = 3
}

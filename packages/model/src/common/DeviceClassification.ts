/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Device type classification.  This is the Matter "device type classification".
 *
 * @see {@link MatterSpecification.v13.Core} § 7.15.3
 */
export enum DeviceClassification {
    /**
     * Officially a {@link Utility}.  Differentiating because there is only one base device type, which is its own
     * thing.
     */
    Base = "base",

    /**
     * @see {@link MatterSpecification.v13.Core} § 7.15.3.1
     */
    Utility = "utility",

    /**
     * @see {@link MatterSpecification.v13.Core} § 7.15.3.2
     */
    Application = "application",

    /**
     * A subset of type {@link Application}.
     *
     * @see {@link MatterSpecification.v13.Core} § 7.15.3.3
     */
    Simple = "simple",

    /**
     * A subset of type {@link Application}.
     *
     * @see {@link MatterSpecification.v13.Core} § 7.15.3.4
     */
    Dynamic = "dynamic",

    /**
     * A subset of type {@link Utility}.  Not officially a device type but described in the same section.
     *
     * @see {@link MatterSpecification.v13.Core} § 7.15.3.5
     */
    Node = "node",
}

export namespace DeviceClassification {
    export function isUtility(classification: DeviceClassification | undefined) {
        switch (classification) {
            case DeviceClassification.Node:
            case DeviceClassification.Utility:
                return true;

            default:
                return false;
        }
    }

    export function isApplication(classification: DeviceClassification | undefined) {
        return !isUtility(classification);
    }
}

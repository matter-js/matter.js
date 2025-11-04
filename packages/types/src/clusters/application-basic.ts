/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { OptionalFixedAttribute, FixedAttribute, Attribute } from "../cluster/Cluster.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { TlvUInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { AccessLevel } from "#model";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ApplicationBasic {
    /**
     * This indicates a global identifier for an Application given a catalog.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.2
     */
    export const TlvApplication = TlvObject({
        /**
         * This field shall indicate the Connectivity Standards Alliance issued vendor ID for the catalog. The DIAL
         * registry shall use value 0x0000.
         *
         * It is assumed that Content App Platform providers (see Video Player Architecture section in [MatterDevLib])
         * will have their own catalog vendor ID (set to their own Vendor ID) and will assign an ApplicationID to each
         * Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.2.1
         */
        catalogVendorId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the application identifier, expressed as a string, such as "123456-5433",
         * "PruneVideo" or "Company X". This field shall be unique within a catalog.
         *
         * For the DIAL registry catalog, this value shall be the DIAL prefix.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.2.2
         */
        applicationId: TlvField(1, TlvString)
    });

    /**
     * This indicates a global identifier for an Application given a catalog.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.2
     */
    export interface Application extends TypeFromSchema<typeof TlvApplication> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.1
     */
    export enum ApplicationStatus {
        /**
         * Application is not running.
         */
        Stopped = 0,

        /**
         * Application is running, is visible to the user, and is the active target for input.
         */
        ActiveVisibleFocus = 1,

        /**
         * Application is running but not visible to the user.
         */
        ActiveHidden = 2,

        /**
         * Application is running and visible, but is not the active target for input.
         */
        ActiveVisibleNotFocus = 3
    }

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x50d,
        name: "ApplicationBasic",
        revision: 1,

        attributes: {
            /**
             * This attribute shall specify a human readable (displayable) name of the vendor for the Content App.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.1
             */
            vendorName: OptionalFixedAttribute(0x0, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute, if present, shall specify the Connectivity Standards Alliance assigned Vendor ID for the
             * Content App.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.2
             */
            vendorId: OptionalFixedAttribute(0x1, TlvVendorId),

            /**
             * This attribute shall specify a human readable (displayable) name of the Content App assigned by the
             * vendor. For example, "NPR On Demand". The maximum length of the ApplicationName attribute is 256 bytes of
             * UTF-8 characters.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.3
             */
            applicationName: FixedAttribute(0x2, TlvString),

            /**
             * This attribute, if present, shall specify a numeric ID assigned by the vendor to identify a specific
             * Content App made by them. If the Content App is certified by the Connectivity Standards Alliance, then
             * this would be the Product ID as specified by the vendor for the certification.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.4
             */
            productId: OptionalFixedAttribute(0x3, TlvUInt16),

            /**
             * This attribute shall specify a Content App which consists of an Application ID using a specified catalog.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.5
             */
            application: FixedAttribute(0x4, TlvApplication),

            /**
             * This attribute shall specify the current running status of the application.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.6
             */
            status: Attribute(0x5, TlvEnum<ApplicationStatus>()),

            /**
             * This attribute shall specify a human readable (displayable) version of the Content App assigned by the
             * vendor. The maximum length of the ApplicationVersion attribute is 32 bytes of UTF-8 characters.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.7
             */
            applicationVersion: FixedAttribute(0x6, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute is a list of vendor IDs. Each entry is a vendor-id.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.8
             */
            allowedVendorList: FixedAttribute(
                0x7,
                TlvArray(TlvVendorId),
                { default: [], readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * This cluster provides information about a Content App running on a Video Player device which is represented as an
     * endpoint (see Device Type Library document).
     *
     * The cluster server for this cluster should be supported on each endpoint that represents a Content App on a Video
     * Player device. This cluster provides identification information about the Content App such as vendor and product.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type ApplicationBasicCluster = ApplicationBasic.Cluster;
export const ApplicationBasicCluster = ApplicationBasic.Cluster;
ClusterRegistry.register(ApplicationBasic.Complete);

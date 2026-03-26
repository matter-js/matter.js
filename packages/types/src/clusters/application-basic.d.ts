/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { VendorId } from "../datatype/VendorId.js";

/**
 * Definitions for the ApplicationBasic cluster.
 *
 * This cluster provides information about a Content App running on a Video Player device which is represented as an
 * endpoint (see Device Type Library document).
 *
 * The cluster server for this cluster should be supported on each endpoint that represents a Content App on a Video
 * Player device. This cluster provides identification information about the Content App such as vendor and product.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 6.3
 */
export declare namespace ApplicationBasic {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x050d;

    /**
     * Textual cluster identifier.
     */
    export const name: "ApplicationBasic";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ApplicationBasic cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ApplicationBasic} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall specify a human readable (displayable) name of the Content App assigned by the vendor.
         * For example, "NPR On Demand". The maximum length of the ApplicationName attribute is 256 bytes of UTF-8
         * characters.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.3
         */
        applicationName: string;

        /**
         * This attribute shall specify a Content App which consists of an Application ID using a specified catalog.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.5
         */
        application: Application;

        /**
         * This attribute shall specify the current running status of the application.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.6
         */
        status: ApplicationStatus;

        /**
         * This attribute shall specify a human readable (displayable) version of the Content App assigned by the
         * vendor. The maximum length of the ApplicationVersion attribute is 32 bytes of UTF-8 characters.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.7
         */
        applicationVersion: string;

        /**
         * This attribute is a list of vendor IDs. Each entry is a vendor-id.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.8
         */
        allowedVendorList: VendorId[];

        /**
         * This attribute shall specify a human readable (displayable) name of the vendor for the Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.1
         */
        vendorName?: string;

        /**
         * This attribute, if present, shall specify the Connectivity Standards Alliance assigned Vendor ID for the
         * Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.2
         */
        vendorId?: VendorId;

        /**
         * This attribute, if present, shall specify a numeric ID assigned by the vendor to identify a specific Content
         * App made by them. If the Content App is certified by the Connectivity Standards Alliance, then this would be
         * the Product ID as specified by the vendor for the certification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.4
         */
        productId?: number;
    }

    /**
     * Attributes that may appear in {@link ApplicationBasic}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Attributes {
        /**
         * This attribute shall specify a human readable (displayable) name of the Content App assigned by the vendor.
         * For example, "NPR On Demand". The maximum length of the ApplicationName attribute is 256 bytes of UTF-8
         * characters.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.3
         */
        applicationName: string;

        /**
         * This attribute shall specify a Content App which consists of an Application ID using a specified catalog.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.5
         */
        application: Application;

        /**
         * This attribute shall specify the current running status of the application.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.6
         */
        status: ApplicationStatus;

        /**
         * This attribute shall specify a human readable (displayable) version of the Content App assigned by the
         * vendor. The maximum length of the ApplicationVersion attribute is 32 bytes of UTF-8 characters.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.7
         */
        applicationVersion: string;

        /**
         * This attribute is a list of vendor IDs. Each entry is a vendor-id.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.8
         */
        allowedVendorList: VendorId[];

        /**
         * This attribute shall specify a human readable (displayable) name of the vendor for the Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.1
         */
        vendorName: string;

        /**
         * This attribute, if present, shall specify the Connectivity Standards Alliance assigned Vendor ID for the
         * Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.2
         */
        vendorId: VendorId;

        /**
         * This attribute, if present, shall specify a numeric ID assigned by the vendor to identify a specific Content
         * App made by them. If the Content App is certified by the Connectivity Standards Alliance, then this would be
         * the Product ID as specified by the vendor for the certification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.4
         */
        productId: number;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * This indicates a global identifier for an Application given a catalog.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.2
     */
    export interface Application {
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
        catalogVendorId: number;

        /**
         * This field shall indicate the application identifier, expressed as a string, such as "123456-5433",
         * "PruneVideo" or "Company X". This field shall be unique within a catalog.
         *
         * For the DIAL registry catalog, this value shall be the DIAL prefix.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.4.2.2
         */
        applicationId: string;
    }

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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link ApplicationBasic}.
     */
    export const Cluster: typeof ApplicationBasic;

    /**
     * @deprecated Use {@link ApplicationBasic}.
     */
    export const Complete: typeof ApplicationBasic;

    export const Typing: ApplicationBasic;
}

/**
 * @deprecated Use {@link ApplicationBasic}.
 */
export declare const ApplicationBasicCluster: typeof ApplicationBasic;

export interface ApplicationBasic extends ClusterTyping {
    Attributes: ApplicationBasic.Attributes;
    Components: ApplicationBasic.Components;
}

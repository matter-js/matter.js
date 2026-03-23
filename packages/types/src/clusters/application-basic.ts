/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { VendorId } from "../datatype/VendorId.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ApplicationBasic as ApplicationBasicModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ApplicationBasic cluster.
 */
export namespace ApplicationBasic {
    /**
     * {@link ApplicationBasic} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall specify a human readable (displayable) name of the Content App assigned by the
             * vendor. For example, "NPR On Demand". The maximum length of the ApplicationName attribute is 256 bytes of
             * UTF-8 characters.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.3
             */
            readonly applicationName: string;

            /**
             * This attribute shall specify a Content App which consists of an Application ID using a specified catalog.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.5
             */
            readonly application: Application;

            /**
             * This attribute shall specify the current running status of the application.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.6
             */
            readonly status: ApplicationStatus;

            /**
             * This attribute shall specify a human readable (displayable) version of the Content App assigned by the
             * vendor. The maximum length of the ApplicationVersion attribute is 32 bytes of UTF-8 characters.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.7
             */
            readonly applicationVersion: string;

            /**
             * This attribute is a list of vendor IDs. Each entry is a vendor-id.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.8
             */
            readonly allowedVendorList: VendorId[];

            /**
             * This attribute shall specify a human readable (displayable) name of the vendor for the Content App.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.1
             */
            readonly vendorName?: string;

            /**
             * This attribute, if present, shall specify the Connectivity Standards Alliance assigned Vendor ID for the
             * Content App.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.2
             */
            readonly vendorId?: VendorId;

            /**
             * This attribute, if present, shall specify a numeric ID assigned by the vendor to identify a specific
             * Content App made by them. If the Content App is certified by the Connectivity Standards Alliance, then
             * this would be the Product ID as specified by the vendor for the certification.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.4
             */
            readonly productId?: number;
        }
    }

    /**
     * Attributes that may appear in {@link ApplicationBasic}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * This attribute shall specify a human readable (displayable) name of the Content App assigned by the vendor.
         * For example, "NPR On Demand". The maximum length of the ApplicationName attribute is 256 bytes of UTF-8
         * characters.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.3
         */
        readonly applicationName: string;

        /**
         * This attribute shall specify a Content App which consists of an Application ID using a specified catalog.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.5
         */
        readonly application: Application;

        /**
         * This attribute shall specify the current running status of the application.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.6
         */
        readonly status: ApplicationStatus;

        /**
         * This attribute shall specify a human readable (displayable) version of the Content App assigned by the
         * vendor. The maximum length of the ApplicationVersion attribute is 32 bytes of UTF-8 characters.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.7
         */
        readonly applicationVersion: string;

        /**
         * This attribute is a list of vendor IDs. Each entry is a vendor-id.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.8
         */
        readonly allowedVendorList: VendorId[];

        /**
         * This attribute shall specify a human readable (displayable) name of the vendor for the Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.1
         */
        readonly vendorName: string;

        /**
         * This attribute, if present, shall specify the Connectivity Standards Alliance assigned Vendor ID for the
         * Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.2
         */
        readonly vendorId: VendorId;

        /**
         * This attribute, if present, shall specify a numeric ID assigned by the vendor to identify a specific Content
         * App made by them. If the Content App is certified by the Connectivity Standards Alliance, then this would be
         * the Product ID as specified by the vendor for the certification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.3.5.4
         */
        readonly productId: number;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

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

    export const id = ClusterId(0x50d);
    export const name = "ApplicationBasic" as const;
    export const revision = 1;
    export const schema = ApplicationBasicModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof ApplicationBasic;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ApplicationBasic` instead of `ApplicationBasic.Complete`)
     */
    export type Complete = typeof ApplicationBasic;

    export declare const Complete: Complete;
    export declare const Typing: ApplicationBasic;
}

ClusterNamespace.define(ApplicationBasic);
export type ApplicationBasicCluster = ApplicationBasic.Cluster;
export const ApplicationBasicCluster = ApplicationBasic.Cluster;
export interface ApplicationBasic extends ClusterTyping { Attributes: ApplicationBasic.Attributes; Components: ApplicationBasic.Components }

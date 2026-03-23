/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise, Bytes } from "@matter/general";
import { EndpointNumber } from "../datatype/EndpointNumber.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ApplicationLauncher as ApplicationLauncherModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ApplicationLauncher cluster.
 */
export namespace ApplicationLauncher {
    /**
     * {@link ApplicationLauncher} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall specify the current in-focus application, identified using an Application ID,
             * catalog vendor ID and the corresponding endpoint number when the application is represented by a Content
             * App endpoint. A null shall be used to indicate there is no current in-focus application.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.2
             */
            readonly currentApp?: ApplicationEp | null;
        }

        export interface Commands {
            /**
             * Upon receipt of this command, the server shall launch the application with optional data. The application
             * shall be either
             *
             *   - the specified application, if the Application Platform feature is supported;
             *
             *   - otherwise the application corresponding to the endpoint.
             *
             * The endpoint shall launch and bring to foreground the requisite application if the application is not
             * already launched and in foreground. The Status attribute shall be updated to ActiveVisibleFocus on the
             * Application Basic cluster of the Endpoint corresponding to the launched application. The Status attribute
             * shall be updated on any other application whose Status may have changed as a result of this command. The
             * CurrentApp attribute, if supported, shall be updated to reflect the new application in the foreground.
             *
             * This command returns a Launcher Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1
             */
            launchApp(request: LaunchAppRequest): MaybePromise<LauncherResponse>;

            /**
             * Upon receipt of this command, the server shall stop the application if it is running. The application
             * shall be either
             *
             *   - the specified application, if the Application Platform feature is supported;
             *
             *   - otherwise the application corresponding to the endpoint.
             *
             * The Status attribute shall be updated to Stopped on the Application Basic cluster of the Endpoint
             * corresponding to the stopped application. The Status attribute shall be updated on any other application
             * whose Status may have changed as a result of this command.
             *
             * This command returns a Launcher Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2
             */
            stopApp(request: StopAppRequest): MaybePromise<LauncherResponse>;

            /**
             * Upon receipt of this command, the server shall hide the application. The application shall be either
             *
             *   - the specified application, if the Application Platform feature is supported;
             *
             *   - otherwise the application corresponding to the endpoint.
             *
             * The endpoint may decide to stop the application based on manufacturer specific behavior or resource
             * constraints if any. The Status attribute shall be updated to ActiveHidden or Stopped, depending on the
             * action taken, on the Application Basic cluster of the Endpoint corresponding to the application on which
             * the action was taken. The Status attribute shall be updated on any other application whose Status may
             * have changed as a result of this command.
             *
             * This command returns a Launcher Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3
             */
            hideApp(request: HideAppRequest): MaybePromise<LauncherResponse>;
        }
    }

    /**
     * {@link ApplicationLauncher} supports these elements if it supports feature "ApplicationPlatform".
     */
    export namespace ApplicationPlatformComponent {
        export interface Attributes {
            /**
             * This attribute shall specify the list of supported application catalogs, where each entry in the list is
             * the Connectivity Standards Alliance-issued vendor ID for the catalog. The DIAL registry (see [DIAL
             * Registry]) shall use value 0x0000.
             *
             * It is expected that Content App Platform providers will have their own catalog vendor ID (set to their
             * own Vendor ID) and will assign an ApplicationID to each Content App.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.1
             */
            readonly catalogList: number[];
        }
    }

    /**
     * Attributes that may appear in {@link ApplicationLauncher}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall specify the current in-focus application, identified using an Application ID, catalog
         * vendor ID and the corresponding endpoint number when the application is represented by a Content App
         * endpoint. A null shall be used to indicate there is no current in-focus application.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.2
         */
        readonly currentApp: ApplicationEp | null;

        /**
         * This attribute shall specify the list of supported application catalogs, where each entry in the list is the
         * Connectivity Standards Alliance-issued vendor ID for the catalog. The DIAL registry (see [DIAL Registry])
         * shall use value 0x0000.
         *
         * It is expected that Content App Platform providers will have their own catalog vendor ID (set to their own
         * Vendor ID) and will assign an ApplicationID to each Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.1
         */
        readonly catalogList: number[];
    }

    export interface Commands extends Base.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { applicationPlatform: true }, attributes: ApplicationPlatformComponent.Attributes }
    ];
    export type Features = "ApplicationPlatform";

    /**
     * These are optional features supported by ApplicationLauncherCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.4
     */
    export enum Feature {
        /**
         * ApplicationPlatform (AP)
         *
         * Support for attributes and commands required for endpoint to support launching any application within the
         * supported application catalogs
         */
        ApplicationPlatform = "ApplicationPlatform"
    }

    /**
     * This specifies an app along with its corresponding endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.3
     */
    export interface ApplicationEp {
        application: Application;
        endpoint?: EndpointNumber;
    }

    /**
     * Upon receipt of this command, the server shall launch the application with optional data. The application shall
     * be either
     *
     *   - the specified application, if the Application Platform feature is supported;
     *
     *   - otherwise the application corresponding to the endpoint.
     *
     * The endpoint shall launch and bring to foreground the requisite application if the application is not already
     * launched and in foreground. The Status attribute shall be updated to ActiveVisibleFocus on the Application Basic
     * cluster of the Endpoint corresponding to the launched application. The Status attribute shall be updated on any
     * other application whose Status may have changed as a result of this command. The CurrentApp attribute, if
     * supported, shall be updated to reflect the new application in the foreground.
     *
     * This command returns a Launcher Response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1
     */
    export interface LaunchAppRequest {
        /**
         * This field shall specify the Application to launch.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1.1
         */
        application?: Application;

        /**
         * This field shall specify optional app-specific data to be sent to the app.
         *
         * > [!NOTE]
         *
         * > This format and meaning of this value is proprietary and outside the specification. It provides a
         *   transition path for device makers that use other protocols (like DIAL) which allow for proprietary data.
         *   Apps that are not yet Matter aware can be launched via Matter, while retaining the existing ability to
         *   launch with proprietary data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1.2
         */
        data?: Bytes;
    }

    /**
     * This command shall be generated in response to LaunchApp/StopApp/HideApp commands.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4
     */
    export interface LauncherResponse {
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4.1
         */
        status: Status;

        /**
         * This field shall specify Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4.2
         */
        data?: Bytes;
    }

    /**
     * Upon receipt of this command, the server shall stop the application if it is running. The application shall be
     * either
     *
     *   - the specified application, if the Application Platform feature is supported;
     *
     *   - otherwise the application corresponding to the endpoint.
     *
     * The Status attribute shall be updated to Stopped on the Application Basic cluster of the Endpoint corresponding
     * to the stopped application. The Status attribute shall be updated on any other application whose Status may have
     * changed as a result of this command.
     *
     * This command returns a Launcher Response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2
     */
    export interface StopAppRequest {
        /**
         * This field shall specify the Application to stop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2.1
         */
        application?: Application;
    }

    /**
     * Upon receipt of this command, the server shall hide the application. The application shall be either
     *
     *   - the specified application, if the Application Platform feature is supported;
     *
     *   - otherwise the application corresponding to the endpoint.
     *
     * The endpoint may decide to stop the application based on manufacturer specific behavior or resource constraints
     * if any. The Status attribute shall be updated to ActiveHidden or Stopped, depending on the action taken, on the
     * Application Basic cluster of the Endpoint corresponding to the application on which the action was taken. The
     * Status attribute shall be updated on any other application whose Status may have changed as a result of this
     * command.
     *
     * This command returns a Launcher Response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3
     */
    export interface HideAppRequest {
        /**
         * This field shall specify the Application to hide.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3.1
         */
        application?: Application;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export enum Status {
        /**
         * Command succeeded
         */
        Success = 0,

        /**
         * Requested app is not available
         */
        AppNotAvailable = 1,

        /**
         * Video platform unable to honor command
         */
        SystemBusy = 2,

        /**
         * User approval for app download is pending
         */
        PendingUserApproval = 3,

        /**
         * Downloading the requested app
         */
        Downloading = 4,

        /**
         * Installing the requested app
         */
        Installing = 5
    }

    /**
     * Thrown for cluster status code {@link Status.AppNotAvailable}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class AppNotAvailableError extends StatusResponseError {
        constructor(
            message = "Requested app is not available",
            code = GlobalStatus.Failure,
            clusterCode = Status.AppNotAvailable
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.SystemBusy}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class SystemBusyError extends StatusResponseError {
        constructor(
            message = "Video platform unable to honor command",
            code = GlobalStatus.Failure,
            clusterCode = Status.SystemBusy
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.PendingUserApproval}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class PendingUserApprovalError extends StatusResponseError {
        constructor(
            message = "User approval for app download is pending",
            code = GlobalStatus.Failure,
            clusterCode = Status.PendingUserApproval
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.Downloading}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class DownloadingError extends StatusResponseError {
        constructor(
            message = "Downloading the requested app",
            code = GlobalStatus.Failure,
            clusterCode = Status.Downloading
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.Installing}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class InstallingError extends StatusResponseError {
        constructor(
            message = "Installing the requested app",
            code = GlobalStatus.Failure,
            clusterCode = Status.Installing
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * This indicates a global identifier for an Application given a catalog.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2
     */
    export interface Application {
        /**
         * This field shall indicate the Connectivity Standards Alliance-issued vendor ID for the catalog. The DIAL
         * registry shall use value 0x0000.
         *
         * Content App Platform providers will have their own catalog vendor ID (set to their own Vendor ID) and will
         * assign an ApplicationID to each Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2.1
         */
        catalogVendorId: number;

        /**
         * This field shall indicate the application identifier, expressed as a string, such as "PruneVideo" or "Company
         * X". This field shall be unique within a catalog.
         *
         * For the DIAL registry catalog, this value shall be the DIAL prefix (see [DIAL Registry]).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2.2
         */
        applicationId: string;
    }

    export const id = ClusterId(0x50c);
    export const name = "ApplicationLauncher" as const;
    export const revision = 2;
    export const schema = ApplicationLauncherModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof ApplicationLauncher;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ApplicationLauncher` instead of
     * `ApplicationLauncher.Complete`)
     */
    export type Complete = typeof ApplicationLauncher;

    export declare const Complete: Complete;
    export declare const Typing: ApplicationLauncher;
}

ClusterNamespace.define(ApplicationLauncher);
export type ApplicationLauncherCluster = ApplicationLauncher.Cluster;
export const ApplicationLauncherCluster = ApplicationLauncher.Cluster;
export interface ApplicationLauncher extends ClusterTyping { Attributes: ApplicationLauncher.Attributes; Commands: ApplicationLauncher.Commands; Features: ApplicationLauncher.Features; Components: ApplicationLauncher.Components }

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status as GlobalStatus } from "../globals/Status.js";

/**
 * Definitions for the ApplicationLauncher cluster.
 *
 * This cluster provides an interface for launching applications on a Video Player device such as a TV.
 *
 * This cluster is supported on endpoints that can launch Applications, such as a Casting Video Player device with a
 * Content App Platform. It supports identifying an Application by global identifier from a given catalog, and launching
 * it. It also supports tracking the currently in-focus Application.
 *
 * Depending on the support for the Application Platform feature, the cluster can either support launching the
 * application corresponding to the endpoint on which the cluster is supported (AP feature not supported) or it can
 * support launching any application (AP feature supported).
 *
 * @see {@link MatterSpecification.v142.Cluster} § 6.4
 */
export declare namespace ApplicationLauncher {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x050c;

    /**
     * Textual cluster identifier.
     */
    export const name: "ApplicationLauncher";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the ApplicationLauncher cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ApplicationLauncher} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall specify the current in-focus application, identified using an Application ID, catalog
         * vendor ID and the corresponding endpoint number when the application is represented by a Content App
         * endpoint. A null shall be used to indicate there is no current in-focus application.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.2
         */
        currentApp?: ApplicationEp | null;
    }

    /**
     * {@link ApplicationLauncher} supports these elements if it supports feature "ApplicationPlatform".
     */
    export interface ApplicationPlatformAttributes {
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
        catalogList: number[];
    }

    /**
     * Attributes that may appear in {@link ApplicationLauncher}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall specify the current in-focus application, identified using an Application ID, catalog
         * vendor ID and the corresponding endpoint number when the application is represented by a Content App
         * endpoint. A null shall be used to indicate there is no current in-focus application.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.2
         */
        currentApp: ApplicationEp | null;

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
        catalogList: number[];
    }

    /**
     * {@link ApplicationLauncher} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt of this command, the server shall launch the application with optional data. The application
         * shall be either
         *
         *   - the specified application, if the Application Platform feature is supported;
         *
         *   - otherwise the application corresponding to the endpoint.
         *
         * The endpoint shall launch and bring to foreground the requisite application if the application is not already
         * launched and in foreground. The Status attribute shall be updated to ActiveVisibleFocus on the Application
         * Basic cluster of the Endpoint corresponding to the launched application. The Status attribute shall be
         * updated on any other application whose Status may have changed as a result of this command. The CurrentApp
         * attribute, if supported, shall be updated to reflect the new application in the foreground.
         *
         * This command returns a Launcher Response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1
         */
        launchApp(request: LaunchAppRequest): MaybePromise<LauncherResponse>;

        /**
         * Upon receipt of this command, the server shall stop the application if it is running. The application shall
         * be either
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
         * constraints if any. The Status attribute shall be updated to ActiveHidden or Stopped, depending on the action
         * taken, on the Application Basic cluster of the Endpoint corresponding to the application on which the action
         * was taken. The Status attribute shall be updated on any other application whose Status may have changed as a
         * result of this command.
         *
         * This command returns a Launcher Response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3
         */
        hideApp(request: HideAppRequest): MaybePromise<LauncherResponse>;
    }

    /**
     * Commands that may appear in {@link ApplicationLauncher}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { applicationPlatform: true }, attributes: ApplicationPlatformAttributes }
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
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.SystemBusy}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class SystemBusyError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.PendingUserApproval}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class PendingUserApprovalError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.Downloading}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class DownloadingError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.Installing}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.1
     */
    export class InstallingError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
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

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use {@link ApplicationLauncher}.
     */
    export const Cluster: typeof ApplicationLauncher;

    /**
     * @deprecated Use {@link ApplicationLauncher}.
     */
    export const Complete: typeof ApplicationLauncher;

    export const Typing: ApplicationLauncher;
}

/**
 * @deprecated Use {@link ApplicationLauncher}.
 */
export declare const ApplicationLauncherCluster: typeof ApplicationLauncher;

export interface ApplicationLauncher extends ClusterTyping {
    Attributes: ApplicationLauncher.Attributes;
    Commands: ApplicationLauncher.Commands;
    Features: ApplicationLauncher.Features;
    Components: ApplicationLauncher.Components;
}

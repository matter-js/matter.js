/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute, Command } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvUInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ApplicationLauncher {
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
     * This indicates a global identifier for an Application given a catalog.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2
     */
    export const TlvApplication = TlvObject({
        /**
         * This field shall indicate the Connectivity Standards Alliance-issued vendor ID for the catalog. The DIAL
         * registry shall use value 0x0000.
         *
         * Content App Platform providers will have their own catalog vendor ID (set to their own Vendor ID) and will
         * assign an ApplicationID to each Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2.1
         */
        catalogVendorId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the application identifier, expressed as a string, such as "PruneVideo" or "Company
         * X". This field shall be unique within a catalog.
         *
         * For the DIAL registry catalog, this value shall be the DIAL prefix (see [DIAL Registry]).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2.2
         */
        applicationId: TlvField(1, TlvString)
    });

    /**
     * This indicates a global identifier for an Application given a catalog.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.2
     */
    export interface Application extends TypeFromSchema<typeof TlvApplication> {}

    /**
     * This specifies an app along with its corresponding endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.3
     */
    export const TlvApplicationEp = TlvObject({
        application: TlvField(0, TlvApplication),
        endpoint: TlvOptionalField(1, TlvEndpointNumber)
    });

    /**
     * This specifies an app along with its corresponding endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.5.3
     */
    export interface ApplicationEp extends TypeFromSchema<typeof TlvApplicationEp> {}

    /**
     * Input to the ApplicationLauncher launchApp command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1
     */
    export const TlvLaunchAppRequest = TlvObject({
        /**
         * This field shall specify the Application to launch.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1.1
         */
        application: TlvOptionalField(0, TlvApplication),

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
        data: TlvOptionalField(1, TlvByteString)
    });

    /**
     * Input to the ApplicationLauncher launchApp command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.1
     */
    export interface LaunchAppRequest extends TypeFromSchema<typeof TlvLaunchAppRequest> {}

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
     * This command shall be generated in response to LaunchApp/StopApp/HideApp commands.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4
     */
    export const TlvLauncherResponse = TlvObject({
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall specify Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4.2
         */
        data: TlvOptionalField(1, TlvByteString)
    });

    /**
     * This command shall be generated in response to LaunchApp/StopApp/HideApp commands.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.4
     */
    export interface LauncherResponse extends TypeFromSchema<typeof TlvLauncherResponse> {}

    /**
     * Input to the ApplicationLauncher stopApp command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2
     */
    export const TlvStopAppRequest = TlvObject({
        /**
         * This field shall specify the Application to stop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2.1
         */
        application: TlvOptionalField(0, TlvApplication)
    });

    /**
     * Input to the ApplicationLauncher stopApp command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2
     */
    export interface StopAppRequest extends TypeFromSchema<typeof TlvStopAppRequest> {}

    /**
     * Input to the ApplicationLauncher hideApp command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3
     */
    export const TlvHideAppRequest = TlvObject({
        /**
         * This field shall specify the Application to hide.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3.1
         */
        application: TlvOptionalField(0, TlvApplication)
    });

    /**
     * Input to the ApplicationLauncher hideApp command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.3
     */
    export interface HideAppRequest extends TypeFromSchema<typeof TlvHideAppRequest> {}

    /**
     * A ApplicationLauncherCluster supports these elements if it supports feature ApplicationPlatform.
     */
    export const ApplicationPlatformComponent = MutableCluster.Component({
        attributes: {
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
            catalogList: Attribute(0x0, TlvArray(TlvUInt16), { persistent: true, default: [] })
        }
    });

    /**
     * These elements and properties are present in all ApplicationLauncher clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x50c,
        name: "ApplicationLauncher",
        revision: 2,

        features: {
            /**
             * Support for attributes and commands required for endpoint to support launching any application within the
             * supported application catalogs
             */
            applicationPlatform: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute shall specify the current in-focus application, identified using an Application ID,
             * catalog vendor ID and the corresponding endpoint number when the application is represented by a Content
             * App endpoint. A null shall be used to indicate there is no current in-focus application.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.6.2
             */
            currentApp: OptionalAttribute(0x1, TlvNullable(TlvApplicationEp), { default: null })
        },

        commands: {
            /**
             * Upon receipt of this command, the server shall launch the application with optional data. The application
             * shall be either
             *
             *   • the specified application, if the Application Platform feature is supported;
             *
             *   • otherwise the application corresponding to the endpoint.
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
            launchApp: Command(0x0, TlvLaunchAppRequest, 0x3, TlvLauncherResponse),

            /**
             * Upon receipt of this command, the server shall stop the application if it is running. The application
             * shall be either
             *
             *   • the specified application, if the Application Platform feature is supported;
             *
             *   • otherwise the application corresponding to the endpoint.
             *
             * The Status attribute shall be updated to Stopped on the Application Basic cluster of the Endpoint
             * corresponding to the stopped application. The Status attribute shall be updated on any other application
             * whose Status may have changed as a result of this command.
             *
             * This command returns a Launcher Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.4.7.2
             */
            stopApp: Command(0x1, TlvStopAppRequest, 0x3, TlvLauncherResponse),

            /**
             * Upon receipt of this command, the server shall hide the application. The application shall be either
             *
             *   • the specified application, if the Application Platform feature is supported;
             *
             *   • otherwise the application corresponding to the endpoint.
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
            hideApp: Command(0x2, TlvHideAppRequest, 0x3, TlvLauncherResponse)
        },

        /**
         * This metadata controls which ApplicationLauncherCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { applicationPlatform: true }, component: ApplicationPlatformComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for launching applications on a Video Player device such as a TV.
     *
     * This cluster is supported on endpoints that can launch Applications, such as a Casting Video Player device with a
     * Content App Platform. It supports identifying an Application by global identifier from a given catalog, and
     * launching it. It also supports tracking the currently in-focus Application.
     *
     * Depending on the support for the Application Platform feature, the cluster can either support launching the
     * application corresponding to the endpoint on which the cluster is supported (AP feature not supported) or it can
     * support launching any application (AP feature supported).
     *
     * ApplicationLauncherCluster supports optional features that you can enable with the
     * ApplicationLauncherCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const AP = { applicationPlatform: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            catalogList: MutableCluster.AsConditional(
                ApplicationPlatformComponent.attributes.catalogList,
                { mandatoryIf: [AP] }
            )
        },

        commands: Cluster.commands
    });

    /**
     * This cluster supports all ApplicationLauncher features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ApplicationLauncherCluster = ApplicationLauncher.Cluster;
export const ApplicationLauncherCluster = ApplicationLauncher.Cluster;
ClusterRegistry.register(ApplicationLauncher.Complete);

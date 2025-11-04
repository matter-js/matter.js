/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ApplicationLauncher } from "#clusters/application-launcher";

export namespace ApplicationLauncherInterface {
    export interface Base {
        /**
         * Upon receipt of this command, the server shall launch the application with optional data. The application
         * shall be either
         *
         *   • the specified application, if the Application Platform feature is supported;
         *
         *   • otherwise the application corresponding to the endpoint.
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
        launchApp(request: ApplicationLauncher.LaunchAppRequest): MaybePromise<ApplicationLauncher.LauncherResponse>;

        /**
         * Upon receipt of this command, the server shall stop the application if it is running. The application shall
         * be either
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
        stopApp(request: ApplicationLauncher.StopAppRequest): MaybePromise<ApplicationLauncher.LauncherResponse>;

        /**
         * Upon receipt of this command, the server shall hide the application. The application shall be either
         *
         *   • the specified application, if the Application Platform feature is supported;
         *
         *   • otherwise the application corresponding to the endpoint.
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
        hideApp(request: ApplicationLauncher.HideAppRequest): MaybePromise<ApplicationLauncher.LauncherResponse>;
    }
}

export type ApplicationLauncherInterface = { components: [{ flags: {}, methods: ApplicationLauncherInterface.Base }] };

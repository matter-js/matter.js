/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ContentLauncher } from "#clusters/content-launcher";

export namespace ContentLauncherInterface {
    export interface UrlPlayback {
        /**
         * Upon receipt, this shall launch content from the specified URL.
         *
         * The content types supported include those identified in the AcceptHeader and SupportedStreamingProtocols
         * attributes.
         *
         * A check shall be made to ensure the URL is secure (uses HTTPS).
         *
         * When playing a video stream in response to this command, an indication (ex. visual) of the identity of the
         * origin node of the video stream shall be provided. This could be in the form of a friendly name label which
         * uniquely identifies the node to the user. This friendly name label is typically assigned by the Matter Admin
         * (ex. TV) at the time of commissioning and, when it’s a device, is often editable by the user. It might be a
         * combination of a company name and friendly name, for example, ”Acme” or “Acme Streaming Service on Alice’s
         * Phone”.
         *
         * This command returns a Launch Response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2
         */
        launchUrl(request: ContentLauncher.LaunchUrlRequest): MaybePromise<ContentLauncher.LauncherResponse>;
    }

    export interface ContentSearch {
        /**
         * Upon receipt, this shall launch the specified content with optional search criteria. This command returns a
         * Launch Response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1
         */
        launchContent(request: ContentLauncher.LaunchContentRequest): MaybePromise<ContentLauncher.LauncherResponse>;
    }
}

export type ContentLauncherInterface = {
    components: [
        { flags: { urlPlayback: true }, methods: ContentLauncherInterface.UrlPlayback },
        { flags: { contentSearch: true }, methods: ContentLauncherInterface.ContentSearch }
    ]
};

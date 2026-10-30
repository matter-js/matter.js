/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentLauncherServer } from "@matter/main/behaviors/content-launcher";
import { ContentLauncher } from "@matter/main/clusters/content-launcher";

/**
 * A content launcher with the ContentSearch and URLPlayback features, the two of chip's tv-app's video player endpoint
 * that the client cases send to. The TH has no screen and no catalog, so it launches nothing.
 *
 * | Command       | Answer                                                     |
 * | ------------- | ---------------------------------------------------------- |
 * | LaunchContent | Success, for any search, as chip's tv-app answers          |
 * | LaunchURL     | Success for an `https` URL, URLNotAvailable for any other¹ |
 *
 * ¹ § 6.7.7.2 requires the check for a secure URL but names no status for a failed check; URLNotAvailable is this
 * TH's choice. chip's tv-app makes no check: it answers Success for any URL but its two test URLs.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.7.7.1, § 6.7.7.2
 */
export class TestContentLauncherServer extends ContentLauncherServer.with("ContentSearch", "UrlPlayback") {
    override launchContent(_request: ContentLauncher.LaunchContentRequest): ContentLauncher.LauncherResponse {
        return { status: ContentLauncher.Status.Success };
    }

    override launchUrl({ contentUrl }: ContentLauncher.LaunchUrlRequest): ContentLauncher.LauncherResponse {
        return {
            status: /^https:/i.test(contentUrl)
                ? ContentLauncher.Status.Success
                : ContentLauncher.Status.UrlNotAvailable,
        };
    }
}

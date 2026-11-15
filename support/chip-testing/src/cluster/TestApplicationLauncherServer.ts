/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApplicationLauncherServer } from "@matter/main/behaviors/application-launcher";
import { ApplicationLauncher } from "@matter/main/clusters/application-launcher";
import { StatusResponse } from "@matter/main/types";

/**
 * The application ID chip's tv-app maps to its content app for vendor 1 when the catalog is not its own
 * (`ContentAppFactoryImpl::ConvertToPlatformCatalogVendorApp`); chip's cert scripts send it.
 */
const KNOWN_APPLICATION_ID = "exampleid";

/**
 * An application launcher with the ApplicationPlatform feature, as on chip's tv-app's video player endpoint
 * (FeatureMap 1).
 *
 * LaunchApp, StopApp and HideApp answer Success for an application of a catalog in CatalogList with a known ID, and
 * AppNotAvailable for any other. A request without an application is INVALID_COMMAND, as chip's tv-app answers. The TH
 * has no content app endpoints, so it updates no ApplicationBasic Status, which § 6.4.7.1 to § 6.4.7.3 ask for.
 *
 * chip's tv-app does not check CatalogList: it accepts this ID in any catalog but its own platform catalog (0xFFF1),
 * where it matches IDs without mapping them.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.4.7.1, § 6.4.7.2, § 6.4.7.3
 */
export class TestApplicationLauncherServer extends ApplicationLauncherServer.with("ApplicationPlatform") {
    override launchApp({ application }: ApplicationLauncher.LaunchAppRequest): ApplicationLauncher.LauncherResponse {
        return this.#answer(application);
    }

    override stopApp({ application }: ApplicationLauncher.StopAppRequest): ApplicationLauncher.LauncherResponse {
        return this.#answer(application);
    }

    override hideApp({ application }: ApplicationLauncher.HideAppRequest): ApplicationLauncher.LauncherResponse {
        return this.#answer(application);
    }

    #answer(application: ApplicationLauncher.Application | undefined): ApplicationLauncher.LauncherResponse {
        if (application === undefined) {
            throw new StatusResponse.InvalidCommandError("The ApplicationPlatform feature requires an Application");
        }
        const known =
            this.state.catalogList.includes(application.catalogVendorId) &&
            application.applicationId === KNOWN_APPLICATION_ID;
        return {
            status: known ? ApplicationLauncher.Status.Success : ApplicationLauncher.Status.AppNotAvailable,
        };
    }
}

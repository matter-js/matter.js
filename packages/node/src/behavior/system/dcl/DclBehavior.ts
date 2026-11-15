/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Logger, SharedEnvironmentServices } from "@matter/general";
import { bool, field } from "@matter/model";
import { DclCertificateService, DclConfig, DclOtaUpdateService, DclVendorInfoService } from "@matter/protocol";

const logger = Logger.get("DclBehavior");

/**
 * DCL (Distributed Compliance Ledger) configuration behavior.
 *
 * This behavior provides centralized configuration for DCL-related services.
 * Configuration can be set via:
 * - Environment variables (MATTER_DCL_PRODUCTIONURL, MATTER_DCL_TESTURL, etc.)
 * - Configuration file ({ "dcl": { "productionUrl": "..." } })
 * - Programmatically when building the node
 *
 * Environment variables:
 * - MATTER_DCL_PRODUCTIONURL - Production DCL API endpoint
 * - MATTER_DCL_TESTURL - Test DCL API endpoint
 * - MATTER_DCL_FETCHTESTCERTIFICATES - Enable test certificate fetching (true/false)
 * - MATTER_DCL_FETCHGITHUBCERTIFICATES - Enable GitHub dev cert fetching (true/false)
 * - MATTER_DCL_OFFLINE - Run all DCL services without network access (true/false)
 *
 * @example Programmatic configuration:
 * ```typescript
 * const node = await ServerNode.create({
 *   behaviors: {
 *     dcl: {
 *       productionUrl: "https://custom.dcl.url",
 *       fetchTestCertificates: true,
 *     }
 *   }
 * });
 * ```
 */
export class DclBehavior extends Behavior {
    static override readonly id = "dcl";

    declare readonly state: DclBehavior.State;
    declare internal: DclBehavior.Internal;

    get #services() {
        if (!this.internal.services) {
            this.internal.services = this.env.asDependent();
        }
        return this.internal.services;
    }

    /** Get DclConfig for production DCL based on the current state. */
    get productionConfig(): DclConfig {
        return { url: this.state.productionUrl };
    }

    /** Get DclConfig for test DCL based on the current state. */
    get testConfig(): DclConfig {
        return { url: this.state.testUrl };
    }

    /**
     * Get DclConfig based on a production flag.
     * @param isProduction - true for production, false for test
     */
    configForProduction(isProduction: boolean): DclConfig {
        return isProduction ? this.productionConfig : this.testConfig;
    }

    /**
     * Get or create the DclCertificateService with the current configuration.
     * NOTE: The service might not be fully initialized, so use await service.construction to ensure before using it!
     */
    get certificateService(): DclCertificateService {
        if (!this.internal.certificateService) {
            if (!this.env.root.has(DclCertificateService)) {
                new DclCertificateService(this.env, {
                    fetchTestCertificates: this.state.fetchTestCertificates,
                    acceptTestCertificates: this.state.acceptTestCertificates,
                    fetchGithubCertificates: this.state.fetchGithubCertificates,
                    dclConfig: this.productionConfig,
                    testDclConfig: this.state.fetchTestCertificates ? this.testConfig : undefined,
                    offline: this.state.offline,
                });
            }
            this.internal.certificateService = this.#checkOffline(
                "DclCertificateService",
                this.#services.get(DclCertificateService),
            );
        }
        return this.internal.certificateService;
    }

    /**
     * Get or create the DclVendorInfoService with the current configuration.
     * NOTE: The service might not be fully initialized, so use await service.construction to ensure before using it!
     */
    get vendorInfoService(): DclVendorInfoService {
        if (!this.internal.vendorInfoService) {
            if (!this.env.root.has(DclVendorInfoService)) {
                new DclVendorInfoService(this.env, {
                    dclConfig: this.productionConfig,
                    offline: this.state.offline,
                });
            }
            this.internal.vendorInfoService = this.#checkOffline(
                "DclVendorInfoService",
                this.#services.get(DclVendorInfoService),
            );
        }
        return this.internal.vendorInfoService;
    }

    /**
     * Get or create the DclOtaUpdateService with the current configuration.
     * NOTE: The service might not be fully initialized, so use await service.construction to ensure before using it!
     */
    get otaUpdateService(): DclOtaUpdateService {
        if (!this.internal.otaService) {
            if (!this.env.root.has(DclOtaUpdateService)) {
                new DclOtaUpdateService(this.env, {
                    productionDclConfig: this.productionConfig,
                    testDclConfig: this.testConfig,
                    offline: this.state.offline,
                });
            }
            this.internal.otaService = this.#checkOffline(
                "DclOtaUpdateService",
                this.#services.get(DclOtaUpdateService),
            );
        }
        return this.internal.otaService;
    }

    /**
     * The services are shared through the environment root, so one created earlier keeps its own `offline` setting.
     * Only an online service for an offline node is a problem; an offline service created on purpose is not.
     */
    #checkOffline<T extends { readonly offline: boolean }>(name: string, service: T) {
        if (this.state.offline && !service.offline) {
            logger.warn(`${name} already exists and is online, so dcl.offline of this node has no effect on it`);
        }
        return service;
    }

    override async [Symbol.asyncDispose]() {
        this.internal.otaService = undefined;
        this.internal.certificateService = undefined;
        this.internal.vendorInfoService = undefined;
        await this.internal.services?.close();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace DclBehavior {
    export class State {
        /**
         * Production DCL API endpoint URL.
         *
         * Swagger docs: https://zigbee-alliance.github.io/distributed-compliance-ledger/#/
         */
        productionUrl = DclConfig.production.url;

        /** Test/Development DCL API endpoint URL. */
        testUrl = DclConfig.test.url;

        /** Whether to fetch test certificates in addition to production ones. */
        @field(bool)
        fetchTestCertificates = false;

        /**
         * Whether device attestation trusts test (non-production) certificates: test PAAs and the Matter test CD
         * signer. When not trusted, each is reported as a `TrustedAsTestCertificate` finding. Independent of
         * {@link fetchTestCertificates}. When unset, defaults to the value of `fetchTestCertificates`.
         */
        @field(bool)
        acceptTestCertificates?: boolean = undefined;

        /** Whether to fetch development certificates from GitHub (only when fetchTestCertificates is true). */
        @field(bool)
        fetchGithubCertificates = true;

        /**
         * Whether the DCL services reach no network at all, neither the DCL nor GitHub nor OTA image URLs. Passed as
         * `offline` to {@link DclCertificateService}, {@link DclVendorInfoService} and {@link DclOtaUpdateService}.
         * They then serve only what storage holds from earlier online runs, plus the built-in test vendors. This
         * behavior passes no seed, so on fresh storage the certificate trust store is empty; create the services
         * yourself with a `seed` for that case.
         *
         * Read when a service is first created. A service already present in the environment keeps its own
         * `offline` setting; an online one is logged as a warning when this is `true`.
         */
        @field(bool)
        offline = false;
    }

    export class Internal {
        services?: SharedEnvironmentServices;
        otaService?: DclOtaUpdateService;
        certificateService?: DclCertificateService;
        vendorInfoService?: DclVendorInfoService;
    }
}

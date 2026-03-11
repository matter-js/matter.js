/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { SharedEnvironmentServices } from "@matter/general";
import { DclCertificateService, DclConfig, DclOtaUpdateService, DclVendorInfoService } from "@matter/protocol";

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

    declare state: DclBehavior.State;
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
        if (!this.env.has(DclCertificateService)) {
            new DclCertificateService(this.env, {
                fetchTestCertificates: this.state.fetchTestCertificates,
                fetchGithubCertificates: this.state.fetchGithubCertificates,
                dclConfig: this.productionConfig,
                testDclConfig: this.state.fetchTestCertificates ? this.testConfig : undefined,
            });
        }
        return this.#services.get(DclCertificateService);
    }

    /**
     * Get or create the DclVendorInfoService with the current configuration.
     * NOTE: The service might not be fully initialized, so use await service.construction to ensure before using it!
     */
    get vendorInfoService(): DclVendorInfoService {
        if (!this.env.has(DclVendorInfoService)) {
            new DclVendorInfoService(this.env, {
                dclConfig: this.productionConfig,
            });
        }
        return this.#services.get(DclVendorInfoService);
    }

    /**
     * Get or create the DclOtaUpdateService with the current configuration.
     * NOTE: The service might not be fully initialized, so use await service.construction to ensure before using it!
     */
    get otaUpdateService(): DclOtaUpdateService {
        if (!this.env.has(DclOtaUpdateService)) {
            new DclOtaUpdateService(this.env, {
                productionDclConfig: this.productionConfig,
                testDclConfig: this.testConfig,
            });
        }
        return this.#services.get(DclOtaUpdateService);
    }

    override async [Symbol.asyncDispose]() {
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
        fetchTestCertificates = false;

        /** Whether to fetch development certificates from GitHub (only when fetchTestCertificates is true). */
        fetchGithubCertificates = true;
    }

    export class Internal {
        services?: SharedEnvironmentServices;
    }
}

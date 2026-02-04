/**
 * @license
 * Copyright 2026 Matter.js Authors
 * Copyright 2026 Viacheslav Bocharov <adeep@baodeep.com>
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#general";

/**
 * Centralized URL configuration for DCL-related services.
 *
 * Uses matter.js Environment.vars configuration system which supports:
 * - Environment variables (MATTER_* prefix)
 * - Config file (config.json)
 * - Command line arguments (--dcl-production-url=...)
 *
 * Swagger for DCL: https://zigbee-alliance.github.io/distributed-compliance-ledger/#/
 *
 * Configuration variables (with their environment variable equivalents):
 * - dcl.production.url (MATTER_DCL_PRODUCTION_URL) - Production DCL API endpoint
 * - dcl.test.url (MATTER_DCL_TEST_URL) - Test DCL API endpoint
 * - dcl.github.owner (MATTER_DCL_GITHUB_OWNER) - GitHub owner for development certificates
 * - dcl.github.repo (MATTER_DCL_GITHUB_REPO) - GitHub repository name
 * - dcl.github.branch (MATTER_DCL_GITHUB_BRANCH) - GitHub branch
 * - dcl.github.path (MATTER_DCL_GITHUB_PATH) - Path to certificates directory in repository
 */
export const DclConfig = {
    /** DCL API endpoints */
    dcl: {
        /** Production DCL URL (CSA official) */
        get productionUrl(): string {
            return Environment.default.vars.get("dcl.production.url", "https://on.dcl.csa-iot.org");
        },
        /** Test/Development DCL URL */
        get testUrl(): string {
            return Environment.default.vars.get("dcl.test.url", "https://on.test-net.dcl.csa-iot.org");
        },
    },

    /** GitHub repository for development/test PAA certificates */
    github: {
        get owner(): string {
            return Environment.default.vars.get("dcl.github.owner", "project-chip");
        },
        get repo(): string {
            return Environment.default.vars.get("dcl.github.repo", "connectedhomeip");
        },
        get branch(): string {
            return Environment.default.vars.get("dcl.github.branch", "master");
        },
        get certPath(): string {
            return Environment.default.vars.get("dcl.github.path", "credentials/development/paa-root-certs");
        },
    },
};

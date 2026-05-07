/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration for a DCL (Distributed Compliance Ledger) API endpoint.
 *
 * Swagger docs: https://zigbee-alliance.github.io/distributed-compliance-ledger/#/
 */
export interface DclConfig {
    url: string;
}

export namespace DclConfig {
    /** Default production DCL endpoint (CSA official) */
    export const production: DclConfig = {
        url: "https://on.dcl.csa-iot.org",
    };

    /** Default test/development DCL endpoint */
    export const test: DclConfig = {
        url: "https://on.test-net.dcl.csa-iot.org",
    };
}

/**
 * Configuration for GitHub certificate repository.
 *
 * Available for programmatic override via DclCertificateService options.
 * Not exposed via environment variables (per project convention).
 */
export interface DclGithubConfig {
    owner: string;
    repo: string;
    branch: string;
    /** Path within the repo to the directory containing PAA root .der files. */
    certPath: string;
    /** Path within the repo to the directory containing CD signer .der files. */
    cdSignerCertPath: string;
}

export namespace DclGithubConfig {
    /** Default GitHub PAA certificate repository (project-chip/connectedhomeip) */
    export const defaults: DclGithubConfig = {
        owner: "project-chip",
        repo: "connectedhomeip",
        branch: "master",
        certPath: "credentials/development/paa-root-certs",
        cdSignerCertPath: "credentials/development/cd-certs",
    };
}

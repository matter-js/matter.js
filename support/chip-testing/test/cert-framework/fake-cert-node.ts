/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import type { CertNodeApi } from "@matter/testing";

/**
 * A {@link CertNodeApi} whose every method rejects, with `overrides` for the ones a test drives.
 *
 * Shared so that adding a method to {@link CertNodeApi} does not have to be repeated in each test
 * that stands one up: a stub spelling out every method compiles only until the interface grows, and
 * the failure is a type error in tests that have nothing to do with the new method.
 */
export function fakeCertNode(overrides: Partial<CertNodeApi> = {}): CertNodeApi {
    const unused = () => Promise.reject(new InternalError("not used by these tests"));
    return {
        invoke: unused,
        invokeBatch: unused,
        readAttribute: unused,
        readAttributes: unused,
        writeAttribute: unused,
        writeAttributes: unused,
        subscribe: unused,
        readEvents: unused,
        subscribeEvents: unused,
        clientEndpoints: unused,
        clientAttribute: unused,
        sessions: unused,
        severTransportConnection: unused,
        openCommissioningWindow: unused,
        operationalMdnsInstanceName: unused,
        decommission: unused,
        ...overrides,
    };
}

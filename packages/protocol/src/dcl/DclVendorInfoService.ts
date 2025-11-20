/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Construction,
    Days,
    Duration,
    Environment,
    Logger,
    StorageContext,
    StorageService,
    Time,
    Timer,
} from "#general";
import { DclClient } from "./DclClient.js";
import { DclVendorInfo } from "./DclRestApiTypes.js";

const logger = Logger.get("DclVendorInfoService");

/**
 * Normalized vendor information with consistent naming conventions.
 */
export type VendorInfo = {
    vendorId: number;
    vendorName: string;
    companyLegalName: string;
    companyPreferredName: string;
    vendorLandingPageUrl: string;
    creator: string;
};

/**
 * Implements a service to manage DCL vendor information as a singleton in the environment and so will be shared by
 * multiple nodes if relevant. It is mainly relevant for controller use cases.
 * The service supports fetching vendor information from the CSA production DCL instance.
 */
export class DclVendorInfoService {
    readonly #construction: Construction<DclVendorInfoService>;
    #storage?: StorageContext;
    #vendorIndex = new Map<number, VendorInfo>();
    #updateTimer?: Timer;
    #closed = false;
    #options: DclVendorInfoService.Options;
    #fetchPromise?: Promise<void>;

    constructor(environment: Environment, options: DclVendorInfoService.Options = {}) {
        environment.root.set(DclVendorInfoService, this);
        this.#options = options;

        this.#construction = Construction(this, async () => {
            this.#storage = (await environment.get(StorageService).open("vendors")).createContext("info");
            await this.#loadVendors(this.#storage);
            await this.update();

            if (options.updateInterval !== null) {
                // Start periodic update timer
                const updateInterval = options.updateInterval ?? Days.one;
                this.#updateTimer = Time.getPeriodicTimer("DCL Vendor Info Update", updateInterval, () =>
                    this.update(),
                ).start();
            }
        });
    }

    get construction() {
        return this.#construction;
    }

    /**
     * Get vendor information by vendor ID. Returns undefined if not found.
     */
    infoFor(vendorId: number): VendorInfo | undefined {
        this.construction.assert();
        return this.#vendorIndex.get(vendorId);
    }

    /**
     * Get all vendor information as a map indexed by vendor ID.
     */
    get vendors(): ReadonlyMap<number, VendorInfo> {
        this.construction.assert();
        return this.#vendorIndex;
    }

    /**
     * Update vendor information from DCL.
     */
    async update() {
        if (this.#closed || !this.#storage) {
            return;
        }

        if (this.#fetchPromise !== undefined) {
            // Wait for ongoing fetch to complete
            await this.#fetchPromise;
            return;
        }

        try {
            this.#fetchPromise = this.#fetchVendorsFromDcl(this.#storage).finally(() => {
                this.#fetchPromise = undefined;
            });
            await this.#fetchPromise;
        } catch (error) {
            logger.info("Error updating vendor information", error);
        }
    }

    /**
     * Load vendor information from storage.
     */
    async #loadVendors(storage: StorageContext) {
        const storedVendors = await storage.get<VendorInfo[]>("vendors", []);
        for (const vendor of storedVendors) {
            this.#vendorIndex.set(vendor.vendorId, vendor);
        }
        if (storedVendors.length > 0) {
            logger.info(`Loaded ${this.#vendorIndex.size} vendors from storage`);
        }
    }

    /**
     * Fetch vendor information from DCL and store it.
     */
    async #fetchVendorsFromDcl(storage: StorageContext) {
        logger.info("Fetching vendor information from DCL...");

        const dclClient = new DclClient(true); // Production only
        const vendors = await dclClient.fetchAllVendors(this.#options);

        logger.info(`Fetched ${vendors.length} vendors from DCL`);

        // Add hardcoded test vendors if not present
        const hardcodedVendors: DclVendorInfo[] = [
            {
                vendorID: 0xfff1,
                vendorName: "Test Vendor",
                companyLegalName: "Test Vendor Inc.",
                companyPreferredName: "Test Vendor",
                vendorLandingPageURL: "https://test.example.com",
                creator: "System",
            },
            {
                vendorID: 0xfff2,
                vendorName: "Test Vendor",
                companyLegalName: "Test Vendor Inc.",
                companyPreferredName: "Test Vendor",
                vendorLandingPageURL: "https://test.example.com",
                creator: "System",
            },
            {
                vendorID: 0xfff3,
                vendorName: "Test Vendor",
                companyLegalName: "Test Vendor Inc.",
                companyPreferredName: "Test Vendor",
                vendorLandingPageURL: "https://test.example.com",
                creator: "System",
            },
            {
                vendorID: 0xfff4,
                vendorName: "Test Vendor",
                companyLegalName: "Test Vendor Inc.",
                companyPreferredName: "Test Vendor",
                vendorLandingPageURL: "https://test.example.com",
                creator: "System",
            },
            {
                vendorID: 4939,
                vendorName: "Nabu Casa",
                companyLegalName: "Nabu Casa, Inc.",
                companyPreferredName: "Nabu Casa",
                vendorLandingPageURL: "https://www.nabucasa.com",
                creator: "System",
            },
        ];

        for (const hardcoded of hardcodedVendors) {
            if (!vendors.find(v => v.vendorID === hardcoded.vendorID)) {
                vendors.push(hardcoded);
            }
        }

        // Convert DCL format to internal format and update index
        const vendorsToStore: VendorInfo[] = [];
        for (const vendor of vendors) {
            const normalizedVendor = this.#normalizeDclVendor(vendor);
            this.#vendorIndex.set(normalizedVendor.vendorId, normalizedVendor);
            vendorsToStore.push(normalizedVendor);
        }

        // Store all vendors as an array
        await storage.set("vendors", vendorsToStore);

        logger.info(`Stored ${this.#vendorIndex.size} vendors`);
    }

    /**
     * Normalize DCL vendor format to internal format.
     */
    #normalizeDclVendor(dclVendor: DclVendorInfo): VendorInfo {
        return {
            vendorId: dclVendor.vendorID,
            vendorName: dclVendor.vendorName,
            companyLegalName: dclVendor.companyLegalName,
            companyPreferredName: dclVendor.companyPreferredName,
            vendorLandingPageUrl: dclVendor.vendorLandingPageURL,
            creator: dclVendor.creator,
        };
    }

    /**
     * Close the service and stop periodic updates.
     */
    async close() {
        if (this.#closed) return;
        this.#closed = true;

        await this.#fetchPromise;

        if (this.#updateTimer) {
            this.#updateTimer.stop();
            this.#updateTimer = undefined;
        }

        logger.debug("DclVendorInfoService closed");
    }

    [Symbol.asyncDispose]() {
        return this.close();
    }
}

export namespace DclVendorInfoService {
    export interface Options extends DclClient.Options {
        /**
         * Interval for periodic vendor information updates.
         * Default is 1 day. Set to null to disable periodic updates.
         */
        updateInterval?: Duration | null;
    }
}

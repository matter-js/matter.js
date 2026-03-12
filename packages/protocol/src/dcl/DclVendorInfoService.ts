/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Construction,
    Days,
    Diagnostic,
    Duration,
    Environment,
    Logger,
    StorageContext,
    StorageManager,
    StorageService,
    Time,
    Timer,
} from "@matter/general";
import {
    CommissioningFlowType,
    DeviceModelDclSchema,
    DeviceTypeId,
    DiscoveryCapabilitiesSchema,
    EnhancedSetupFlowOptionsSchema,
    TypeFromBitmapSchema,
} from "@matter/types";
import { PairingHintBitmapSchema } from "../advertisement/PairingHintBitmap.js";
import { DclClient, MatterDclResponseError } from "./DclClient.js";
import { DclConfig } from "./DclConfig.js";
import { DclErrorCodes, DclVendorInfo } from "./DclRestApiTypes.js";

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
 * Normalized product information from DCL, with bitmaps decoded and wire-format
 * internals (vid, pid, schemaVersion, TC digest/size) stripped.
 */
export type ProductInfo = {
    /** Primary Device Type identifier for the device, e.g. 0x000A for Door Lock. */
    deviceTypeID: DeviceTypeId;

    /** Human-readable product name. Matches the ProductName field in the Basic Information Cluster. */
    productName: string;

    /** Human-readable product label. Matches the ProductLabel field in the Basic Information Cluster. */
    productLabel: string;

    /**
     * Part number for this product. Matches the PartNumber field in the Basic Information Cluster.
     * Multiple products sharing the same ProductID (e.g. different regional packaging or colors)
     * may have different part numbers.
     */
    partNumber: string;

    /**
     * Device discovery technologies supported by this device — whether it supports BLE,
     * IP network, or Wi-Fi Public Action Frame for discovery.
     */
    discoveryCapabilities: TypeFromBitmapSchema<typeof DiscoveryCapabilitiesSchema>;

    /**
     * Commissioning flow type: Standard (device enters commissioning on power-up),
     * UserIntent (user action required), or Custom (vendor-specified means needed).
     */
    commissioningFlow: CommissioningFlowType;

    /** Vendor-specific URL to initiate commissioning when flow is Custom. */
    commissioningCustomFlowUrl?: string;

    /**
     * Hints for how to put a not-yet-commissioned device into commissioning mode,
     * e.g. power cycle, press reset button, or use the device manual.
     */
    commissioningModeInitialStepsHint: TypeFromBitmapSchema<typeof PairingHintBitmapSchema>;

    /** Pairing instruction text for initial commissioning steps that require user guidance. */
    commissioningModeInitialStepsInstruction?: string;

    /**
     * Hints for how to put an already-commissioned device back into commissioning mode,
     * e.g. via an existing Administrator or by pressing the setup button.
     */
    commissioningModeSecondaryStepsHint: TypeFromBitmapSchema<typeof PairingHintBitmapSchema>;

    /** Pairing instruction text for secondary commissioning steps that require user guidance. */
    commissioningModeSecondaryStepsInstruction?: string;

    /** Vendor URL to help users resolve commissioning failures. */
    commissioningFallbackUrl?: string;

    /** Link to the product's user manual. */
    userManualUrl?: string;

    /** Link to the product's support page. */
    supportUrl?: string;

    /** Link to the product's web page. Matches the ProductURL field in the Basic Information Cluster. */
    productUrl?: string;

    /** Link to the Localized String File for this product. */
    lsfUrl?: string;

    /** Version number of the Localized String File — increases with each published revision. */
    lsfRevision?: number;

    /**
     * Configuration flags for the Enhanced Setup Flow, e.g. whether Terms and Conditions
     * must be shown during initial commissioning.
     */
    enhancedSetupFlowOptions?: TypeFromBitmapSchema<typeof EnhancedSetupFlowOptionsSchema>;

    /** Link to the Enhanced Setup Flow Terms and Conditions file. */
    enhancedSetupFlowTCUrl?: string;

    /** Version number of the Terms and Conditions file — increases with each published revision. */
    enhancedSetupFlowTCRevision?: number;

    /** Vendor URL to resolve functionality limitations after Terms and Conditions change. */
    enhancedSetupFlowMaintenanceUrl?: string;
};

/**
 * Implements a service to manage DCL vendor information as a singleton in the environment and so will be shared by
 * multiple nodes if relevant. It is mainly relevant for controller use cases.
 * The service supports fetching vendor information from the CSA production DCL instance.
 */
export class DclVendorInfoService {
    readonly #construction: Construction<DclVendorInfoService>;
    #storageManager?: StorageManager;
    #storage?: StorageContext;
    #vendorIndex = new Map<number, VendorInfo>();
    #updateTimer?: Timer;
    #closed = false;
    #options: DclVendorInfoService.Options;
    #fetchPromise?: Promise<void>;

    constructor(environment: Environment, options: DclVendorInfoService.Options = {}) {
        environment.root.set(DclVendorInfoService, this);
        this.#options = options;
        logger.info(
            "Initialize VendorInfoService",
            Diagnostic.dict({
                source: options.dclConfig?.url ?? DclConfig.production.url,
                interval:
                    options.updateInterval === null ? "disabled" : Duration.format(options.updateInterval ?? Days.one),
            }),
        );

        this.#construction = Construction(this, async () => {
            this.#storageManager = await environment.get(StorageService).open("vendors");
            this.#storage = this.#storageManager.createContext("info");
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
     * Fetch product details for a given vendor ID and product ID from DCL.
     * Returns undefined if the product is not found or the service is closed.
     */
    async productInfoFor(vendorId: number, productId: number): Promise<ProductInfo | undefined> {
        if (this.#closed) {
            return undefined;
        }
        try {
            const dclClient = new DclClient(this.#options.dclConfig ?? DclConfig.production);
            const model = await dclClient.fetchModelByVidPid(vendorId, productId, this.#options);
            return this.#normalizeProductModel(model);
        } catch (error) {
            if (error instanceof MatterDclResponseError && error.response.code === DclErrorCodes.NotFound) {
                logger.debug("Product not found in DCL", Diagnostic.dict({ vendorId, productId }));
                return undefined;
            }
            throw error;
        }
    }

    #normalizeProductModel(model: DeviceModelDclSchema): ProductInfo | undefined {
        const {
            deviceTypeID,
            productName,
            productLabel,
            partNumber,
            discoveryCapabilitiesBitmask,
            commissioningCustomFlow,
            commissioningCustomFlowUrl,
            commissioningModeInitialStepsHint,
            commissioningModeInitialStepsInstruction,
            commissioningModeSecondaryStepsHint,
            commissioningModeSecondaryStepsInstruction,
            commissioningFallbackUrl,
            userManualUrl,
            supportUrl,
            productUrl,
            lsfUrl,
            lsfRevision,
            enhancedSetupFlowOptions,
            enhancedSetupFlowTCUrl,
            enhancedSetupFlowTCRevision,
            enhancedSetupFlowMaintenanceUrl,
        } = model;
        try {
            return {
                deviceTypeID,
                productName,
                productLabel,
                partNumber,
                discoveryCapabilities: DiscoveryCapabilitiesSchema.decode(discoveryCapabilitiesBitmask),
                commissioningFlow: commissioningCustomFlow as CommissioningFlowType,
                commissioningCustomFlowUrl,
                commissioningModeInitialStepsHint: PairingHintBitmapSchema.decode(commissioningModeInitialStepsHint),
                commissioningModeInitialStepsInstruction,
                commissioningModeSecondaryStepsHint: PairingHintBitmapSchema.decode(
                    commissioningModeSecondaryStepsHint,
                ),
                commissioningModeSecondaryStepsInstruction,
                commissioningFallbackUrl,
                userManualUrl,
                supportUrl,
                productUrl,
                lsfUrl,
                lsfRevision,
                enhancedSetupFlowOptions:
                    enhancedSetupFlowOptions !== undefined
                        ? EnhancedSetupFlowOptionsSchema.decode(enhancedSetupFlowOptions)
                        : undefined,
                enhancedSetupFlowTCUrl,
                enhancedSetupFlowTCRevision,
                enhancedSetupFlowMaintenanceUrl,
            };
        } catch (error) {
            logger.warn(
                "Invalid DCL product entry",
                Diagnostic.dict({ vendorId: model.vid, productId: model.pid }),
                error,
            );
            return undefined;
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
        logger.info("Fetching vendor information from DCL");

        const dclClient = new DclClient(this.#options.dclConfig ?? DclConfig.production);
        const vendors = await dclClient.fetchAllVendors(this.#options);

        logger.info(`Fetched ${vendors.length} vendors from DCL`);

        // Add hardcoded test vendors if not present
        const hardcodedVendors: DclVendorInfo[] = [
            ...[0xfff1, 0xfff2, 0xfff3, 0xfff4].map(vendorID => ({
                vendorID,
                vendorName: "Test Vendor",
                companyLegalName: "Test Vendor Inc.",
                companyPreferredName: "Test Vendor",
                vendorLandingPageURL: "https://test.example.com",
                creator: "System",
            })),
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

        await this.#storageManager?.close();
    }
}

export namespace DclVendorInfoService {
    export interface Options extends DclClient.Options {
        /**
         * Interval for periodic vendor information updates.
         * Default is 1 day. Set to null to disable periodic updates.
         */
        updateInterval?: Duration | null;

        /** DCL config for production endpoint. Defaults to DclConfig.production. */
        dclConfig?: DclConfig;
    }
}

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceArea } from "#clusters/service-area";
import { deepCopy, isDeepEqual, MaybePromise } from "#general";
import { ValidationError } from "#types";
import { ServiceAreaBehavior } from "./ServiceAreaBehavior.js";

const ServiceAreaBase = ServiceAreaBehavior.with(ServiceArea.Feature.Maps, ServiceArea.Feature.ProgressReporting);

type AssertSelectServiceAreaResponse = {
    result: ServiceArea.SelectAreasResponse;
    validatedAreas?: number[];
};

/**
 * This is the default server implementation of {@link ServiceAreaBehavior}.
 *
 * It validates the attributes on initialization and when being changed against the definition of the specification.
 * It configures the estimatedEndTime attribute according to the defined Q-Requirements.
 *
 * The `skipArea` command is not implemented because optional and depending on device specific behavior, but the
 * below defined extension method `assertSkipServiceArea` implements all relevant default validation as defined by specs.
 *
 * This implementation offers the following extension points:
 * * - `assertSelectServiceArea` to implement custom logic when selecting areas
 * * - `assertSkipServiceArea` to implement custom logic when skipping areas
 *
 * Additionally, the `removeSupportedAreasEntry` and `removeSupportedMapsEntry` methods are provided to remove entries
 * including needed adjustments of other attributes.
 */
export class ServiceAreaBaseServer extends ServiceAreaBase {
    override initialize(): MaybePromise {
        this.#assertSupportedAreas(this.state.supportedAreas);
        this.reactTo(this.events.supportedAreas$Changing, this.#assertSupportedAreas);
        this.#assertSupportedMaps(this.state.supportedMaps);
        this.reactTo(this.events.supportedMaps$Changing, this.#assertSupportedMaps);
        this.#assertSelectedAreas(this.state.selectedAreas);
        this.reactTo(this.events.selectedAreas$Changing, this.#assertSelectedAreas);
        if (this.state.currentArea !== undefined) {
            this.#assertCurrentArea(this.state.currentArea);
            this.maybeReactTo(this.events.currentArea$Changing, this.#assertCurrentArea);
        }
        if (this.state.progress !== undefined) {
            this.#assertProgress(this.state.progress);
            this.reactTo(this.events.progress$Changing, this.#assertProgress);
        }
        if (this.state.currentArea !== undefined && this.state.estimatedEndTime !== undefined) {
            if (this.state.currentArea === null) {
                this.state.estimatedEndTime = null;
            }
            if (this.events.estimatedEndTime$Changed !== undefined) {
                // The value of this attribute SHALL only be reported in the following cases:
                // • when it changes to or from 0
                // • when it decreases
                // • when it changes to or from null
                this.events.estimatedEndTime$Changed.quiet.shouldEmit = (newValue, oldValue) => {
                    return oldValue === null ||
                        oldValue === 0 ||
                        newValue === null ||
                        newValue === 0 ||
                        newValue < oldValue
                        ? "now"
                        : true;
                };
            }
        }
    }

    #assertSupportedMaps(maps: ServiceArea.Map[]) {
        if (maps.length === 0) {
            return;
        }

        const mapIds = new Set<number>();
        const mapNames = new Set<string>();
        for (const { mapId, name } of maps) {
            if (mapIds.has(mapId)) {
                throw new ValidationError(`MapID ${mapId} is not unique`);
            }
            if (mapNames.has(name)) {
                throw new ValidationError(`MapName "${name}" is not unique`);
            }
            mapIds.add(mapId);
            mapNames.add(name);
        }
    }

    #assertSupportedAreas(areas: ServiceArea.Area[]) {
        // Each entry in this list SHALL have a unique value for the AreaID field.
        const areaIds = new Set<number>();

        if (areas.length > 0) {
            // Validate the areas and collect the areaIds for easy access.
            for (const { areaId, areaInfo } of areas) {
                if (areaIds.has(areaId)) {
                    throw new ValidationError(`AreaID ${areaId} is not unique`);
                }
                const { locationInfo, landmarkInfo } = areaInfo;
                if (locationInfo === null && landmarkInfo === null) {
                    throw new ValidationError(`Area ${areaId} has no location or landmark info`);
                }
                if (locationInfo !== null) {
                    const { locationName, floorNumber, areaType } = locationInfo;
                    if (locationName === "" && floorNumber === null && areaType === null && landmarkInfo === null) {
                        throw new ValidationError(`Area ${areaId} has no location info`);
                    }
                }
                areaIds.add(areaId);
            }

            // Collect and validate the mapIds and details
            const mapIds = new Set<number | null>();
            for (let i = 0; i < areas.length; i++) {
                const { areaId, mapId, areaInfo } = areas[i];
                mapIds.add(mapId);
                // Check for unique MapId and AreaInfo combination
                for (let j = i + 1; j < areas.length; j++) {
                    const otherArea = areas[j];
                    if (otherArea.mapId !== mapId) {
                        // Different mapId is different combination
                        continue;
                    }
                    if (isDeepEqual(areaInfo, otherArea.areaInfo)) {
                        throw new ValidationError(
                            `Areas must have a unique AreaInfo field, but area ${areaId} and area ${otherArea.areaId} are equal`,
                        );
                    }
                }
            }

            if (this.state.supportedMaps !== undefined && this.state.supportedMaps.length > 0) {
                if (mapIds.has(null)) {
                    throw new ValidationError(`Areas must not have a null mapId when supportedMaps is defined`);
                }
            } else {
                if (!mapIds.has(null) || mapIds.size > 1) {
                    throw new ValidationError(`Areas must have a null mapId when supportedMaps is empty`);
                }
            }
        }
    }

    #assertSelectedAreas(areas: number[]) {
        const selectedAreaIds = new Set<number>();
        for (const areaId of areas) {
            if (!this.state.supportedAreas.some(area => area.areaId === areaId)) {
                throw new ValidationError(`AreaID ${areaId} is not in the supported areas list`);
            }
            if (selectedAreaIds.has(areaId)) {
                throw new ValidationError(`AreaID ${areaId} is not unique`);
            }
            selectedAreaIds.add(areaId);
        }
    }

    #assertCurrentArea(areaId: number | null) {
        if (areaId === null) {
            if (this.state.estimatedEndTime !== undefined) {
                this.state.estimatedEndTime = null;
            }
            return;
        }
        if (!this.state.supportedAreas.some(area => area.areaId === areaId)) {
            throw new ValidationError(`AreaID ${areaId} is not in the supported areas list`);
        }
    }

    #assertProgress(progress: ServiceArea.Progress[]) {
        const areaIds = new Set<number>();
        for (const area of progress) {
            if (areaIds.has(area.areaId)) {
                throw new ValidationError(`AreaID ${area.areaId} is not unique`);
            }
            areaIds.add(area.areaId);
            if (!this.state.supportedAreas.some(supportedArea => supportedArea.areaId === area.areaId)) {
                throw new ValidationError(`AreaID ${area.areaId} is not in the supported areas list`);
            }
        }
    }

    /**
     * This command is used to select a set of device areas, where the device is to operate.
     * On receipt of this command the device shall respond with a SelectAreasResponse command.
     *
     * The default implementation wil check the areaId as defined by the specification and internally calls
     * `assertSelectServiceArea`, which can be overridden to implement custom logic.
     * When a new list of areas is selected, the device shall clear the progress list and set the status of all areas to
     * Pending.
     */
    override selectAreas({ newAreas }: ServiceArea.SelectAreasRequest): MaybePromise<ServiceArea.SelectAreasResponse> {
        const { result, validatedAreas } = this.assertSelectServiceArea({ newAreas });
        if (result.status === ServiceArea.SelectAreasStatus.Success && validatedAreas !== undefined) {
            this.state.selectedAreas = validatedAreas;
            if (this.state.progress !== undefined && validatedAreas.length > 0) {
                const progress = new Array<ServiceArea.Progress>();
                for (const area of validatedAreas) {
                    progress.push({
                        areaId: area,
                        status: ServiceArea.OperationalStatus.Pending,
                    });
                }
                this.state.progress = progress;
            }
        }

        return result;
    }

    protected assertSelectServiceArea({ newAreas }: ServiceArea.SelectAreasRequest): AssertSelectServiceAreaResponse {
        const selectedAreaIds = new Set<number>();
        for (const areaId of newAreas) {
            if (!this.state.supportedAreas.some(area => area.areaId === areaId)) {
                return {
                    result: {
                        status: ServiceArea.SelectAreasStatus.UnsupportedArea,
                        statusText: `AreaID ${areaId} is not in the supported areas list`,
                    },
                };
            }
            selectedAreaIds.add(areaId);
        }
        const validatedAreas = Array.from(selectedAreaIds.values());
        return {
            result: {
                status: ServiceArea.SelectAreasStatus.Success,
                statusText: "",
            },
            validatedAreas,
        };
    }

    protected assertSkipServiceArea({ skippedArea }: ServiceArea.SkipAreaRequest): ServiceArea.SkipAreaResponse {
        if (this.state.selectedAreas.length === 0) {
            return {
                status: ServiceArea.SkipAreaStatus.InvalidAreaList,
                statusText: "",
            };
        }
        if (!this.state.selectedAreas.some(area => area === skippedArea)) {
            return {
                status: ServiceArea.SkipAreaStatus.InvalidSkippedArea,
                statusText: `AreaID ${skippedArea} is not in the selected areas list`,
            };
        }
        return {
            status: ServiceArea.SkipAreaStatus.Success,
            statusText: "",
        };
    }

    removeSupportedAreasEntry(areaId: number) {
        const supportedAreas = this.state.supportedAreas;
        if (supportedAreas === undefined || supportedAreas.length === 0) {
            return;
        }
        this.state.selectedAreas = deepCopy(this.state.selectedAreas.filter(area => area !== areaId));
        if (this.state.currentArea === areaId) {
            this.state.currentArea = null;
        }
        if (this.state.progress !== undefined) {
            this.state.progress = deepCopy(this.state.progress.filter(area => area.areaId !== areaId));
        }
        this.state.supportedAreas = deepCopy(supportedAreas.filter(area => area.areaId !== areaId));
    }

    /**
     * Convenience helper method to remove a map from the supported maps list.
     * The logic will also sync the SupportedAreas list with this removal.
     */
    removeSupportedMapsEntry(mapId: number) {
        const supportedMaps = this.state.supportedMaps;
        if (supportedMaps === undefined || supportedMaps.length === 0) {
            return;
        }
        const mapToRemove = supportedMaps.find(map => map.mapId === mapId);
        if (mapToRemove !== undefined) {
            const affectedArea = this.state.supportedAreas.find(area => area.mapId === mapToRemove.mapId);
            if (affectedArea !== undefined) {
                this.removeSupportedAreasEntry(affectedArea.areaId);
            }
            this.state.supportedMaps = deepCopy(supportedMaps.filter(map => map.mapId !== mapToRemove.mapId));
        }
    }
}

export namespace ServiceAreaBaseServer {
    export declare const ExtensionInterface: {
        assertSelectServiceArea({ newAreas }: ServiceArea.SelectAreasRequest): AssertSelectServiceAreaResponse;
        assertSkipServiceArea({ skippedArea }: ServiceArea.SkipAreaRequest): ServiceArea.SkipAreaResponse;
    };
}

// We had turned on some more features to provide the default implementation, but export the cluster with no
// Features again.
export class ServiceAreaServer extends ServiceAreaBaseServer.with() {}

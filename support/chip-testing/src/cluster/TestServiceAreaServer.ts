/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ServiceAreaServer } from "@matter/main/behaviors/service-area";
import { ServiceArea } from "@matter/main/clusters/service-area";
import { TestRvcRunModeServer } from "./TestRvcRunModeServer.js";

export class TestServiceAreaServer extends ServiceAreaServer.with(
    ServiceArea.Feature.Maps,
    ServiceArea.Feature.ProgressReporting,
) {
    override async initialize() {
        const runMode = await this.agent.load(TestRvcRunModeServer);
        this.reactTo(runMode.events.currentMode$Changed, this.#reactOnModeChange);
    }

    #reactOnModeChange(mode: number) {
        if (mode === 0) {
            this.state.progress.forEach(entry => (entry.status = ServiceArea.OperationalStatus.Skipped));
        }
    }

    override selectAreas({ newAreas }: ServiceArea.SelectAreasRequest): ServiceArea.SelectAreasResponse {
        const { result, validatedAreas } = this.assertSelectServiceArea({ newAreas });
        if (result.status !== ServiceArea.SelectAreasStatus.Success) {
            return result;
        }

        if (this.endpoint.stateOf(TestRvcRunModeServer).currentMode === 1) {
            return {
                status: ServiceArea.SelectAreasStatus.InvalidInMode,
                statusText: "Cleaning mode does not support area selection",
            };
        }
        if (validatedAreas !== undefined) {
            this.state.selectedAreas = validatedAreas;
            if (validatedAreas.length > 0) {
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

    override skipArea({ skippedArea }: ServiceArea.SkipAreaRequest): ServiceArea.SkipAreaResponse {
        const result = this.assertSkipServiceArea({ skippedArea });
        if (result.status !== ServiceArea.SkipAreaStatus.Success) {
            return result;
        }

        if (this.endpoint.stateOf(TestRvcRunModeServer).currentMode === 0) {
            return {
                status: ServiceArea.SkipAreaStatus.InvalidInMode,
                statusText: "Idle mode does not support area skipping",
            };
        }

        const processEntry = this.state.progress.find(({ areaId }) => areaId === skippedArea);
        if (processEntry !== undefined) {
            processEntry.status = ServiceArea.OperationalStatus.Skipped;
        }

        return result;
    }
}

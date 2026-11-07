/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { field, nonvolatile, uint16 } from "@matter/model";
import { StatusResponse, ValidationError } from "@matter/types";
import { ZoneManagement } from "@matter/types/clusters/zone-management";
import { ZoneManagementBehavior } from "./ZoneManagementBehavior.js";

const ZoneManagementBase = ZoneManagementBehavior.with(
    ZoneManagement.Feature.TwoDimensionalCartesianZone,
    ZoneManagement.Feature.UserDefined,
);

type Vertex = ZoneManagement.TwoDCartesianVertex;

/**
 * The highest zone ID. The ZoneID data type wraps to 0 when incremented past this value.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 2.14.5.10
 */
const MAX_ZONE_ID = 0xfffe;

/**
 * This is the default server implementation of {@link ZoneManagementBehavior}.
 *
 * It stores the user-defined zones and the triggers in the {@link ZoneManagement.Attributes.zones} and
 * {@link ZoneManagement.Attributes.triggers} attributes. The commands refuse requests the specification does not
 * allow, in this order:
 *
 * | Command                 | Refused with                                                                      |
 * |-------------------------|-----------------------------------------------------------------------------------|
 * | CreateTwoDCartesianZone | CONSTRAINT_ERROR for a focus zone without the FocusZones feature,                 |
 * |                         | RESOURCE_EXHAUSTED when MaxUserDefinedZones or MaxZones is reached,               |
 * |                         | DYNAMIC_CONSTRAINT_ERROR for a vertex beyond TwoDCartesianMax,                    |
 * |                         | ALREADY_EXISTS for a zone with the same use and vertices,                         |
 * |                         | DYNAMIC_CONSTRAINT_ERROR for vertices that do not form a simple polygon           |
 * | UpdateTwoDCartesianZone | NOT_FOUND for an unknown zone, CONSTRAINT_ERROR for a manufacturer zone,          |
 * |                         | DYNAMIC_CONSTRAINT_ERROR for a zone that is not a TwoD Cartesian zone, then the   |
 * |                         | focus, vertex, duplicate and polygon checks of CreateTwoDCartesianZone            |
 * | RemoveZone              | NOT_FOUND for an unknown zone, CONSTRAINT_ERROR for a manufacturer zone,          |
 * |                         | INVALID_IN_STATE while a trigger uses the zone                                    |
 * | CreateOrUpdateTrigger   | CONSTRAINT_ERROR for invalid durations,                                           |
 * |                         | INVALID_COMMAND when the sensitivity does not match PerZoneSensitivity,           |
 * |                         | CONSTRAINT_ERROR for a sensitivity outside 1 to SensitivityMax,                   |
 * |                         | NOT_FOUND for an unknown zone,                                                    |
 * |                         | CONSTRAINT_ERROR for a zone that is not a motion zone                             |
 * | RemoveTrigger           | NOT_FOUND when the zone has no trigger                                            |
 *
 * The server does not detect activity. The application detects it, emits the
 * {@link ZoneManagement.Events.zoneTriggered} and {@link ZoneManagement.Events.zoneStopped} events, and uses the
 * durations of the zone's trigger for their timing.
 *
 * A write that leaves repeated zone IDs in the zones attribute fails with a `ValidationError`, and the endpoint does
 * not start when its initial zones repeat an ID. The server does not check that writes of the application to the
 * triggers attribute name an existing motion zone or use each zone ID once.
 *
 * To apply a change to the camera, override the command and call `super` first, so that the checks run before the
 * camera changes. To refuse the change, throw a `StatusResponseError`. The command then fails with that status,
 * and the state that `super` wrote is discarded.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 2.14
 */
export class ZoneManagementBaseServer extends ZoneManagementBase {
    declare readonly state: ZoneManagementBaseServer.State;

    override initialize() {
        this.#assertUniqueZoneIds(this.state.zones);
        this.reactTo(this.events.zones$Changing, this.#assertUniqueZoneIds);
    }

    override createTwoDCartesianZone({
        zone,
    }: ZoneManagement.CreateTwoDCartesianZoneRequest): MaybePromise<ZoneManagement.CreateTwoDCartesianZoneResponse> {
        this.#assertFocusSupported(zone);

        const { zones } = this.state;
        const userZoneCount = zones.filter(({ zoneSource }) => zoneSource === ZoneManagement.ZoneSource.User).length;
        if (userZoneCount >= this.state.maxUserDefinedZones || zones.length >= this.state.maxZones) {
            throw new StatusResponse.ResourceExhaustedError(
                `Zone limit reached with ${userZoneCount} of ${this.state.maxUserDefinedZones} user-defined zones and ${zones.length} of ${this.state.maxZones} zones`,
            );
        }

        this.#assertVertices(zone);

        const zoneId = this.#nextZoneId();
        this.state.zones = [
            ...zones,
            {
                zoneId,
                zoneType: ZoneManagement.ZoneType.TwoDcartZone,
                zoneSource: ZoneManagement.ZoneSource.User,
                twoDCartesianZone: zone,
            },
        ];
        this.state.lastZoneId = zoneId;
        return { zoneId };
    }

    override updateTwoDCartesianZone({ zoneId, zone }: ZoneManagement.UpdateTwoDCartesianZoneRequest) {
        const existing = this.#requireUserZone(zoneId);
        if (existing.zoneType !== ZoneManagement.ZoneType.TwoDcartZone) {
            throw new StatusResponse.DynamicConstraintErrorError(`Zone ${zoneId} is not a TwoD Cartesian zone`);
        }

        this.#assertFocusSupported(zone);
        this.#assertVertices(zone, zoneId);

        this.state.zones = this.state.zones.map(entry =>
            entry.zoneId === zoneId ? { ...entry, twoDCartesianZone: zone } : entry,
        );
    }

    override removeZone({ zoneId }: ZoneManagement.RemoveZoneRequest) {
        this.#requireUserZone(zoneId);
        if (this.state.triggers.some(trigger => trigger.zoneId === zoneId)) {
            throw new StatusResponse.InvalidInStateError(`Zone ${zoneId} is used by a trigger`);
        }

        this.state.zones = this.state.zones.filter(zone => zone.zoneId !== zoneId);
    }

    override createOrUpdateTrigger({ trigger }: ZoneManagement.CreateOrUpdateTriggerRequest) {
        const { zoneId, initialDuration, augmentationDuration, maxDuration, sensitivity } = trigger;

        if (initialDuration < 1 || augmentationDuration > initialDuration || maxDuration < initialDuration) {
            throw new StatusResponse.ConstraintErrorError(
                `Trigger durations are invalid: initial ${initialDuration}, augmentation ${augmentationDuration}, maximum ${maxDuration}`,
            );
        }

        if (this.features.perZoneSensitivity !== (sensitivity !== undefined)) {
            throw new StatusResponse.InvalidCommandError(
                this.features.perZoneSensitivity
                    ? "Trigger requires a sensitivity with the PerZoneSensitivity feature"
                    : "Trigger sensitivity requires the PerZoneSensitivity feature",
            );
        }
        if (sensitivity !== undefined && (sensitivity < 1 || sensitivity > this.state.sensitivityMax)) {
            throw new StatusResponse.ConstraintErrorError(
                `Trigger sensitivity ${sensitivity} is not between 1 and ${this.state.sensitivityMax}`,
            );
        }

        const zone = this.state.zones.find(entry => entry.zoneId === zoneId);
        if (zone === undefined) {
            throw new StatusResponse.NotFoundError(`Zone ${zoneId} does not exist`);
        }
        const use = zone.twoDCartesianZone?.use;
        if (use !== undefined && use !== ZoneManagement.ZoneUse.Motion) {
            throw new StatusResponse.ConstraintErrorError(`Zone ${zoneId} is not a motion zone`);
        }

        const { triggers } = this.state;
        this.state.triggers = triggers.some(entry => entry.zoneId === zoneId)
            ? triggers.map(entry => (entry.zoneId === zoneId ? trigger : entry))
            : [...triggers, trigger];
    }

    override removeTrigger({ zoneId }: ZoneManagement.RemoveTriggerRequest) {
        const { triggers } = this.state;
        if (!triggers.some(trigger => trigger.zoneId === zoneId)) {
            throw new StatusResponse.NotFoundError(`No trigger for zone ${zoneId}`);
        }

        this.state.triggers = triggers.filter(trigger => trigger.zoneId !== zoneId);
    }

    #assertUniqueZoneIds(zones: ZoneManagement.ZoneInformation[]) {
        const zoneIds = new Set<number>();
        for (const { zoneId } of zones) {
            if (zoneIds.has(zoneId)) {
                throw new ValidationError(`ZoneID ${zoneId} is not unique`);
            }
            zoneIds.add(zoneId);
        }
    }

    #requireUserZone(zoneId: number) {
        const zone = this.state.zones.find(entry => entry.zoneId === zoneId);
        if (zone === undefined) {
            throw new StatusResponse.NotFoundError(`Zone ${zoneId} does not exist`);
        }
        if (zone.zoneSource !== ZoneManagement.ZoneSource.User) {
            throw new StatusResponse.ConstraintErrorError(`Zone ${zoneId} is not a user-defined zone`);
        }
        return zone;
    }

    #assertFocusSupported({ use }: ZoneManagement.TwoDCartesianZone) {
        if (use === ZoneManagement.ZoneUse.Focus && !this.features.focusZones) {
            throw new StatusResponse.ConstraintErrorError("Focus zones require the FocusZones feature");
        }
    }

    /**
     * Refuse vertices beyond TwoDCartesianMax, a zone with the same use and vertices as a zone other than
     * `excludedZoneId`, and vertices that do not form a simple polygon.
     */
    #assertVertices({ use, vertices }: ZoneManagement.TwoDCartesianZone, excludedZoneId?: number) {
        const max = this.state.twoDCartesianMax;
        const outside = vertices.find(({ x, y }) => x > max.x || y > max.y);
        if (outside !== undefined) {
            throw new StatusResponse.DynamicConstraintErrorError(
                `Vertex (${outside.x}, ${outside.y}) is beyond TwoDCartesianMax (${max.x}, ${max.y})`,
            );
        }

        const duplicate = this.state.zones.find(
            ({ zoneId, twoDCartesianZone }) =>
                zoneId !== excludedZoneId &&
                twoDCartesianZone !== undefined &&
                twoDCartesianZone.use === use &&
                verticesEqual(twoDCartesianZone.vertices, vertices),
        );
        if (duplicate !== undefined) {
            throw new StatusResponse.AlreadyExistsError(
                `Zone ${duplicate.zoneId} already has the same use and vertices`,
            );
        }

        if (isSelfIntersecting(vertices)) {
            throw new StatusResponse.DynamicConstraintErrorError("Zone vertices do not form a simple polygon");
        }
    }

    /**
     * Use the ID after the last one this server assigned, skipping IDs in use, so that a new zone does not reuse the
     * ID of a zone that was just removed. Before this server has assigned an ID, continue after the highest ID in use,
     * because manufacturer zones count toward the same sequence.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 2.14.5.10
     */
    #nextZoneId() {
        const used = new Set(this.state.zones.map(({ zoneId }) => zoneId));
        let zoneId = this.state.lastZoneId ?? Math.max(-1, ...used);
        do {
            zoneId = zoneId >= MAX_ZONE_ID ? 0 : zoneId + 1;
        } while (used.has(zoneId));
        return zoneId;
    }
}

export namespace ZoneManagementBaseServer {
    export class State extends ZoneManagementBase.State {
        /**
         * The ID of the zone this server created last, so that the ID of a removed zone is not reused.
         */
        @field(uint16, nonvolatile)
        lastZoneId?: number;
    }
}

// Drop the features the base implementation enables internally so consumers select their own
export class ZoneManagementServer extends ZoneManagementBaseServer.with() {}

function verticesEqual(a: Vertex[], b: Vertex[]) {
    return a.length === b.length && a.every((vertex, index) => vertex.x === b[index].x && vertex.y === b[index].y);
}

/**
 * Whether the vertices do not form a simple polygon: edges that cross or overlap, a repeated vertex, or a triangle
 * whose vertices are collinear.
 *
 * A repeated vertex always makes the polygon not simple. Three vertices fail only when they are collinear. With more
 * vertices, any self-intersection includes two non-adjacent edges that share a point, so it is enough to check those
 * pairs.
 */
function isSelfIntersecting(vertices: Vertex[]) {
    const distinct = new Set(vertices.map(({ x, y }) => `${x},${y}`));
    if (distinct.size !== vertices.length) {
        return true;
    }

    const count = vertices.length;
    if (count === 3) {
        return orientation(vertices[0], vertices[1], vertices[2]) === 0;
    }

    for (let first = 0; first < count; first++) {
        // The edge that closes the loop is adjacent to the first edge
        const end = first === 0 ? count - 1 : count;
        for (let second = first + 2; second < end; second++) {
            if (
                segmentsIntersect(
                    vertices[first],
                    vertices[first + 1],
                    vertices[second],
                    vertices[(second + 1) % count],
                )
            ) {
                return true;
            }
        }
    }
    return false;
}

/**
 * The sign of the cross product of `pq` and `pr`: 1 or -1 for the two sides of the line through `p` and `q`, and 0
 * when `r` is on that line.
 */
function orientation(p: Vertex, q: Vertex, r: Vertex) {
    return Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
}

/**
 * Whether `r`, collinear with `pq`, lies within the bounding box of `pq` and therefore on the segment.
 */
function onSegment(p: Vertex, q: Vertex, r: Vertex) {
    return (
        r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y)
    );
}

function segmentsIntersect(p1: Vertex, q1: Vertex, p2: Vertex, q2: Vertex) {
    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);

    if (o1 !== o2 && o3 !== o4) {
        return true;
    }

    return (
        (o1 === 0 && onSegment(p1, q1, p2)) ||
        (o2 === 0 && onSegment(p1, q1, q2)) ||
        (o3 === 0 && onSegment(p2, q2, p1)) ||
        (o4 === 0 && onSegment(p2, q2, q1))
    );
}

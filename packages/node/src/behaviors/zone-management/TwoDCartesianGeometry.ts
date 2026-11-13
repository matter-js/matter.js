/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZoneManagement } from "@matter/types/clusters/zone-management";

type Vertex = ZoneManagement.TwoDCartesianVertex;

/**
 * Geometry checks for the vertices of a TwoD Cartesian zone.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 2.14.5.7
 */
export namespace TwoDCartesianGeometry {
    /**
     * Whether both lists hold the same vertices in the same order.
     */
    export function verticesEqual(a: Vertex[], b: Vertex[]) {
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
    export function isSelfIntersecting(vertices: Vertex[]) {
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

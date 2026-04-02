/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";
import type { ThreeLevelAuto } from "../globals/ThreeLevelAuto.js";

/**
 * Definitions for the ClosureDimension cluster.
 *
 * This cluster provides an interface for controlling a single degree of freedom (also referred to as a "dimension" or
 * an "axis" below) of a composed closure. This could be a degree of freedom in a 6-axis framework for the overall
 * closure or a panel in the closure, or some other degree of freedom.
 *
 * An instance of this cluster may represent position along a single axis, as specified by the FeatureMap, which can be
 * one of:
 *
 *   - Translation : panel translates along one axis
 *
 *   - Rotation : panel rotates around an axis of rotation
 *
 *   - Modulation : panel modifies its aspect to modulate a flow
 *
 * This cluster may also be used to latch or anchor a panel in a position, if the panel supports that.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 5.5
 */
export declare namespace ClosureDimension {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0105;

    /**
     * Textual cluster identifier.
     */
    export const name: "ClosureDimension";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ClosureDimension cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ClosureDimension} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the current Position, Latching and/or Speed, based on the feature flags set.
         *
         * A value of null shall indicate that:
         *
         *   - The position and latching state are both not known yet because the closure is not calibrated, or
         *
         *   - The product has lost its position and latching state after manual motion during a shutdown.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When the attribute changes from null to any other value and vice versa, or
         *
         *   - When the Position changes from null to any other value and vice versa, or
         *
         *   - At most once every 5 seconds when the Position changes from one non-null value to another non-null value,
         *     or
         *
         *   - When TargetState.Position is reached, or
         *
         *   - When CurrentState.Speed changes, or
         *
         *   - When CurrentState.Latch changes.
         *
         * The value of the different fields within the structure of this attribute depends on:
         *
         *   - The last SetTarget or Step commands.
         *
         *   - The impact of a MoveTo command received on the Closure Control Cluster instance associated with this
         *     cluster, if such a Closure Control instance exists, as described in Section 5.5.4, "Association Between
         *     Closure Control and Closure Dimension Clusters".
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.1
         */
        currentState: DimensionState | null;

        /**
         * Indicates the target Position, Latching and/or Speed, based on the feature flags set.
         *
         * A value of null shall indicate that the TargetState fields are unknown (typically after a reboot, no target
         * has been yet requested).
         *
         * Each field shall be present only when its corresponding feature is supported. If the feature is not supported
         * the field shall NOT be present.
         *
         * The value of TargetState.Position shall be set to a value that is an integer multiple of the Resolution
         * attribute.
         *
         * The value of the different fields within the structure of this attribute depends on:
         *
         *   - The last SetTarget or Step commands.
         *
         *   - The impact of a MoveTo command received on the Closure Control Cluster instance associated with this
         *     cluster, if such a Closure Control instance exists, as described in Section 5.5.4, "Association Between
         *     Closure Control and Closure Dimension Clusters".
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.2
         */
        targetState: DimensionState | null;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Positioning".
     */
    export interface PositioningAttributes {
        /**
         * Indicates the minimal acceptable change to the Position field of the TargetState and CurrentState attributes.
         *
         * Resolution should not be confused with an accuracy, such as Current = Target +/- Accuracy. This cluster does
         * not provide accuracy.
         *
         * Resolution gives a collection of valid Current position points over a linear ruler.
         *
         * > [!NOTE]
         *
         * > NOTE: A resolution of 100% means that the associated dimension cannot be placed in an intermediate position
         *   - its position is binary.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.3
         */
        resolution: number;

        /**
         * Indicates the size of a single step, expressed in percent100ths. When the Step command is used, each step
         * changes the position by this amount. The value of this attribute shall be an integer multiple of the
         * Resolution attribute.
         *
         * > [!NOTE]
         *
         * > NOTE: The StepValue should be large enough to cause a visible change in the closure's position when a Step
         *   command is invoked.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.4
         */
        stepValue: number;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Unit".
     */
    export interface UnitAttributes {
        /**
         * Indicates the unit related to the Position.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.5
         */
        unit: ClosureUnit;

        /**
         * Indicates the minimum and the maximum values expressed by Position following the unit indicated by "Unit".
         *
         * The value of this attribute may be null if the product has not been set up.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.6
         */
        unitRange: UnitRange | null;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Limitation".
     */
    export interface LimitationAttributes {
        /**
         * Indicates the range of possible values for the Position field in the CurrentState attribute.
         *
         * This range may evolve dynamically.
         *
         * LimitRange.Min and LimitRange.Max shall be equal to an integer multiple of the Resolution attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.7
         */
        limitRange: RangePercent100ths;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Translation".
     */
    export interface TranslationAttributes {
        /**
         * Indicates the direction of the translation.
         *
         * A properly configured closure dimension SHOULD reflect as best as possible the translation as seen by the
         * user. This attribute is not supposed to change once the installation is finalized.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.8
         */
        translationDirection: TranslationDirection;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Rotation".
     */
    export interface RotationAttributes {
        /**
         * Indicates the axis of the rotation.
         *
         * A properly configured closure dimension SHOULD reflect as best as possible the rotation axis as perceived by
         * the user. This attribute is not supposed to change once the installation is finalized.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.9
         */
        rotationAxis: RotationAxis;

        /**
         * Indicates the overflow related to Rotation(RO).
         *
         * A closure that rotates following an axis (with Rotation(RO) feature declared in FeatureMap), could overflow
         * Inside and/or Outside. If the axis is centered, one part goes Outside and the other part goes Inside. In this
         * case, this attribute shall use Top/Bottom/Left/Right Inside or Top/Bottom/Left/Right Outside enumerated
         * value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.10
         */
        overflow: Overflow;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Modulation".
     */
    export interface ModulationAttributes {
        /**
         * Indicates the modulation type related to Modulation(MD).
         *
         * The server SHOULD reflect, as best as possible, the modulation type as perceived by the user. This attribute
         * is not supposed to change once the installation is finalized.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.11
         */
        modulationType: ModulationType;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "MotionLatching".
     */
    export interface MotionLatchingAttributes {
        /**
         * This attribute shall specify whether the latch mechanism can be latched or unlatched remotely.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.12
         */
        latchControlModes: LatchControlModes;
    }

    /**
     * Attributes that may appear in {@link ClosureDimension}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current Position, Latching and/or Speed, based on the feature flags set.
         *
         * A value of null shall indicate that:
         *
         *   - The position and latching state are both not known yet because the closure is not calibrated, or
         *
         *   - The product has lost its position and latching state after manual motion during a shutdown.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When the attribute changes from null to any other value and vice versa, or
         *
         *   - When the Position changes from null to any other value and vice versa, or
         *
         *   - At most once every 5 seconds when the Position changes from one non-null value to another non-null value,
         *     or
         *
         *   - When TargetState.Position is reached, or
         *
         *   - When CurrentState.Speed changes, or
         *
         *   - When CurrentState.Latch changes.
         *
         * The value of the different fields within the structure of this attribute depends on:
         *
         *   - The last SetTarget or Step commands.
         *
         *   - The impact of a MoveTo command received on the Closure Control Cluster instance associated with this
         *     cluster, if such a Closure Control instance exists, as described in Section 5.5.4, "Association Between
         *     Closure Control and Closure Dimension Clusters".
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.1
         */
        currentState: DimensionState | null;

        /**
         * Indicates the target Position, Latching and/or Speed, based on the feature flags set.
         *
         * A value of null shall indicate that the TargetState fields are unknown (typically after a reboot, no target
         * has been yet requested).
         *
         * Each field shall be present only when its corresponding feature is supported. If the feature is not supported
         * the field shall NOT be present.
         *
         * The value of TargetState.Position shall be set to a value that is an integer multiple of the Resolution
         * attribute.
         *
         * The value of the different fields within the structure of this attribute depends on:
         *
         *   - The last SetTarget or Step commands.
         *
         *   - The impact of a MoveTo command received on the Closure Control Cluster instance associated with this
         *     cluster, if such a Closure Control instance exists, as described in Section 5.5.4, "Association Between
         *     Closure Control and Closure Dimension Clusters".
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.2
         */
        targetState: DimensionState | null;

        /**
         * Indicates the minimal acceptable change to the Position field of the TargetState and CurrentState attributes.
         *
         * Resolution should not be confused with an accuracy, such as Current = Target +/- Accuracy. This cluster does
         * not provide accuracy.
         *
         * Resolution gives a collection of valid Current position points over a linear ruler.
         *
         * > [!NOTE]
         *
         * > NOTE: A resolution of 100% means that the associated dimension cannot be placed in an intermediate position
         *   - its position is binary.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.3
         */
        resolution: number;

        /**
         * Indicates the size of a single step, expressed in percent100ths. When the Step command is used, each step
         * changes the position by this amount. The value of this attribute shall be an integer multiple of the
         * Resolution attribute.
         *
         * > [!NOTE]
         *
         * > NOTE: The StepValue should be large enough to cause a visible change in the closure's position when a Step
         *   command is invoked.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.4
         */
        stepValue: number;

        /**
         * Indicates the unit related to the Position.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.5
         */
        unit: ClosureUnit;

        /**
         * Indicates the minimum and the maximum values expressed by Position following the unit indicated by "Unit".
         *
         * The value of this attribute may be null if the product has not been set up.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.6
         */
        unitRange: UnitRange | null;

        /**
         * Indicates the range of possible values for the Position field in the CurrentState attribute.
         *
         * This range may evolve dynamically.
         *
         * LimitRange.Min and LimitRange.Max shall be equal to an integer multiple of the Resolution attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.7
         */
        limitRange: RangePercent100ths;

        /**
         * Indicates the direction of the translation.
         *
         * A properly configured closure dimension SHOULD reflect as best as possible the translation as seen by the
         * user. This attribute is not supposed to change once the installation is finalized.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.8
         */
        translationDirection: TranslationDirection;

        /**
         * Indicates the axis of the rotation.
         *
         * A properly configured closure dimension SHOULD reflect as best as possible the rotation axis as perceived by
         * the user. This attribute is not supposed to change once the installation is finalized.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.9
         */
        rotationAxis: RotationAxis;

        /**
         * Indicates the overflow related to Rotation(RO).
         *
         * A closure that rotates following an axis (with Rotation(RO) feature declared in FeatureMap), could overflow
         * Inside and/or Outside. If the axis is centered, one part goes Outside and the other part goes Inside. In this
         * case, this attribute shall use Top/Bottom/Left/Right Inside or Top/Bottom/Left/Right Outside enumerated
         * value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.10
         */
        overflow: Overflow;

        /**
         * Indicates the modulation type related to Modulation(MD).
         *
         * The server SHOULD reflect, as best as possible, the modulation type as perceived by the user. This attribute
         * is not supposed to change once the installation is finalized.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.11
         */
        modulationType: ModulationType;

        /**
         * This attribute shall specify whether the latch mechanism can be latched or unlatched remotely.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.7.12
         */
        latchControlModes: LatchControlModes;
    }

    /**
     * {@link ClosureDimension} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to move a dimension of the closure to a target position.
         *
         * The rationale behind defining the conformance as being purely optional in the table above is to ensure that
         * commands containing one or more fields related to unsupported features are still accepted, rather than being
         * rejected outright. For example, if a simple client, which is not able to determine the capabilities of the
         * server, invokes a command that includes both position and speed, a server that does not support the speed
         * feature would simply ignore the speed field while still adjusting its position as requested.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.1
         */
        setTarget(request: SetTargetRequest): MaybePromise;
    }

    /**
     * {@link ClosureDimension} supports these elements if it supports feature "Positioning".
     */
    export interface PositioningCommands {
        /**
         * This command is used to move a dimension of the closure to a target position by a number of steps.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.2
         */
        step(request: StepRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ClosureDimension}.
     */
    export interface Commands extends
        BaseCommands,
        PositioningCommands
    {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { positioning: true }, attributes: PositioningAttributes, commands: PositioningCommands },
        { flags: { unit: true }, attributes: UnitAttributes },
        { flags: { limitation: true }, attributes: LimitationAttributes },
        { flags: { translation: true }, attributes: TranslationAttributes },
        { flags: { rotation: true }, attributes: RotationAttributes },
        { flags: { modulation: true }, attributes: ModulationAttributes },
        { flags: { motionLatching: true }, attributes: MotionLatchingAttributes }
    ];

    export type Features = "Positioning" | "MotionLatching" | "Unit" | "Limitation" | "Speed" | "Translation" | "Rotation" | "Modulation";

    /**
     * These are optional features supported by ClosureDimensionCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.5
     */
    export enum Feature {
        /**
         * Positioning (PS)
         *
         * This feature shall indicate support for position percentage over the range of 0.00% to 100.00%, with a
         * resolution of 0.01%.
         *
         * > [!NOTE]
         *
         * > NOTE: In most of the products 0.00% = fully opened and 100.00% = fully closed but this is not always the
         *   case. For example, if the Modulation feature is supported and the ModulationType is SlatsOrientation or
         *   StripesAlignment, the panel can be fully closed at 0.00% and 100.00%, and be fully opened at 50.00%.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.1
         */
        Positioning = "Positioning",

        /**
         * MotionLatching (LT)
         *
         * This feature shall indicate that the closure can be latched and unlatched. An axis with the MotionLatching
         * feature has capabilities that will prevent actuators from moving along parts of that axis if the dimension is
         * latched.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.2
         */
        MotionLatching = "MotionLatching",

        /**
         * Unit (UT)
         *
         * This feature shall indicate additional information about the closure dimension's possible range of movement.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.3
         */
        Unit = "Unit",

        /**
         * Limitation (LM)
         *
         * This feature shall indicate that the closure dimension supports degradation of its functioning. Reachable
         * Position range may be limited compared to full scope of a nominal behavior.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.4
         */
        Limitation = "Limitation",

        /**
         * Speed (SP)
         *
         * This feature shall indicate that the closure dimension can be driven at different speed levels: Low, Medium,
         * and High. Please refer to Section 5.4.5.4, "Speed Feature" for more details.
         *
         * > [!NOTE]
         *
         * > NOTE: The server might not support three different speed values. The manufacturer shall select speed values
         *   linked to Low, Medium and High such that Low $<=$ Medium $<=$ High.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.5
         */
        Speed = "Speed",

        /**
         * Translation (TR)
         *
         * This feature shall indicate that the panel can move along a single axis. The possible directions include
         * downward, upward, leftward, rightward, forward, and backward. The Translation feature is used to control the
         * position of the panel along the specified axis.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.6
         */
        Translation = "Translation",

        /**
         * Rotation (RO)
         *
         * This feature shall indicate that the panel can rotate around a single axis. The possible axes include left,
         * right, top, bottom, centered vertical, and centered horizontal. The Rotation feature is used to control the
         * orientation of the panel around the specified axis.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.7
         */
        Rotation = "Rotation",

        /**
         * Modulation (MD)
         *
         * This feature shall indicate that the panel can modify its aspect to control a particular flow, such as light,
         * air, or privacy. The possible modulation types include slats orientation, slats openwork, stripes alignment,
         * opacity, and ventilation. The Modulation feature is used to adjust the panel's properties to achieve the
         * desired effect.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.5.8
         */
        Modulation = "Modulation"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.9
     */
    export declare class DimensionState {
        constructor(values?: Partial<DimensionState>);

        /**
         * This field shall indicate the position of the closure, expressed as a percentage from 0.00% to 100.00%.
         *
         * A null value indicates that the position is not known or is not set.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.9.1
         */
        position?: number | null;

        /**
         * This field shall indicate the latching state of the closure, as defined in the OverallCurrentStateStruct
         * Latch Field.
         *
         * A null value indicates that the latch is not known or is not set.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.9.2
         */
        latch?: boolean | null;

        /**
         * This field shall indicate the current speed of the closure, as defined in the ThreeLevelAutoEnum.
         *
         * If no speed value has yet been set, the server shall select and set one of the speed values defined in the
         * ThreeLevelAutoEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.9.3
         */
        speed?: ThreeLevelAuto;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.5
     */
    export enum ClosureUnit {
        /**
         * Millimeter used as unit
         */
        Millimeter = 0,

        /**
         * Degree used as unit
         */
        Degree = 1
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.8
     */
    export declare class UnitRange {
        constructor(values?: Partial<UnitRange>);
        min: number;
        max: number;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.7
     */
    export declare class RangePercent100ths {
        constructor(values?: Partial<RangePercent100ths>);
        min: number;
        max: number;
    };

    /**
     * ### Legend: !legendOpen Open !legendClosed Closed
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.1
     */
    export enum TranslationDirection {
        /**
         * Downward translation
         */
        Downward = 0,

        /**
         * Upward translation
         */
        Upward = 1,

        /**
         * Vertical mask translation
         */
        VerticalMask = 2,

        /**
         * Vertical symmetry translation
         */
        VerticalSymmetry = 3,

        /**
         * Leftward translation
         */
        Leftward = 4,

        /**
         * Rightward translation
         */
        Rightward = 5,

        /**
         * Horizontal mask translation
         */
        HorizontalMask = 6,

        /**
         * Horizontal symmetry translation
         */
        HorizontalSymmetry = 7,

        /**
         * Forward translation
         */
        Forward = 8,

        /**
         * Backward translation
         */
        Backward = 9,

        /**
         * Depth mask translation
         */
        DepthMask = 10,

        /**
         * Depth symmetry translation
         */
        DepthSymmetry = 11
    }

    /**
     * ### Legend: !legendOpen Open !legendClosed Closed
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.2
     */
    export enum RotationAxis {
        /**
         * The panel rotates around a vertical axis located on the left side of the panel
         */
        Left = 0,

        /**
         * The panel rotates around a vertical axis located in the center of the panel
         */
        CenteredVertical = 1,

        /**
         * The panels rotates around vertical axes located on the left and right sides of the panel
         */
        LeftAndRight = 2,

        /**
         * The panel rotates around a vertical axis located on the right side of the panel
         */
        Right = 3,

        /**
         * The panel rotates around a horizontal axis located on the top of the panel
         */
        Top = 4,

        /**
         * The panel rotates around a horizontal axis located in the center of the panel
         */
        CenteredHorizontal = 5,

        /**
         * The panels rotates around horizontal axes located on the top and bottom of the panel
         */
        TopAndBottom = 6,

        /**
         * The panel rotates around a horizontal axis located on the bottom of the panel
         */
        Bottom = 7,

        /**
         * The barrier tilts around an axis located at the left end of the barrier
         */
        LeftBarrier = 8,

        /**
         * The dual barriers tilt around axes located at each side of the composite barrier
         */
        LeftAndRightBarriers = 9,

        /**
         * The barrier tilts around an axis located at the right end of the barrier
         */
        RightBarrier = 10
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.3
     */
    export enum Overflow {
        /**
         * No overflow
         */
        NoOverflow = 0,

        /**
         * Inside overflow
         */
        Inside = 1,

        /**
         * Outside overflow
         */
        Outside = 2,

        /**
         * Top inside overflow
         */
        TopInside = 3,

        /**
         * Top outside overflow
         */
        TopOutside = 4,

        /**
         * Bottom inside overflow
         */
        BottomInside = 5,

        /**
         * Bottom outside overflow
         */
        BottomOutside = 6,

        /**
         * Left inside overflow
         */
        LeftInside = 7,

        /**
         * Left outside overflow
         */
        LeftOutside = 8,

        /**
         * Right inside overflow
         */
        RightInside = 9,

        /**
         * Right outside overflow
         */
        RightOutside = 10
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.4
     */
    export enum ModulationType {
        /**
         * Orientation of the slats
         */
        SlatsOrientation = 0,

        /**
         * Aperture of the slats
         */
        SlatsOpenwork = 1,

        /**
         * Alignment of blind stripes (Zebra)
         */
        StripesAlignment = 2,

        /**
         * Opacity of a surface
         */
        Opacity = 3,

        /**
         * Ventilation control
         */
        Ventilation = 4
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.10
     */
    export declare class LatchControlModes {
        constructor(values?: Partial<LatchControlModes> | number);

        /**
         * Remote latching capability
         *
         * This bit shall indicate whether the latch supports remote latching or not:
         *
         *   - 0 = the latch can only be latched through manual, physical operation.
         *
         *   - 1 = the latch can be latched via remote control (e.g., electronic or remote actuation).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.10.1
         */
        remoteLatching?: boolean;

        /**
         * Remote unlatching capability
         *
         * This bit shall indicate whether the latch supports remote unlatching or not:
         *
         *   - 0 = the latch can only be unlatched through manual, physical operation.
         *
         *   - 1 = the latch can be unlatched via remote control (e.g., electronic or remote actuation).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.10.2
         */
        remoteUnlatching?: boolean;
    };

    /**
     * This command is used to move a dimension of the closure to a target position.
     *
     * The rationale behind defining the conformance as being purely optional in the table above is to ensure that
     * commands containing one or more fields related to unsupported features are still accepted, rather than being
     * rejected outright. For example, if a simple client, which is not able to determine the capabilities of the
     * server, invokes a command that includes both position and speed, a server that does not support the speed feature
     * would simply ignore the speed field while still adjusting its position as requested.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.1
     */
    export declare class SetTargetRequest {
        constructor(values?: Partial<SetTargetRequest>);

        /**
         * This field shall indicate the position where the closure is moving to.
         *
         * If the field is present but its value is not within constraints, then:
         *
         *   - If the Positioning (PS) feature is not supported, the value of this field shall be ignored.
         *
         *   - If the Positioning (PS) feature is supported, a status code of CONSTRAINT_ERROR shall be returned.
         *
         * If the Positioning (PS) feature is supported and the Position field is not present, the closure shall use the
         * value of the Position field in the TargetState attribute as the fallback. If the Position field in the
         * TargetState attribute is NULL, the position is unknown and the fallback is not applicable, in this case the
         * field shall be ignored and the closure shall NOT change its position.
         *
         * When the closure supports the Positioning(PS) feature:
         *
         * If a new position value is requested, the closure shall set the Position field of the TargetState attribute
         * to the nearest valid position (an integer multiple of the Resolution attribute), whether by rounding the
         * requested value or using it directly if already valid, and then initiate the motion procedure.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.1.1
         */
        position?: number;

        /**
         * This field shall indicate the desired latching state of the closure, as defined in the
         * OverallCurrentStateStruct Latch Field.
         *
         * If the field is present but its value is not within constraints, then:
         *
         *   - If the MotionLatching (LT) feature is not supported, the value of this field shall be ignored.
         *
         *   - If the MotionLatching (LT) feature is supported, a status code of CONSTRAINT_ERROR shall be returned.
         *
         * If the MotionLatching (LT) feature is supported and the Latch field is not present, the closure shall use the
         * value of the Latch field in the TargetState attribute as the fallback. If the Latch field in the TargetState
         * attribute is NULL, the latch state is unknown and the fallback is not applicable, in this case, the field
         * shall be ignored and the closure shall NOT change its latch state.
         *
         * If the server supports the MotionLatching (LT) feature, it shall either fulfill the latch request and update
         * TargetState.Latch, or - if the "LatchControlModes" attribute specifies that manual intervention is required
         * to latch - respond with INVALID_IN_STATE and remain in its current state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.1.2
         */
        latch?: boolean;

        /**
         * This field shall indicate a desired overall speed of motion, as defined in the ThreeLevelAutoEnum.
         *
         * If the field is present but its value is not within constraints, then:
         *
         *   - If the Speed(SP) feature is not supported, the value of this field shall be ignored.
         *
         *   - If the Speed(SP) feature is supported, a status code of CONSTRAINT_ERROR shall be returned.
         *
         * If the Speed (SP) feature is supported, the TargetState.Speed attribute shall be updated with the value of
         * the Speed field.
         *
         * A closure dimension SHOULD attempt to follow the indicated Speed value as closely as possible (meant to
         * override its default speed).
         *
         * If a SetTarget command is sent with only the Speed field:
         *
         *   - It SHOULD adjust the speed of the ongoing motion of the closure (i.e., allow speed change on the fly).
         *
         *     > [!NOTE]
         *
         *     > NOTE: The internal default speed shall not be affected by this command field. The priorities and cross
         *       capabilities to achieve, skip or ignore Position + Latch + Speed combinations are product/manufacturer
         *       specific. If the Limitation feature is supported, the closure will automatically offset the
         *       TargetState.Position value to fit within LimitRange.Min and LimitRange.Max.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.1.3
         */
        speed?: ThreeLevelAuto;
    };

    /**
     * This command is used to move a dimension of the closure to a target position by a number of steps.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.2
     */
    export declare class StepRequest {
        constructor(values?: Partial<StepRequest>);

        /**
         * This field shall indicate whether the Position field of the TargetState attribute must be:
         *
         *   - Increased toward 100.00%.
         *
         *   - Decreased toward 0.00%.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.2.1
         */
        direction: StepDirection;

        /**
         * This field shall indicate the number of steps by which the position should be changed. The size of one step,
         * expressed in percent100ths, is determined by the "StepValue" attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.2.2
         */
        numberOfSteps: number;

        /**
         * This field shall indicate the desired speed of motion.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.5.8.2.3
         */
        speed?: ThreeLevelAuto;
    };

    /**
     * This data type is derived from enum8 and used for the Step command to indicate the direction of the steps.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.5.6.6
     */
    export enum StepDirection {
        /**
         * Decrease towards 0.00%
         */
        Decrease = 0,

        /**
         * Increase towards 100.00%
         */
        Increase = 1
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ClosureDimension}.
     */
    export const Cluster: typeof ClosureDimension;

    /**
     * @deprecated Use {@link ClosureDimension}.
     */
    export const Complete: typeof ClosureDimension;

    export const Typing: ClosureDimension;
}

/**
 * @deprecated Use {@link ClosureDimension}.
 */
export declare const ClosureDimensionCluster: typeof ClosureDimension;

export interface ClosureDimension extends ClusterTyping {
    Attributes: ClosureDimension.Attributes;
    Commands: ClosureDimension.Commands;
    Features: ClosureDimension.Features;
    Components: ClosureDimension.Components;
}

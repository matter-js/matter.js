/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * Namespace
 *
 * The Namespace type identifies the namespace used for a semantic tag.
 *
 * @see {@link MatterSpecification.v142.Core} § 7.19.2.47
 */
export enum Namespace {
    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * feature of a Closure, e.g. the button to activate opening a garage door.
     *
     * > [!NOTE]
     *
     * > This namespace has been deprecated as of Matter 1.4.2.
     *
     * Clients SHOULD still have support for these tags, since the tags could be used by a server certified on a
     * previous revision of Matter.
     */
    Closure = 1,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * movement into a certain compass direction. Note the difference with Chapter 4, Common Compass Location Semantic
     * Tag Namespace.
     */
    CompassDirection = 2,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * position in a certain compass direction (e.g. an outdoor sensor in the North garden). Note the difference with
     * Chapter 3, Common Compass Direction Semantic Tag Namespace.
     */
    CompassLocation = 3,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * movement in a certain direction relative to the device. Note the difference with Chapter 9, Common Position
     * Semantic Tag Namespace.
     */
    Direction = 4,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * certain level for a feature of a device (e.g. a button to set the speed of a fan).
     */
    Level = 5,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * location of a device (e.g. an outdoor temperature sensor).
     */
    Location = 6,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * certain numeric feature of a device (e.g. a numeric input button).
     */
    Number = 7,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * position relative to the device (e.g. the temperature sensor in the top drawer of a refrigerator, or location of
     * the buttons on a multi-button switch device). Note the difference with Chapter 5, Common Direction Semantic Tag
     * Namespace.
     *
     * When multiple endpoints are used for device types, and the associated consumer-facing locations of those
     * endpoints are organized in a straight line, grid or matrix, these endpoints SHOULD be allocated in top-to-bottom,
     * left-to-right order.
     *
     * For grids or arrays larger than 3 elements in any direction, the Row and Column tags SHOULD be used.
     *
     * If the Row or Column tags are used, the Label field in the same Semantic Tag structure shall be filled with a
     * number comprised of Arabic numerals encoded as a string to indicate the row/column of the item. Number words
     * (e.g. "one", "two", etc.) shall NOT be used to describe the position of the item. The first row/column shall use
     * Label "1".
     *
     * The following example illustrates a compound device comprised of 9 endpoints arranged in a 3x3 grid. This example
     * uses position tags to indicate position.
     */
    Position = 8,

    /**
     * The tags contained in this namespace are restricted for use in the electrical measurement domain and shall NOT be
     * used in any other domain or context.
     */
    ElectricalMeasurement = 10,

    /**
     * The tags contained in this namespace are restricted for use in the laundry domain and shall NOT be used in any
     * other domain or context.
     */
    Laundry = 14,

    /**
     * The tags contained in this namespace are restricted for use in the power source domain and shall NOT be used in
     * any other domain or context.
     */
    PowerSource = 15,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with an
     * indoor or outdoor area of a home.
     */
    AreaNamespace = 16,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a home
     * landmark.
     */
    LandmarkNamespace = 17,

    /**
     * The tags contained in this namespace may be used in any domain or context, to indicate an association with a
     * position relative to some reference, which must be specified by the user of these tags. For example, the position
     * may be relative to a household item, such as a dining table, and the user of these tags must indicate that. Note
     * the difference with Chapter 9, Common Position Semantic Tag Namespace, which contains tags indicating the
     * position relative to the device.
     */
    RelativePosition = 18,

    /**
     * The tags contained in this namespace are restricted for use in the refrigerator domain and shall NOT be used in
     * any other domain or context.
     */
    Refrigerator = 65,

    /**
     * The tags contained in this namespace are restricted for use in the room air conditioner domain and shall NOT be
     * used in any other domain or context.
     */
    RoomAirConditioner = 66,

    /**
     * The tags contained in this namespace are restricted for use in the switches domain and shall NOT be used in any
     * other domain or context. They are intended to indicate the function of a button on a switch device to allow a
     * client to make an optimized user interface which matches the actual device without requiring a-priori knowledge
     * of the layout of each specific switch device.
     *
     * See the rules for applying these and other tags for switch devices, e.g. from the Common Position Namespace and
     * the Common Number Namespace in the Generic Switch device type section in the Device Library.
     */
    Switches = 67
}

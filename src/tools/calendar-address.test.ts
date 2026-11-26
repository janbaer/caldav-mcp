import { describe, expect, it } from "vitest";
import {
	assertOrganizerForAttendees,
	emailAddressOrEmptySchema,
	emailAddressSchema,
	readScheduling,
} from "./calendar-address.js";

describe("emailAddressSchema", () => {
	it.each([
		"name@example.com",
		"first.last+tag@sub.example.org",
		"user@localhost",
		"jürgen@example.de",
	])("accepts %s", (value) => {
		expect(emailAddressSchema.safeParse(value).success).toBe(true);
	});

	it.each([
		[
			"a line break that would add a property",
			"a@b.com\r\nATTENDEE:mailto:evil@x.com",
		],
		["a bare line feed", "a@b.com\nX-FOO:bar"],
		["a mailto: prefix", "mailto:a@b.com"],
		["a display name", "Bob <bob@example.com>"],
		["whitespace", "bob @example.com"],
		["two addresses", "a@b.com,c@d.com"],
		["no @", "example.com"],
		["an empty string", ""],
	])("rejects %s", (_label, value) => {
		expect(emailAddressSchema.safeParse(value).success).toBe(false);
	});
});

describe("emailAddressOrEmptySchema", () => {
	it("accepts an empty string and a plain address", () => {
		expect(emailAddressOrEmptySchema.safeParse("").success).toBe(true);
		expect(emailAddressOrEmptySchema.safeParse("a@b.com").success).toBe(true);
	});

	it("rejects a line break", () => {
		expect(
			emailAddressOrEmptySchema.safeParse("a@b.com\r\nX-FOO:bar").success
		).toBe(false);
	});
});

describe("readScheduling", () => {
	it("returns nothing for an event without custom fields", () => {
		expect(readScheduling(undefined)).toEqual({
			attendees: [],
			organizer: undefined,
		});
	});

	it("strips mailto: from a single attendee stored as a string", () => {
		expect(
			readScheduling({
				attendee: "mailto:bob@example.com",
				organizer: "MAILTO:alice@example.com",
			})
		).toEqual({
			attendees: ["bob@example.com"],
			organizer: "alice@example.com",
		});
	});

	it("reads several attendees stored as an array", () => {
		expect(
			readScheduling({
				attendee: ["mailto:a@example.com", "mailto:b@example.com"],
			}).attendees
		).toEqual(["a@example.com", "b@example.com"]);
	});
});

describe("assertOrganizerForAttendees", () => {
	it("throws when there are attendees but no organizer", () => {
		expect(() => assertOrganizerForAttendees(undefined, ["a@b.com"])).toThrow(
			"attendees need an organizer"
		);
		expect(() => assertOrganizerForAttendees("", ["a@b.com"])).toThrow(
			"attendees need an organizer"
		);
	});

	it("allows an organizer alone, both, or neither", () => {
		expect(() => assertOrganizerForAttendees("o@b.com", [])).not.toThrow();
		expect(() =>
			assertOrganizerForAttendees("o@b.com", ["a@b.com"])
		).not.toThrow();
		expect(() => assertOrganizerForAttendees(undefined, [])).not.toThrow();
	});
});

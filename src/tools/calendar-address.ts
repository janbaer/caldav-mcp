import { z } from "zod";

// ORGANIZER and ATTENDEE values are written verbatim into the ICS, so an
// address must not carry anything that changes the line's structure: line
// breaks (which would start new properties), whitespace, ":" (so a `mailto:`
// prefix is rejected instead of doubled) or display-name syntax. Deliberately
// looser than `z.email()`, which rejects `user@localhost` and non-ASCII
// addresses that self-hosted servers accept.
const ADDRESS_PART = String.raw`[^\s\p{Cc}@:<>",;]+`;
const ADDRESS = new RegExp(`^${ADDRESS_PART}@${ADDRESS_PART}$`, "u");
const ADDRESS_OR_EMPTY = new RegExp(
	`^(?:${ADDRESS_PART}@${ADDRESS_PART})?$`,
	"u"
);
const MAILTO_PREFIX = /^mailto:/iu;
const ADDRESS_MESSAGE =
	"Expected a plain email address such as name@example.com (no mailto:, no display name)";

export const emailAddressSchema = z
	.string()
	.regex(ADDRESS, { message: ADDRESS_MESSAGE });

// update-event takes "" to remove the stored organizer.
export const emailAddressOrEmptySchema = z
	.string()
	.regex(ADDRESS_OR_EMPTY, { message: ADDRESS_MESSAGE });

export function toCalAddress(email: string): string {
	return `mailto:${email}`;
}

function fromCalAddress(value: string): string {
	return value.replace(MAILTO_PREFIX, "");
}

type CustomFields = Record<string, string | string[]> | undefined;

function asList(value: string | string[] | undefined): string[] {
	if (value === undefined) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

// ts-caldav keeps properties it doesn't model in `customFields`, keyed by the
// lowercase property name; a repeated property becomes an array.
export function readScheduling(customFields: CustomFields): {
	attendees: string[];
	organizer: string | undefined;
} {
	const [organizer] = asList(customFields?.organizer);
	return {
		attendees: asList(customFields?.attendee).map(fromCalAddress),
		organizer: organizer === undefined ? undefined : fromCalAddress(organizer),
	};
}

// RFC 5545 requires ORGANIZER on any event that has ATTENDEE properties, and
// without one a scheduling server sends no invitations.
export function assertOrganizerForAttendees(
	organizer: string | undefined,
	attendees: readonly string[]
): void {
	if (attendees.length > 0 && !organizer) {
		throw new Error(
			"attendees need an organizer: pass `organizer` (the address the invitations come from) or remove the attendees"
		);
	}
}

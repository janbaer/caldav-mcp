import { z } from "zod";

const EXAMPLE = "2026-05-01T09:00:00+02:00";
const strictDateTime = z.iso.datetime({ offset: true });

/**
 * An ISO 8601 datetime with an offset (`Z` or `±hh:mm`), checked by a
 * `refine` rather than `.datetime()`: zod emits `.datetime()` as a long regex
 * `pattern` in the JSON Schema, which grammar-constrained clients such as
 * llama.cpp fail to compile (issue #171). A `refine` is not exported, so the
 * advertised schema is a plain string and the description is the only format
 * hint.
 */
export const isoDateTime = (description: string) =>
	z
		.string()
		.refine((value) => strictDateTime.safeParse(value).success, {
			message: `Invalid datetime, expected ISO 8601 with an offset, e.g. ${EXAMPLE}`,
		})
		.describe(
			`${description} (ISO 8601 with an offset, e.g. ${EXAMPLE} or 2026-05-01T07:00:00Z)`
		);

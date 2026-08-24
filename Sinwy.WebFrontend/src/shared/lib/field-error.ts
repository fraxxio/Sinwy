/**
 * When a field is allowed to complain. Nothing shows while someone is still
 * typing their first answer: an error appears once they leave the field, or as
 * soon as they try to submit.
 */
export function fieldErrorState({
	isBlurred,
	submissionAttempts,
	errors,
	value,
}: {
	isBlurred: boolean;
	submissionAttempts: number;
	errors: { message?: string | undefined }[];
	value: string;
}) {
	const revealed = isBlurred || submissionAttempts > 0;
	const error = revealed ? errors[0]?.message : undefined;

	return { error, valid: revealed && !error && !!value };
}

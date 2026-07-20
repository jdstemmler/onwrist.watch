import type { SubmitFunction } from '@sveltejs/kit';

/** Wraps a `use:enhance` submit function so the submitting button is
 * disabled and marked `aria-busy` while the request is in flight — over a
 * slow link the default leaves "Put On"/"Create account" fully re-clickable
 * with zero feedback. Composes with an inner submit function and stays inert
 * if the inner function cancels the submission. */
export function withPending(inner?: SubmitFunction): SubmitFunction {
	return (input) => {
		let cancelled = false;
		const innerResult = inner?.({
			...input,
			cancel: () => {
				cancelled = true;
				input.cancel();
			}
		});
		if (cancelled) return;

		const button =
			input.submitter instanceof HTMLButtonElement
				? input.submitter
				: input.formElement.querySelector<HTMLButtonElement>('button[type="submit"]');
		button?.setAttribute('disabled', '');
		button?.setAttribute('aria-busy', 'true');

		return async (opts) => {
			button?.removeAttribute('disabled');
			button?.removeAttribute('aria-busy');
			const innerCallback = await innerResult;
			if (typeof innerCallback === 'function') await innerCallback(opts);
			else await opts.update();
		};
	};
}

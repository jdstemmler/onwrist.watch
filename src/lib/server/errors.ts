/** Domain state-machine / validation violation → 409 (or the given status)
 * with a human-readable message, shown verbatim as a dashboard toast — write
 * messages for a phone-sized screen. */
export class StateError extends Error {
	status: number;
	constructor(message: string, status = 409) {
		super(message);
		this.status = status;
	}
}

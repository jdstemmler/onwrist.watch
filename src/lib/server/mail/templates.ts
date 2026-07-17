import type { Mail } from './index';
import { config } from '../config';

/** Sent on signup (and resend) to confirm the address. */
export function verifyEmail(to: string, token: string): Mail {
	const link = `${config.origin}/verify?token=${token}`;
	return {
		to,
		subject: `Verify your ${config.appName} email`,
		text: `Tap the link below to verify your email and finish setting up ${config.appName}.\n\n${link}\n\nDidn't sign up? Ignore this email.`
	};
}

/** Sent after a password-reset request. */
export function resetEmail(to: string, token: string): Mail {
	const link = `${config.origin}/reset/confirm?token=${token}`;
	return {
		to,
		subject: `Reset your ${config.appName} password`,
		text: `Tap the link below to choose a new password.\n\n${link}\n\nDidn't request this? Ignore this email — your password won't change.`
	};
}

/** Sent to the NEW address when a signed-in user changes their email; they
 * must click through to confirm the new address takes over. */
export function emailChangeVerify(to: string, token: string): Mail {
	const link = `${config.origin}/verify?token=${token}`;
	return {
		to,
		subject: `Confirm your new ${config.appName} email`,
		text: `Tap the link below to confirm this address for your ${config.appName} account.\n\n${link}\n\nDidn't request this? Ignore this email.`
	};
}

/** Sent to the OLD address as a heads-up once the change is confirmed. No
 * link — this is a notice, not an action. */
export function emailChangedNotice(to: string): Mail {
	return {
		to,
		subject: `Your ${config.appName} email was changed`,
		text: `Your ${config.appName} account's email address was just changed away from this address.\n\nIf you didn't make this change, contact support right away.`
	};
}

/** Signup-collision side channel: sent instead of a verify email when the
 * address already has an account, so the response to signup is identical
 * either way. Says "sign in or reset" without revealing anything else. */
export function accountExistsEmail(to: string): Mail {
	return {
		to,
		subject: `${config.appName} account already exists`,
		text: `Someone tried to sign up with this email, but you already have a ${config.appName} account.\n\nJust sign in — or reset your password if you don't remember it.`
	};
}

# Security policy

onwrist is a small self-hosted app maintained by one person. If you find a
vulnerability, please report it privately rather than opening a public
issue:

- **GitHub**: use [private vulnerability
  reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  on this repository ("Report a vulnerability" under the Security tab).

Include what you found, where (file/route), and a reproduction if you have
one. You'll get a response as fast as a one-person project allows —
usually within a few days.

## Scope notes for self-hosters

- Only the latest commit on `main` is supported.
- The threat model assumes the app is reachable **only** through a
  Cloudflare tunnel (loopback-bound port, `CF-Connecting-IP` trusted for
  rate limiting). If you expose the port directly, clear `ADDRESS_HEADER`
  — see `.env.example`.
- Account emails fall back to container stdout when `RESEND_API_KEY` is
  unset; those log lines contain live account-recovery links. Don't ship
  that configuration to real users.

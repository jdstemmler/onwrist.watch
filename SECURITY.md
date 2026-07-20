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
- By default the app trusts the connecting socket's address for per-IP
  rate limiting. If you front it with a proxy or tunnel, only set
  `ADDRESS_HEADER` to a header the proxy **always overwrites** (e.g.
  `CF-Connecting-IP` behind cloudflared) *and* make the proxy the only
  path to the port (`BIND_ADDRESS=127.0.0.1`) — a spoofable header lets
  clients forge rate-limit identities. See `.env.example`.
- Account emails fall back to container stdout when `RESEND_API_KEY` is
  unset; those log lines contain live account-recovery links. Don't ship
  that configuration to real users.

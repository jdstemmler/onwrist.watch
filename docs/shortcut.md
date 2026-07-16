# Building the "horolog" iOS Shortcut

> **Status: reference only.** The installable PWA (`/log`, Add to Home
> Screen) replaced the shortcut as the primary logger — it's as fast and
> needs no maintenance in the Shortcuts app. This guide is kept for anyone
> who wants Action Button / Back Tap / NFC triggers via the JSON API.

This is a step-by-step guide for building the iOS Shortcut that drives horolog
from your phone. It talks to the JSON API under `/api/*`, which is
bearer-token authenticated (see `hooks.server.ts` / `AUTH_TOKEN`).

Action names below are quoted exactly as they appear in the iOS Shortcuts
app (as of iOS 17/18). If a label has drifted in a later iOS version, the
intent (method, URL, body) is what matters — adjust to match what you see.

> **Golden rule:** every "Get Contents of URL" action in this shortcut
> builds its URL from the `BaseURL` variable and its auth header from the
> `Token` variable. Never type a literal `http://...` or the raw token
> into a URL or header field anywhere below. Going live (LAN → public
> tunnel) is then a one-place edit: change the `BaseURL` Text action.

---

## 1. Setup constants

At the very top of the shortcut, before anything else:

1. Add a **"Text"** action. Set its content to your base URL, e.g.
   `http://192.168.1.50:3000` for LAN testing (later
   `https://horolog.example.com` once cloudflared is wired up).
2. Add a **"Set Variable"** action immediately after it. Set Variable Name
   to `BaseURL`, and set it to the output of the Text action above.
3. Add a second **"Text"** action. Set its content to your `AUTH_TOKEN`
   value (the same value configured on the server in `.env`).
4. Add a **"Set Variable"** action after it, Variable Name `Token`, set to
   the output of that Text action.

From here on, every time this guide says "the URL" it means: an
`{BaseURL}` reference (Shortcuts inserts it as a magic-variable chip when
you tap into the URL field and choose the `BaseURL` variable — don't
type the name) followed by the literal path, e.g. `{BaseURL}/api/state`.
Every time it says "the auth header," it means the "Get Contents of URL"
action's Headers section, key `Authorization`, value `Bearer {Token}`
(again, `{Token}` inserted as a variable chip, not typed text).

---

## 2. Fetch state

1. **"Get Contents of URL"**
   - URL: `{BaseURL}/api/state`
   - Method: `GET`
   - Headers: `Authorization: Bearer {Token}`
2. **"Get Dictionary from Input"** — feeds off the previous action's
   output, giving you a dictionary with keys `status_line`, `wearing`,
   `valid_actions`, `watches`, and `watch_menu` (see
   `src/lib/server/state.ts` for the exact shape — this is the
   `StateResponse` type). `watch_menu` is the one built for Shortcuts:
   a dictionary of watch label → watch id, all owned watches,
   most-recently-worn first.

Save this dictionary to a variable (e.g. via "Set Variable" → `State`) so
later steps can pull fields out of it with "Get Dictionary Value."

---

## 3. Show state + menu

Add a **"Choose from Menu"** action. Set its prompt to the `status_line`
value from `State` (Get Dictionary Value `status_line` → drop into the
menu's prompt field). Because Shortcuts menus are static, build all four
items up front, every time, regardless of current state:

- Put on
- Swap
- Take off
- Backfill…

### Guarding each branch against invalid actions

In each of the **Put on**, **Swap**, and **Take off** menu branches
(*not* Backfill — it's always valid), start with:

1. **"Get Dictionary Value"** — Get Value for `valid_actions` from
   `State`. This yields a list like `["swap", "take_off"]` or
   `["put_on"]`.
2. **"If"** — condition "contains" the relevant action name
   (`put_on`, `swap`, or `take_off`) in that list.
   - If **true**: continue into the API call for that branch (section 4
     or 5 below).
   - If **false**: **"Show Notification"** with a message like "Not
     valid right now — you're (not) wearing a watch," then stop (Otherwise
     branch just ends).

### Simpler alternative (recommended if you want fewer steps)

Skip the `valid_actions` check entirely and just fire the API call. If
the action isn't valid server-side, the API responds `409` with a
`message` field (e.g. "Already wearing a watch") — show that message in
a notification exactly as you would for the happy path (see section 7).
This is fewer actions to build and the server is the single source of
truth anyway; the client-side check in this section is a nicety for a
snappier "you can't do that" message, not a correctness requirement.

---

## 4. Put on / Swap branches

Both branches follow the same shape; only the endpoint path and the
notification wording differ.

1. **"Get Dictionary Value"** — Get Value for `watch_menu` from `State`.
   This is a dictionary whose keys are the watch labels and whose values
   are the watch ids.
2. **"Choose from List"** — pass the `watch_menu` dictionary in directly.
   Shortcuts renders each **key** (the watch's label) as a tappable row —
   no per-item configuration needed. The output ("Chosen Item") is that
   entry's **value**, i.e. the watch id itself.
3. **"Get Contents of URL"**
   - URL: `{BaseURL}/api/actions/put-on` (Put on branch) or
     `{BaseURL}/api/actions/swap` (Swap branch)
   - Method: `POST`
   - Headers: `Authorization: Bearer {Token}`
   - Request Body: JSON, one field — key `watch_id`, type **Number**,
     value = the **Chosen Item** magic variable from step 2 (it is
     already the id; nothing to extract).
4. **"Get Dictionary Value"** — Get Value for `message` from the
   response.
5. **"Show Notification"** — body = the `message` value from step 4.

Note: `watch_menu` includes the currently-worn watch too (so Backfill
can target it). If you tap it here, the API just answers with a 409 and
a human-readable `message` ("Already wearing that watch") — which your
notification shows. Nothing breaks.

`put-on` response: `{"message": "...", "session": {...}}`.
`swap` response: `{"message": "...", "closed": {...}, "opened": {...}}`.
Only `message` is needed for the notification.

---

## 5. Take off branch

1. **"Get Contents of URL"**
   - URL: `{BaseURL}/api/actions/take-off`
   - Method: `POST`
   - Headers: `Authorization: Bearer {Token}`
   - Request Body: JSON, empty object `{}` (no fields needed — leave the
     JSON body editor with zero key/value rows, which produces `{}`)
2. **"Get Dictionary Value"** — Get Value for `message`.
3. **"Show Notification"** — body = that `message`.

---

## 6. Backfill branch

Backfill logs a session after the fact (e.g. you forgot to log this
morning's watch). This branch always runs — it isn't gated by
`valid_actions`.

1. **"Get Dictionary Value"** — Get Value for `watch_menu` from `State`.
   It includes **all** owned watches — the currently-worn one too — so
   you can backfill yesterday's wear of the watch on your wrist right now.
2. **"Choose from List"** — pass the dictionary in directly, exactly as
   in section 4: rows show the labels, and "Chosen Item" is the watch id.
3. **"Ask for Input"** — Input Type: Date and Time. Prompt: "When did you
   put it on?" This is the session start.
4. **"Choose from Menu"** — three items for the end time:
   - **"Until now"**
   - **"Until a specific time"**
   - **"Still wearing it"**

   Branch behavior:
   - **Until now:** use **"Current Date"** as the end moment (no extra
     input needed).
   - **Until a specific time:** add another **"Ask for Input"** (Date and
     Time) prompting "When did you take it off?" — this is the session
     end.
   - **Still wearing it:** no end time is collected; `ended_at` is
     omitted from the request body entirely (leaves the watch on-wrist
     as an open session — be sure you aren't already wearing something
     else, or the backfill will violate the no-overlap invariant and the
     API will 409).

5. **Format each date for the API.** The API expects ISO 8601 datetime
   strings with an explicit offset (Zod's `datetime({ offset: true })`).
   For every date value (the start from step 3, and the end from step 4
   if collected), add a **"Format Date"** action:
   - Date Format: **Custom**
   - Custom Format: `yyyy-MM-dd'T'HH:mm:ssZZZZZ`

   This produces something like `2026-07-15T08:30:00-07:00`, which
   satisfies the API's offset-datetime validation.

6. **"Get Contents of URL"**
   - URL: `{BaseURL}/api/sessions`
   - Method: `POST`
   - Headers: `Authorization: Bearer {Token}`
   - Request Body: JSON —
     - `watch_id`: the id from step 2 (Number)
     - `started_at`: the formatted string from step 5 (Text)
     - `ended_at`: the formatted end-time string from step 5 — **omit
       this field entirely** on the "Still wearing it" branch (don't
       include the key at all; an empty string is not a valid ISO
       datetime and will 400)
7. **"Get Dictionary Value"** — Get Value for `message`.
8. **"Show Notification"** — body = that `message`.

---

## 7. Error handling

The API always returns a JSON body with a `message` field — on success
*and* on error (400 invalid request, 409 state-machine violation, 401
unauthorized). Because of this, one pattern covers every call in this
shortcut:

- Leave "Get Contents of URL"'s **Show Errors** off / default (don't
  enable "Show Errors" specially) — a non-2xx response still comes
  through as the action's normal dictionary output in Shortcuts, so
  "Get Dictionary from Input" / "Get Dictionary Value" still works on it.
- After every POST, add **"Get Dictionary Value" → `message`** then
  **"Show Notification"**, exactly as shown in sections 4–6. This turns
  a 409 like `"Already wearing a watch"` into the same kind of
  notification a success produces — you always see *something*
  human-readable, whether it worked or not.
- If you find Shortcuts does surface a hard error dialog for non-2xx
  status on your iOS version instead of passing the body through,
  enable "Show Errors: Off" (or equivalent toggle) on the "Get Contents
  of URL" action so it always continues to the next step regardless of
  status code.

---

## 8. Triggers

Once the shortcut works from the Shortcuts app, wire up fast entry
points:

- **Home Screen:** in the shortcut's settings (the "..." / info button),
  choose "Add to Home Screen." Gives it an icon you can tap directly.
- **Lock Screen widget:** Home Screen → long-press → "Customize" → add a
  Lock Screen widget → "Shortcuts" widget type → pick this shortcut. Runs
  without unlocking past the widget tap (may still prompt Face ID/passcode
  depending on shortcut content).
- **Action Button** (iPhone 15 Pro and later): Settings → Action Button →
  choose "Shortcut" → select this shortcut.
- **Back Tap:** Settings → Accessibility → Touch → Back Tap → Double Tap
  (or Triple Tap) → scroll down to Shortcuts → select this shortcut.
- **NFC (later):** not covered in this pass. When you're ready: Shortcuts
  app → Automation tab → "+" → "Create Personal Automation" → NFC → scan
  a tag → "Run Immediately" → add this shortcut as the action. This lets
  a tag by your watch box trigger the shortcut with zero taps.

---

## Verification checklist (deferred — do this on an actual iPhone)

Building this guide was done by reading the API contract, not by
building/running the shortcut in the Shortcuts app. Before trusting it
day to day, build it on your phone against a running instance (LAN dev
is fine) and confirm:

- [ ] **Put on** (starting from "No watch on"): pick a watch, get a
      success notification with a sensible message, then re-fetch state
      and confirm `wearing` is now set to that watch.
- [ ] **Swap** (starting from "Wearing X"): pick a different watch, get a
      notification mentioning both the old and new watch, confirm state
      now shows the new watch worn and the old one's session closed.
- [ ] **Take off** (starting from "Wearing X"): confirm a notification
      naming the watch you took off, and state now shows "No watch on."
- [ ] **Backfill**, all three end-time paths:
  - "Until now" — completes and shows success message.
  - "Until a specific time" — second Ask for Input actually prompts, and
    the resulting session has the right start/end.
  - "Still wearing it" — completes and leaves that watch on-wrist (only
    try this from a "No watch on" state, or expect/confirm the 409).
- [ ] **One 409 case**: trigger Put On while already wearing a watch (or
      Take Off while no watch is on) and confirm the shortcut surfaces
      the API's `message` in a notification instead of a raw error
      dialog or silent failure.
- [ ] Confirm every action name in this doc matches what's actually
      offered in the Shortcuts app on your iOS version; fix any
      renamed/relocated action and note the correction here.

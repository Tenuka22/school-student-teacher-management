# Leave, Staff Identity and Attendance — How the System Works

A plain-English description of how staff accounts, leave and attendance actually work in
this system.

This document explains behaviour, not software. It contains no code and no file references.

**One warning before you read.** This began as a forward-looking design approved in
September 2026. Much of it has since been built, and **a significant part of it was built
differently, or not built at all.** This document describes what the system does today.
Where the original plan and the built system disagree, the disagreement is called out
plainly in [section 16](#16-what-changed-from-the-original-plan), so nobody has to guess
which is which.

---

## Contents

1. [The three parts and who uses them](#1-the-three-parts-and-who-uses-them)
2. [Staff identity — one person, one account](#2-staff-identity--one-person-one-account)
3. [The three seeded accounts](#3-the-three-seeded-accounts)
4. [Joining as a teacher](#4-joining-as-a-teacher)
5. [Two kinds of staff member](#5-two-kinds-of-staff-member)
6. [Who can decide a leave request](#6-who-can-decide-a-leave-request)
7. [The two-stage approval chain](#7-the-two-stage-approval-chain)
8. [What can and cannot be undone](#8-what-can-and-cannot-be-undone)
9. [The kinds of leave](#9-the-kinds-of-leave)
10. [Maternity leave — two separate entitlements](#10-maternity-leave--two-separate-entitlements)
11. [Whole days and half days](#11-whole-days-and-half-days)
12. [How days are counted](#12-how-days-are-counted)
13. [Quotas](#13-quotas)
14. [Your leave balance](#14-your-leave-balance)
15. [The attendance register](#15-the-attendance-register)
16. [The late-arrival policy](#16-the-late-arrival-policy)
17. [Recording an arrival](#17-recording-an-arrival)
18. [Approved leave and the attendance lock](#18-approved-leave-and-the-attendance-lock)
19. [Who can mark attendance, and for whom](#19-who-can-mark-attendance-and-for-whom)
20. [What each role sees](#20-what-each-role-sees)
21. [What changed from the original plan](#21-what-changed-from-the-original-plan)
22. [Known gaps](#22-known-gaps)

---

## 1. The three parts and who uses them

The system covers three related things that share one data model.

**Staff identity.** Who people are, what they sign in with, and which of them exist as
teaching staff. Anyone who is to hold a laptop, apply for leave, or appear on the
attendance register has to exist as a staff member first.

**Leave.** Staff apply, the Deputy Principal recommends, the Principal decides. Every
person has an allowance per leave type per academic year, and the system refuses requests
that would exceed it.

**Attendance.** A daily register of who was there, and what happens automatically when
somebody arrives after the cut-off.

The three are joined at one important point: **approving leave writes the attendance
record**. That is covered in [section 18](#18-approved-leave-and-the-attendance-lock), and
it is the single most important integration in this part of the system.

---

## 2. Staff identity — one person, one account

**A staff member's national identity number is their username.** Not something generated
for them, not an email address. The number itself, in lower case, so that a capital V and a
lower-case v are the same account.

The reasoning is that there is nothing to remember and nothing to lose. One identity number
is one person is one account, and the unique index on the identity number is what actually
enforces it. Sign-in stays username and password.

**The identity number is lower-cased on the way in**, so the same number typed two
different ways cannot become two accounts.

**Two people supplying the same identity number is refused** with a message that says so
directly. The pre-check gives a good message; the unique index is the backstop that
actually guarantees it.

**A synthetic internal email address is generated** for a staff member who supplies no
email of their own, so that the account record is always well-formed. Nothing is sent
there.

**Email is not unique on the staff record**, and this is deliberate. Schools commonly have
several family members sharing an address, so rejecting a duplicate address would reject
real people. The address on the *account*, however, must be unique — two accounts cannot
share one, refused with "This email is already registered".

**One credential factory is used by both self-service sign-up and administrator-created
staff.** There is no separate path for "accounts an administrator made", which is why the
two kinds of account behave identically once they exist.

---

## 3. The three seeded accounts

Three accounts are created automatically every time the server starts, if they are missing:
**Administrator**, **Principal** and **Deputy Principal**.

Each has a fixed username, a fixed institutional email address, a role, a display name, and
a password that comes from the environment on first boot.

Several deliberate properties:

**The usernames are fixed in code, not in the environment.** They have to be known
operationally — written on a whiteboard, used in a recovery procedure — so they must not
drift between deployments.

**A custom username rule exists purely so the hyphen in "deputy-principal" is accepted.**
That one accommodation is the only reason the rule is loosened at all.

**The role, name and address are re-asserted on every boot.** If somebody edits them, the
edit is corrected.

**The password is never re-asserted if a credential already exists.** A password changed
through the account page must survive a restart. A *missing* credential is repaired, so a
half-created account is fixed.

**The paired staff record uses a fixed, predictable identity**, and is created only if
nothing is there already — so once the school has edited that record, the edits survive.
The record is deliberately incomplete: no identity number, no employment status.

**No position is created for these three.** Their authority comes from the account's role,
not from a position held in a year. Creating a position row for them would be code that can
never run.

### The consequence people trip over

**None of the three seeded accounts can be given a staff record that lets them hold
anything, apply for leave, or appear on the attendance register.** They have no identity
number and no employment status.

In the inventory system this means the Principal can run the whole register and sign off
write-offs, but cannot be handed a laptop. The same shape applies here.

The Principal and Deputy **can** decide leave requests, because that authority comes from
their account role. They just cannot be the subject of one.

**There is a real cost to this, and it should be known.** When one of the three seeded
accounts acts on a leave request, **the request records no person**. The audit trail on a
decision made by the seeded Principal is empty. A Principal who has been properly appointed
through the system, rather than being a seeded account, does get recorded. So the
authorisation history is complete for appointed staff and blank for the three bootstrap
seats.

---

## 4. Joining as a teacher

A teacher can create their own account. There is one sign-up page with a toggle between
two kinds of account.

**A general account** takes a name, an email address and a password. The email address
becomes the username.

**A teacher account** takes a name, a **national identity number**, an email address, an
optional phone number and a password. The identity number becomes the username.

**Office staff cannot sign themselves up.** The form does not offer it, and the server
refuses it regardless of what is submitted.

The reasoning is recorded, and it is a good one: an office-staff registration accepted here
would produce an account that could verify its address, reach the approval queue, and then
be refused by approval for the one reason it could never fix itself. Office staff accounts
are **issued by an administrator**, who creates the staff record and hands over the login.

**A new teacher account is created in a waiting state, not as a teacher.** The person can
sign in and verify their email, but they are not yet a teacher. They appear in a queue.

**A duplicate identity number is refused** with "A staff record with this NIC already
exists".

**On success the screen says**: "Sign in with this username — your NIC — and the password
you just chose."

### Getting approved

Only an **administrator or the Principal** can approve a waiting teacher. The Deputy
Principal is refused, with a message saying so.

Approval runs **four checks in order**, each with its own explanation, and it stops at the
first failure:

1. **Is this account actually waiting to become a teacher?** If not, it is refused — the
   account may already be a teacher, or a general account.
2. **Has the person verified their email address?** If not, refused: they must enter the
   code sent to that address first.
3. **Is there a staff record linked to this account?** If not, refused: an administrator
   must add them under Teachers first. **Signing up does not create the staff record** — the
   staff record and the account are two separate things that have to be joined up.
4. **Is the linked record a teaching record, and is the employment active?** An office
   staff record is refused, naming the reason. A record with a non-active employment status
   is refused, quoting the status it actually holds.

On success it **writes the employment status as active** and promotes the account to
teacher.

**The approval queue shows more than names.** For each waiting account it shows identity
details, whether the address is verified, whether the account is banned, how many active
sessions it has, and the address and browser of the last sign-in.

### Accounts that are never approved

**Unverified accounts are deleted after seven days.** This is a sweeping process, not an
individual action, and it removes the login only — the staff record survives, unlinked, so
the person is not lost, just not yet connected.

The three seeded accounts are verified and therefore untouchable by this process.

---

## 5. Two kinds of staff member

Every staff record is one of two kinds: **teaching staff** or **office staff**.

This is not cosmetic. It decides who appears on the teaching roster, who is offered for
attendance marking, who is included in the staff export, and who appears in the
unassigned-staff reports. Office staff and the three seeded leadership accounts are
excluded from all of those.

**The category can be set** when an administrator creates a staff record, when they edit
one, and from the staff form. The export prints which kind each person is.

**But office staff are only half built.** Being able to record that somebody is office
staff is not the same as having a place for them. Specifically:

- There is **no office staff list and no office staff screen.** An office staff record is
  effectively invisible — the only way to create one is through the "new teacher" form, and
  the only place one shows up afterwards is the spreadsheet export.
- There is **no office staff workspace** and no separate self-service area.
- There are **no separate leave allowances for office staff.** Allowances are set by leave
  type for the year, not by staff category. An office staff member and a teacher draw on
  the same pool for the same leave type.
- Nothing in the leave system branches on staff category at all.
- An office staff member created by an administrator is given a **teacher** login anyway,
  so they can apply for leave. That works, but by accident of sharing one role rather than
  by design.

**None of the leadership seats can be a teaching staff member**, which is correct, but it
also means the Principal never appears on the attendance register or the teaching roster —
which is also correct, and is a distinction the screens are careful about.

---

## 6. Who can decide a leave request

Two people can act on a leave request, and they do different things.

**The Deputy Principal recommends.** This is a view on the request, not a decision. It
becomes binding only when the Principal acts.

**The Principal decides.** This is final.

### How authority is worked out

There are two paths, and the difference matters.

**The three seeded accounts are recognised by their account role**, before any staff record
is looked at. This is what lets the Principal and Deputy decide leave on a fresh install,
where nobody has staff records yet.

**Everyone else has authority read from the position they hold in the selected academic
year.** Being a Deputy Principal or an Assistant Principal gives recommend authority;
being the Principal gives decide authority. A person promoted through the position system
is authorised from that year onwards.

### The buttons are not symmetrical

The Deputy's two buttons read **"Recommend"** and **"Not recommended"**. They are
deliberately not "Approve" and "Reject", because the Deputy does not approve anything. A
request the Deputy has marked "not recommended" is not finished — and the screens keep it
actionable for the Principal specifically so it can be overturned.

The Principal's buttons read **"Approve (Final)"** and **"Reject (Final)"**.

### The Principal can act before the Deputy — but must say why

The Principal is not blocked from acting on a request the Deputy has not touched. But
doing so requires **a written reason**, and the screen will not submit without one:

> "A Principal override reason is required when bypassing the Deputy review"

The confirmation dialog says:

> "This request has not completed the Deputy review step. The Principal will approve/reject
> it and the decision will be final. Continue?"

This is the escape hatch the original plan called for, and it is genuinely open — but it
leaves a written mark, so a skipped review step is visible rather than silent.

One rough edge: if the Principal types a separate review note *and* supplies an override
reason, **only the note is stored.** The override reason is the fallback when there is no
note.

### A Deputy rejection can be overturned

A Deputy "not recommended" leaves the request in the Principal's queue rather than closing
it. The Principal can then approve it — again through the override dialog, because a
rejected request has not been recommended.

So: **a Deputy rejection is a strong signal, not a final answer.** The original plan left
this as an open question and chose the same answer.

---

## 7. The two-stage approval chain

A request moves through these states:

- **Pending** — submitted, nobody has acted
- **Recommended** — the Deputy has recommended it
- **Approved** — the Principal has approved it; final
- **Rejected** — the Principal has rejected it; final
- **Cancelled** — the applicant withdrew it

Alongside the overall state there are two separate sub-states: the Deputy's decision, and
the Principal's. Each records **who acted and when**, so a request can show "recommended by
the Deputy on Tuesday, approved by the Principal on Wednesday" rather than losing the
intermediate step.

**What closes the chain is the Principal's decision.** Once that is recorded, the request is
locked: neither the Deputy nor the Principal can act on it again, and the applicant cannot
cancel it. Both refusals say the request has already been finalised.

A request carries **a comment at each stage**, so the Deputy's reasoning and the Principal's
reasoning are both kept separately.

**A Deputy rejection does not close the chain.** It is visible to the Principal and stays
actionable. Only the Principal's action closes it.

### The queue

**All three audiences see the same screen**, and it works out for itself what to show. There
are three views:

- **Awaiting Deputy** — nothing has been touched
- **Awaiting Principal** — recommended or rejected, still open
- **Full ledger** — everything

**The view opens on whichever one the viewer can act in.** A Principal lands on "Awaiting
Principal", a Deputy on "Awaiting Deputy", anyone else on the full ledger. Opening the full
ledger by default would show the Deputy a wall of requests they cannot do anything about.

There are also filters for each state, with live counts on the two that represent work
waiting to be done.

### What a request card shows

The person's name and badge number, the type of leave, the maternity tier where relevant,
the current status, the date range, **which half of the day** where relevant, the reason
given, and the Deputy's decision and comment.

The status wording is deliberate about who did what: "Recommended (Deputy Principal)" is
visibly different from "Approved (Principal)".

### What happens on success

- Deputy acts: *"Recommendation recorded — waiting for the Principal"*
- Principal acts: *"Decision finalised"*

---

## 8. What can and cannot be undone

### Cancelling — narrower than the plan

**A request can be cancelled only while it is still completely untouched** — that is, only
while the Deputy has not yet acted.

This is narrower than the original plan intended, which said the applicant could cancel
anything not yet finalised. In practice, **the moment the Deputy acts, the applicant has
lost the ability to withdraw their own request.** Their only route is to ask the Principal
to sort it out.

Two further details:

- Cancelling is shown **only on requests that are still pending**, so the restriction is
  visible before the applicant tries.
- A cancelled request keeps its "not yet decided" sub-state forever. The record shows as
  cancelled overall, but internally the Principal's decision field is still empty, which is
  slightly untidy but has no user-facing effect.

### Editing — not built

**There is no way to edit a leave request.** Not by the applicant, not by an
administrator.

The only route is cancel and reapply — and cancelling is blocked as soon as the Deputy
acts. So a request with a typo in the dates, once recommended, cannot be corrected by
anyone through the system.

### Reversal by an administrator — not built

**There is no administrative override to cancel, amend or reopen a decided request.** The
code notes that an administrator would reverse one by hand in the database.

### Deleting — not built

Leave requests are never deleted. They are cancelled or rejected.

---

## 9. The kinds of leave

There are six kinds, and each is a separate allowance:

| Leave | Displayed as |
|---|---|
| Annual | Annual Leave |
| Casual | Casual Leave |
| Medical | Medical Leave |
| Maternity | Maternity Leave |
| Duty | **Official Duty** |
| Other | Other Leave |

"Official Duty" is the display name for the duty kind. A request made for official business
is a distinct kind from annual leave, with its own allowance — which means a school can see
how much of its staff absence was official business rather than personal leave.

---

## 10. Maternity leave — two separate entitlements

**The College grants 84 days of maternity leave on full pay, and a further 84 days at half
pay.** That is the rule, and it is why there are two maternity entitlements rather than one.

**Half pay is its own thing, distinct from unpaid leave.** This distinction was made
deliberately, because the second maternity tier used to be recorded as unpaid leave — which
told a teacher the wrong thing about what they were entitled to. "Half pay" and "unpaid" are
now different statuses with different labels, and the half-pay tier is a real entitlement
with a real balance.

**The applicant chooses the tier** when applying. The form offers "Full pay — 84 days" and
"Half pay — 84 days", and explains that each has its own allowance counted against approved
leave in the academic year.

**Entitlement is per person, per academic year, per tier.** Someone can take 84 days on
full pay and, separately, 84 days at half pay, in the same year.

The word **"per person"** is on purpose and it is the honest statement of what the system
does. A reading of "84 days per pregnancy" would need a way to group requests by pregnancy,
and the system has no such grouping. It cannot tell one maternity from another, so it does
not claim to. The screens say "per person" rather than implying a rule that is not enforced.

**One tier exists in the vocabulary but has no allowance behind it: unpaid.** The validator
accepts it for maternity, but there is no unpaid maternity entitlement, so choosing it fails
at submission with "No leave entitlement is configured for maternity". The screens never
offer it, so it cannot be reached through normal use.

---

## 11. Whole days and half days

A request covers either **whole days** or **half a day**, and a half day is either the
**first half of the day or the second half**.

**The two halves are defined by the timetable, not by clock time.** Each academic year
carries a morning period range and an afternoon period range, and a half-day leave request
names one of them. The labels on the request form read "First half — Primary" and "Second
half — Secondary", with the actual period numbers pulled live from that year's policy, so
the wording follows the year's timetable rather than being hard-coded.

**A half-day request must start and end on the same date.** Spanning two dates is refused
with "Half-day leave must start and end on the same date" — and the request form catches
this before submission with "Half-day leave must use one date".

**Half-day leave consumes half a day of the allowance**, not a whole day.

**A whole-day request overrides everything.** It collides with any other request touching
those dates, whole or half. A half-day request collides with a whole-day request on the
same date, and with another request for the same half — but two half-day requests for
*different* halves of the same date are both allowed. A teacher can take the morning off in
one request and the afternoon off in another.

### The two-thirds rule is not real

The request form carries text saying:

> "Two approved half-days count as one full leave day; a third in the same month is
> recorded as a half day"

**This is not implemented.** There is no monthly grouping of half-days anywhere, and no
half-day allowance. Three approved half-days consume one and a half days, and nothing
special happens on the third.

The same text appears on the attendance screen. It is aspirational copy, and it is wrong.

---

## 12. How days are counted

**Saturday and Sunday are excluded.** A request from Monday to Friday costs five days; the
same dates a week later cost seven calendar days but still five working days.

**There is no public holiday calendar.** A public holiday falls on a weekday and is counted
as a leave day. This is a real limitation, and it means a request spanning a long weekend
over-charges the allowance.

**Half a day counts as half**, whatever the date range, as long as it is a single date.

**A request's start and end dates are both inclusive.**

### Overlapping requests are refused

**A new request cannot overlap an existing one that is still live** — that is, one that is
pending, recommended or approved, in the same year.

The refusal says: "You already have an active leave request covering this day part".

The collision rules are as described above: whole against anything, half against whole or
against the same half.

**But overlap protection does not reserve allowance.** Only **approved** leave counts against
the balance. Two requests can both be filed against the same remaining days as long as they
do not overlap in dates, and **both can then be approved**, taking the person over their
allowance.

The balance screen does handle the result honestly — it shows the overage as a loan — but
nothing prevents it happening.

---

## 13. Quotas

**Every allowance is per academic year, and every allowance lives in the database.**
Nothing is hard-coded. Opening a new year with different numbers requires no code change at
all.

**Allowances are keyed by three things together: the year, the leave type, and the payment
status.** The third part matters because of maternity — full pay and half pay are separate
allowances of the same leave type.

Historical years keep their own allowances, so **past data is never corrupted by a change
to a future year.**

### The seeded defaults

Seven allowances are created automatically with every new academic year, in the same step
as the year itself:

| Leave | Payment | Days |
|---|---|---|
| Medical | — | 21 |
| Annual | — | 20 |
| Casual | — | 20 |
| Maternity | Full pay | 84 |
| Maternity | Half pay | 84 |
| Official Duty | — | 30 |
| Other | — | 20 |

**A minimum figure is also stored for each, set to zero.** The original plan described this
as a floor used for validation and warnings. **Nothing reads it.** There is no minimum-leave
validation anywhere.

**Seeding is safe to repeat.** A repair action exists that inserts only the allowances that
are missing and reports how many it added. It will not overwrite an allowance a school has
already changed.

### Changing an allowance

An administrator **can** change any allowance for any year, through an administrative
action that writes the new maximum and minimum.

**But there is no screen for it.** All three allowance-management actions — list, change,
top-up — exist and are administrator-only, and **none of them is called from anywhere in
the application.** Changing a year's allowances today means using the administrative
interface directly, or editing the database by hand.

That is a real gap, because the original plan's whole point was that a school could raise
next year's allowance without touching anything technical.

### The quota is enforced, not advisory

**A request that would exceed the remaining allowance is refused at submission.** This is
the important part, and it was not always so — an earlier version only checked that an
allowance existed at all, without counting anything.

The refusal names the numbers:

> "This request is 6 days and you have 4 of 20 annual days left this year. Reduce the
> request, or ask the Principal to review an exception."

Remaining days are never shown as a negative.

**One problem with that message.** It tells the applicant to ask the Principal to review an
exception, but **there is no exception mechanism.** The Principal can only decide on what
was filed. If the request was refused, it does not exist, and the Principal cannot approve
it. So the advice in the message cannot be followed.

### The allowance is checked per type and per tier

Consumption is summed across **approved** requests only, matching the same type and the
same payment status. So using 10 maternity days at half pay does not reduce the full-pay
allowance.

---

## 14. Your leave balance

**There is no stored balance.** Everything is worked out when asked, from the year's
allowances minus the approved leave.

That means a balance is always exactly as correct as the approved leave behind it, and
nothing can drift.

**The balance appears on the teacher's dashboard**, not on the leave page. Each
type-and-tier combination gets a row: how many days used out of the allowance, and how many
remaining. The maternity rows are labelled with the tier — "Maternity Leave (Paid — full
pay)" and "Maternity Leave (Half pay)" — so the two allowances are not confused.

**If you are over, it says so as a loan.** The remaining figure is not clamped at zero. An
overage reads as "3 days loan", and the progress bar turns into a warning colour once
consumption reaches the full allowance. This is reachable in practice, because of the
allowance-not-reserved problem described in [section 12](#12-how-days-are-counted).

**Anyone signed in can ask for their own balance**, including accounts with no staff record —
they simply get an empty result rather than an error.

**The leave application form does not show the remaining balance before you submit.** You
find out you are over quota from the refusal message, not from a figure on the form. Given
that the balance card exists on the dashboard, this is a small omission with an easy fix.

---

## 15. The attendance register

Attendance is recorded per person, per date, with a status.

**The statuses are:** present, partial, absent, late with a short leave, and half day.

**A missing record means "nobody has marked it", not "present".** This distinction is
explicit throughout, and it is the right one — a register that assumes unmarked means
present is a register that silently under-reports.

**"Partial" means part of the day is missing.** A second record captures **which periods**
are missing on a partial day, with a reason for each.

**A whole-day absence is a single record with no period detail.** Period-level detail only
exists for partial days.

**A record can be linked back to the leave request that caused it.** This is the hook the
attendance lock uses.

**Each record notes when it was marked**, so a register changed weeks later is detectable.

**There is a place for a substitute or relief teacher on a partial day, and it is never
used.** The field exists in the data model and nothing writes to it. Relief cover is
designed and not built.

### Marking is per cell, and it saves as you go

The register is a grid of people against days. **Each cell saves on its own**, optimistically,
and **rolls back visibly if the save fails** — the cell is flagged as not saved rather than
silently reverting.

**Backdating requires a confirmation.** Marking a past date asks first.

**Dates outside the academic year are refused**, with the year and its actual start and end
dates named, so a typo is obvious.

**A range cannot end before it starts**, and a range must also sit inside the year.

---

## 16. The late-arrival policy

Each academic year has one attendance policy row, created automatically with the year.

**It holds six editable values:**

| Value | Default | What it means |
|---|---|---|
| Arrival cut-off | 07:30 | Arriving at or before this is on time |
| Short leaves per month | 2 | How many late arrivals a month are forgiven |
| First-half period, start | 1 | Which period the morning block starts at |
| First-half period, end | 4 | Which period the morning block ends at |
| Second-half period, start | 5 | Which period the afternoon block starts at |
| Second-half period, end | 8 | Which period the afternoon block ends at |

**Changing the policy edits that year's row only.** History is untouched, because
consumption is recorded in separate running records rather than by changing the policy.

Validation is real:

- Period numbers are bounded to the eight periods a day has.
- Short leaves per month is bounded to a sensible range.
- The cut-off must be a real 24-hour time, checked by pattern, with the message
  "Expected HH:MM (24-hour)".
- **The two period blocks must each run forwards and must not overlap each other**, refused
  with: "The primary teaching block has to start before it ends, the secondary block has to
  start before it ends, and the two blocks cannot overlap".
- If the policy cannot be read back after saving, the save is reported as failed rather than
  assumed to have worked.

**Only an administrator can change the policy.** The Deputy and Principal can read it, and
their screen shows a read-only summary with no Save button — deliberately, so nobody is
offered a control that would be refused.

**An administrator whose year has no policy row yet is offered to create one with all
defaults.**

**Two of the original plan's policy values do not exist:** a monthly half-day allowance, and
a "how many half days make a full day" conversion. See
[section 21](#21-what-changed-from-the-original-plan).

---

## 17. Recording an arrival

Recording an arrival is a single action that decides the outcome from the policy.

### On time

**Nothing is written to the register.** The action reports "present" and stops.

This is worth knowing: **an on-time arrival leaves no trace.** It is not a record that says
present, it is the absence of a record. If you are trying to prove somebody was on time, the
register cannot help.

### Late, with short leaves remaining

**The short-leave counter for that person and that month goes up by one**, and the action
reports a late short leave with a note reading the arrival time, the cut-off, and the count
so far — for example "Arrived 07:42 (after 07:30) — short leave 1/2 this month".

**No register record is written for this either.** The short leave is recorded **only** in
the monthly counter.

This has a consequence worth flagging: **the short-leave counter is the only trace of a
forgiven late arrival.** There is no row in the register, so the register does not show that
the person was late at all, and no per-person or school-wide report of short-leave usage
exists.

### Late, with the month's short leaves used up

**This is the only case that writes a register record.** It records a partial day and adds
period-absence rows for the **first half of the day**, with a note reading the arrival time,
the cut-off, and that a first-half day has been recorded.

**The status reported back and the status stored are different on purpose.** The action
reports "half day", which is what the person experienced; the register stores "partial",
because the register's vocabulary describes period coverage and has no "half day" value.
The note carries the meaning.

### What none of this does

**A late arrival never creates a leave request, and never uses up any leave allowance.** The
only half-day deduction anywhere in the system is a half-day leave request the person filed
themselves, which is a completely separate mechanism.

So a teacher who is late all month accrues a half-day attendance record and a short-leave
count, and **their leave allowance is untouched.**

### During approved leave

**Recording an arrival during approved leave is refused outright**: "Arrival cannot be
recorded during approved leave".

### Manually marking a late short leave

**You cannot record "late — short leave" by hand from the register.** The screen offers
present, partial and absent. Choosing present, including where a late short leave is
selected internally, **removes any existing record for that day** rather than writing a
present one. Only the arrival action can produce a late short leave, and even then it does
not write a register row.

---

## 18. Approved leave and the attendance lock

This is the most important thing in the whole part of the system, and it runs in the
direction people rarely expect.

### Approving leave writes the attendance

**When the Principal approves a request, the system writes the attendance records for it.**

For **every weekday** in the request's range:

- a whole-day request records an **absence** for that day
- a half-day request records a **partial day** with period-absence rows for the matching
  period range
- the reason reads "Approved {type} leave"
- **the record is linked to the leave request**

**Period absences for those days are replaced**, so re-approving does not leave duplicates.

**If the year has no attendance policy, the approval is rolled back entirely**, with
"Attendance policy is not configured for this academic year". This is deliberate: an
approval that cannot produce its attendance would leave the two systems disagreeing, so
neither is allowed to happen.

### The reverse lock

**A day covered by approved leave is locked against manual attendance marking.** Trying to
mark it is refused with "Attendance is locked by approved {type} leave".

This is a genuine two-way consistency: leave creates attendance, and attendance defers to
leave.

### Overriding the lock

Two things are required, and both must hold:

1. **A written reason.** Without one: "A reason is required to override approved leave
   attendance".
2. **Principal authority.** Without it: "Only the Principal can override approved leave
   attendance".

So the Deputy Principal and an administrator without the Principal role **cannot** override
an approved leave. The Deputy can mark attendance generally, but not over approved leave.

When someone marks a day present in place of approved leave, the link to the request is
cleared and the period absences are removed, so the record honestly says the person was
there.

### The register shows the lock without being asked

The daily register view **synthesises leave-derived entries** for approved leave that has no
stored record, so an approved day still appears on the grid. It also returns, for each
person, whether their day is locked by approved leave, so the grid can say so.

The result is that the register can never show somebody as unmarked-present on a day they
have approved leave.

---

## 19. Who can mark attendance, and for whom

### Who may mark

**Only an administrator, the Principal or the Deputy Principal.** A teacher cannot mark
anything, **including their own attendance.**

### Whom may be marked

**Only teaching staff, and only those actively employed.**

Both conditions matter:

- **Office staff are excluded**, including the three seeded leadership accounts.
- **Someone whose employment is terminated is excluded.**
- **A teaching staff member with no position assigned for the year is still included**, and
  appears in a separate group — "not yet assigned to classes". This is deliberate: a teacher
  who has joined but not yet been given a class is still on the register.

The bug this fixed is recorded, and it is worth knowing because it shaped the design: office
staff used to be offered for marking, and the Principal and Deputy rows landed in the
"not yet assigned to classes" group — making it look as though the Principal needed a class.

### The policy screen is scoped separately

**Anyone signed in can read the policy** for their year.

**Only an administrator can change it**, and the Deputy and Principal get a read-only
summary with no Save button at all.

### There is no school-wide usage report

**There is no report of short-leave usage across the school, and none for any individual.**

The only place usage appears is the policy screen, and it shows **the viewer's own usage
this month** — with text making that explicit: "Your short leaves this month: N of M used
**on your own record**" and "This policy is school-wide; the count here is your own usage,
not the whole staff."

So the policy screen shows a personal figure next to a school-wide policy, and says so
twice. It is honest, and it is also a workaround for the missing report.

**The month is the current calendar month on the server, not the month being marked.** For a
backdated record this is a subtle mismatch.

---

## 20. What each role sees

### The teacher

A **My Leave** page: apply, and track the decision. It shows a count of requests awaiting
review, and a card per request with the type, the maternity tier where relevant, the status,
the dates with the half-day wording, and the reason.

A **Cancel** button appears only on requests still pending.

The empty state explains that a request and the Principal's decision will appear there.

**The balance is not on this page** — it is on the dashboard.

**The Deputy's comment is not shown to the applicant.** This is a bug, and it is worth
naming precisely: the request card renders a field called the reviewer's note, but that
field is a **legacy one that nothing writes any more**. The Deputy's actual comment is not
returned to the applicant's own list at all, and the Principal's comment is returned but not
displayed. So **in practice a teacher sees the status and never the reasoning.**

**The Deputy's decision itself is shown** — the status reads "Recommended (Deputy
Principal)" while the request is with the Principal.

### The Deputy Principal

A **Recommend Leave** page — the same screen as everyone else's, with the Deputy's two
buttons.

The buttons appear only while the request is untouched.

### The Principal

A **Finalise Leave** page — the same screen, with the two final buttons.

The buttons are available whenever the request is not closed, which is why a Deputy-rejected
request stays actionable here.

**Bypassing the Deputy** opens the override confirmation described in
[section 6](#6-who-can-decide-a-leave-request).

### The administrator

A **Leave Requests** page, the same screen again, with a **badge on the sidebar entry**
counting everything not yet finalised. So an administrator can see the outstanding workload
without opening the page.

**An administrator reaches the teacher's own leave page as well**, and can apply for leave
themselves.

A **Historical Data** page carries a read-only tab of past leave decisions.

### Everyone

**Nobody can reach another seat's queue.** The Deputy and Principal each have their own
workspace, and the sidebar builds each seat's links from its own area.

---

## 21. What changed from the original plan

The document this replaces was an approved design dated September 2026. The system was then
built. This section records where the two differ, so nobody reads the plan and the software
and assumes one is wrong.

### Contradictions inside the original plan

**The plan contradicted itself about usernames.** The overview said the username was
auto-generated; the identity section said the identity number itself was the username. The
built system follows the second. **Nothing is auto-generated** except a placeholder email
address for a staff member who supplies none.

**The plan said office staff would choose their category at sign-up.** The built system does
not offer this, and the sign-up form still contains text claiming it does. The server-side
reasoning for refusing it is recorded and is a good one.

**The plan listed maternity as an ordinary flat allowance.** The built system has two
maternity allowances — 84 days at full pay and 84 at half pay — because that is the College's
actual rule. The plan predates the decision.

### Built differently

**Payment status was added, and it is load-bearing.** The plan had no concept of it. It now
exists on both requests and allowances, and the allowance uniqueness is by year, type **and**
payment status rather than year and type. This is what makes two maternity allowances
possible.

**The applicant chooses the maternity tier**, rather than the system deciding.

**A Principal override is required to skip the Deputy**, with a written reason and a
confirmation. The plan said the Principal "may act early" without qualification.

**Half-day leave is defined by timetable period ranges**, which the plan never mentioned. The
plan only had a half-day concept tied to a monthly allowance.

**The plan's two extra policy columns were dropped and four were added.** The plan wanted a
monthly half-day allowance and a half-days-per-full-day conversion. Neither exists. What was
added instead is the definition of the two period blocks.

**Office staff were given a staff record on the three seeded accounts.** The plan did not
specify this. It is what causes the "cannot be given a laptop" consequence described in
[section 3](#3-the-three-seeded-accounts).

**Appointing someone to a leadership position now gives them the matching role**, rather
than the general administrator role the plan described. The Deputy-equivalent positions
both map to the Deputy role. A comment in the positions code still says the old thing.

**Sign-up creates a waiting account, not a teacher.** The plan said the account is created
with the teacher role. Approval is a separate step, and four gates must be passed.

**Attendance is fully built and is not the "not yet implemented" the plan's tone suggested.**
Marking, per-day and per-period, with an optimistic save and a visible failure flag.

**The integration runs the other way from what the plan implied.** The plan described
arrival recording *creating* leave. What is built is that **approving leave creates
attendance** and then locks it, and **late arrivals never touch leave at all.**

### Built as the plan said

- Six leave types, including official duty.
- Two-stage chain, Deputy then Principal.
- A Deputy rejection can be overturned by the Principal.
- Quotas per academic year, in the database, editable without a code change.
- The balance is derived, never stored.
- The identity number is the username, lower-cased.
- The three leadership and administrator accounts are bootstrapped on server start.
- A staff category distinguishing teaching from office staff.

### Improved beyond the plan

**The quota is actually enforced.** The plan did not say. An earlier build only checked that
an allowance existed; the built system counts approved days and refuses, with the remaining
figure in the message.

**Overlapping requests are refused.** The plan did not mention it.

**Approved leave locks attendance, with a Principal-only, reason-required override.** The
plan did not mention it.

**Unverified accounts are swept after seven days.** The plan did not mention it.

**Cancel is narrower than planned** — this is a regression rather than an improvement, and
is listed under gaps.

---

## 22. Known gaps

Recorded so the next person does not rediscover them as bugs.

**1. Two half-days do not become one full day.** The request form and the attendance screen
both say so. It is not implemented: half-days are counted flat, and there is no monthly
grouping or half-day allowance.

**2. A request cannot be edited by anyone.** Not by the applicant, not by an administrator.
Combined with the next gap, a request with a typo in its dates becomes uncorrectable the
moment the Deputy acts.

**3. A request cannot be cancelled once the Deputy has acted.** The plan said any
non-finalised request could be cancelled. Only a completely untouched request can be.

**4. The applicant never sees the Deputy's comment.** The card displays a legacy field that
nothing writes, and the Deputy's real comment is not returned to the applicant.

**5. The balance is not on the leave page.** It is on the dashboard, and the application form
shows no remaining figure — so a refusal is the first the applicant hears they are over
quota.

**6. Allowance changes have no screen.** The actions exist and are administrator-only, but
nothing in the application calls them. The plan's promise of changing next year's allowance
without touching anything technical currently means using the administrative interface
directly.

**7. The stored minimum allowance is never used.** It is written, returned, and read by
nothing. There is no minimum-leave validation.

**8. The "ask the Principal to review an exception" advice cannot be followed.** There is no
exception mechanism, and a refused request does not exist to be approved.

**9. A late short leave writes no register record.** The only trace is the monthly counter.
The register does not show the person was late, and there is no short-leave report for an
individual or for the school.

**10. An on-time arrival writes no register record either.** "Nobody marked it" and "present"
are the same thing, and the system is deliberate about that — but it means the register
cannot evidence that somebody was on time.

**11. A late short leave cannot be marked by hand.** The register offers present, partial
and absent only, and choosing present clears any existing record for that day.

**12. The stored "half day" status is unreachable through the register.** It only arises from
the arrival action, and even then the register stores "partial".

**13. Late arrivals do not consume leave allowance.** The plan implied a deduction; there is
none. A teacher late all month accrues attendance records but no leave consumed.

**14. The short-leave month is the current server month,** not the month of the record being
marked, which is wrong for backdated entries.

**15. The Deputy and Principal cannot override approved-leave attendance.** Only the
Principal can. The Deputy can mark attendance generally but not over approved leave.

**16. Three leave records carry leftover fields** that nothing writes any more, from an
earlier single-stage approval design. A cancelled request keeps a permanently empty
"not yet decided" state. These are harmless but untidy.

**17. Office staff are half built.** Settable as a category, exported to the spreadsheet,
and invisible everywhere else — no list, no screen, no workspace, no separate allowance.
They receive a teacher's login, so leave works, but by accident.

**18. The sign-up page contradicts the server.** Its text says teachers and office staff can
both sign up. The server refuses office staff. Anyone reading the form is misled.

**19. The three seeded accounts leave no person on a leave decision.** Their authority is
recognised from the account role, so the record of who decided is blank. A properly
appointed Principal is recorded.

**20. There is no substitute or relief cover.** The field exists on a partial day's period
absences and is never written.

**21. A comment in the position code is out of date,** still describing the old behaviour
where appointing a leadership position gave the general administrator role.

**22. This document was assembled from an automated reading of the system,** and the section
above is the honest limit of that. Behaviour not visible in the code — how the school
actually uses the Deputy override, whether anyone notices the missing Deputy comments — is
not described here, and should be added by someone who has watched it in use.

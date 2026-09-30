# Inventory Management — How the System Works

A plain-English description of the school's property register: what it records, who is allowed to do what, how property moves, and why the rules are what they are.

This document explains behaviour, not software. It contains no code and no file references. Where the system deliberately refuses to do something, that is written down as a decision rather than left as a gap.

---

## Contents

1. [What this system is](#1-what-this-system-is)
2. [The words the system uses](#2-the-words-the-system-uses)
3. [Two people, two different questions](#3-two-people-two-different-questions)
4. [Who is allowed to do what](#4-who-is-allowed-to-do-what)
5. [How a person is identified](#5-how-a-person-is-identified)
6. [What an item record holds](#6-what-an-item-record-holds)
7. [Categories](#7-categories)
8. [Two ways to count stock](#8-two-ways-to-count-stock)
9. [The four ways property leaves the store](#9-the-four-ways-property-leaves-the-store)
10. [Writing off property — the four-stage workflow](#10-writing-off-property--the-four-stage-workflow)
11. [Two permanent records of what happened](#11-two-permanent-records-of-what-happened)
12. [The transfer reasons](#12-the-transfer-reasons)
13. [Notices — telling someone about a change made about them](#13-notices--telling-someone-about-a-change-made-about-them)
14. [Asking a colleague for something they are holding](#14-asking-a-colleague-for-something-they-are-holding)
15. [The administrator's screens](#15-the-administrators-screens)
16. [The teacher's screens](#16-the-teachers-screens)
17. [Codes used in condition, status and method](#17-codes-used-in-condition-status-and-method)
18. [Rules that hold everywhere](#18-rules-that-hold-everywhere)
19. [Deleting a staff member](#19-deleting-a-staff-member)
20. [Printing labels](#20-printing-labels)
21. [Photographs](#21-photographs)
22. [What is deliberately not built](#22-what-is-deliberately-not-built)
23. [Known gaps](#23-known-gaps)

---

## 1. What this system is

The school keeps one register of everything it owns. It answers four questions about any item, at any moment:

- **What is it and how many are there?**
- **Who is the school accountable to if it is lost or broken?**
- **Who is physically holding it right now?**
- **What has happened to it since it arrived?**

Property is permanent. Unlike classes, timetables and leave, the register is **not tied to an academic year**. A camera bought in 2024 is still the same camera in 2027, and its history never resets.

There are two places to use it.

**The administrator's register** is the whole-school view. One person maintains it. It shows every item, every loan, every permanent hand-over, every write-off, and two complete history logs.

**The teacher's own equipment page** is a small self-service view. A teacher can see what they are responsible for, what they are holding, what they have lent to someone else, and what is free to pick up off the shelf. They can hand things back and call things in. They cannot see the whole register, and they cannot see anybody else's equipment.

These are deliberately different. A Principal can run the whole register as an administrator, but the Principal's _own_ equipment page is the same small self-service page a teacher gets.

---

## 2. The words the system uses

| Word | What it means |
| --- | --- |
| **Item** | A tracked product on the register. A line, not a physical thing. |
| **Asset unit** | One individually tracked physical device belonging to an item, identified by an asset tag stuck on it. |
| **Manager** | The person the school is accountable to for an item. The "owner". |
| **Custodian** | The person physically holding an item at a given moment. |
| **Register line** | One row: "20 Office Chairs", or "1 Digital Camera". |
| **Available** | On hand, minus whatever is currently out on loan. Never negative. |
| **Loan** | Property handed over that comes back. |
| **Issue** | Property handed over permanently. It does not come back. |
| **Write-off** | Property destroyed, recycled, sold, donated or returned to a supplier. Needs a signature before it happens. |
| **Retired** | An item taken off the working register. Not deleted. |
| **In store** | Nobody is holding it. |
| **Reorder level** | The number below which the school wants to be warned to buy more. |

The single most important distinction in the whole system is **manager versus custodian**, and it is covered in the next section.

---

## 3. Two people, two different questions

Every item can name two people, and they are not the same person.

- The **manager** is accountable. If a projector is lost, the school asks the manager what happened.
- The **custodian** is holding it. This changes constantly.

Both can be empty, which gives four states. The register shows all four, and it never collapses them into a single "assigned" flag:

| Manager | Custodian | How the register describes it   |
| ------- | --------- | ------------------------------- |
| Set     | Set       | "Manager · …" and "Held by · …" |
| Set     | Empty     | "Manager · …" and "In store"    |
| Empty   | Set       | "No manager" and "Held by · …"  |
| Empty   | Empty     | "In store · no manager"         |

**"No manager" is treated as a first-class problem, not an edge case.** It gets its own statistic card on the register, its own filter, and its own explanation wherever it appears. The reasoning is in the project's own words: unowned equipment is the one number an administrator goes and acts on.

A teacher who leaves the school does not delete their equipment. Both pointers are released — the items simply become unheld, and usually become unmanaged too. The property stays on the register and the history stays intact.

### Two rules about the accountability record

Every change of manager or custodian is written to a permanent history with a reason attached. Two rules make that history trustworthy:

**A change of hands must say why.** Every transfer and every manager change requires a reason, and the reason is one of a fixed list (see section 12). A free-text note can be added alongside it, but it is not a substitute. This is what an auditor reads.

**A custody change and a manager change are recorded as different events.** The history keeps six distinct kinds of change, and the system refuses to let one kind masquerade as another — a row that claims to be a change of custodian cannot also carry a change of manager. Two people can hold these roles at once, and the register needs to be able to say so unambiguously.

### Who may hand over the ownership

The current manager may hand the item on to a new manager. Administrators may do it too. Nobody else may. If you are not the manager and you are not an administrator, the system refuses with a sentence that names the actual manager, so you know who to ask.

The rule is deliberately narrow: **a permission grant says which actions you may perform, never which records you may touch.** Every narrow permission in this system is narrowed again, record by record, in the logic itself. A teacher's "read" permission does not mean "read everything" — every read narrows itself to the caller.

Handing over the ownership **clears the current holder in the same step** and records both facts: the manager changed, and the custodian was released. It is one action producing two history entries, because the person who had it is no longer accountable for it and should not be recorded as still holding it.

### Calling an item back

The manager may **call an item in** from whoever is holding it. The custodian may themselves hand it back. Administrators may do either.

When an item is called in, the manager is left alone. Calling something back is a statement about custody, not about ownership.

### What nobody can do while a loan is open

Three actions are blocked while an item is out on loan, with a message explaining why: a loan is a separate, open obligation with a return condition attached to it, so it has to be closed through the loan-return route first. The three blocked actions are:

- changing the owner,
- calling the item back,
- handing it to the store.

The system does not merely hide these controls. The screens **state the block and its reason**, because a teacher who is refused without an explanation thinks the system is broken.

---

## 4. Who is allowed to do what

Three levels of access exist, and the inventory system uses all three.

### The whole register is administrator-only for changes

Anything that changes what the whole school believes about its property is reserved for a single administrator account. Not the Principal, not the Deputy Principal. Specifically:

- creating, editing, retiring and restoring items
- receiving stock and removing it
- editing individual asset tags
- every custody transfer and every manager change
- issuing property out permanently
- requesting, signing off, finalising and withdrawing a write-off
- creating, renaming and removing categories

The reasoning is the same as elsewhere in the application: the leadership seats can read the ledger and work inside their own queue, but they do not get to change the rules for everyone else.

### The whole register is readable by the leadership seats

The Principal and Deputy Principal can read everything — the register, asset tags, loans, issues, write-offs and both history logs. Reading is not changing.

### Teachers get a deliberately small set

A teacher's entire inventory surface is three permissions, and each is narrow:

- **Read** — see their own equipment, see the small catalogue of items free to take, see the history of anything they hold or are in charge of, raise and decide requests.
- **Take** — claim an item for themselves, hand one back, raise and decide a request, acknowledge or dispute a notice.
- **Manage own** — hand on the ownership of an item they are the manager of, or call one in that they are the manager of.

The design reason these are three separate permissions rather than one "can manage equipment" flag: the hand-back button is the one a teacher needs most, and if it were unlocked with a general edit permission they would also gain the ability to change item details, adjust stock counts, move custody between other people, and cancel write-offs. Those are unrelated powers and should not arrive together.

### The four ways a read is narrowed

Every read available to a teacher narrows itself. There are only four techniques used, and knowing which is which explains most of the system's behaviour:

1. **Return only records that name the caller.** "My items" returns what you hold or manage.
2. **Return only records connected to the caller.** The custody history of an item is visible if you hold it or manage it.
3. **Return fewer fields.** This is the subtle one. The catalogue of items free to take returns a deliberately narrow set of details that simply **does not contain any person's name**. There is no filter hiding anybody — the information is not in the answer at all.
4. **Refuse, with a reason.** Scanning a QR code for an item you have no connection to is refused, and the message tells you which connections would have worked.

The third technique is worth dwelling on. It means a teacher browsing the takeable catalogue _cannot_ learn who manages a projector, because that value is never sent to the browser. This is stronger than filtering, because there is nothing to filter later.

### A login with no staff record

The three seeded leadership accounts — Principal, Deputy Principal, Administrator — have no staff record attached, on purpose: they are pure admin accounts and never appear in staff lists or attendance.

The consequence catches people out, so it is worth stating plainly: **none of the three can be the custodian or the manager of anything.** Every action that records a person requires a staff record, so a seeded login is refused with a message asking an administrator to link the account to a staff profile.

This is not a bug and it is not a privilege. The Principal can run the entire register and sign off write-offs, but cannot be handed a laptop. Anyone who is to be given a microscope, a projector or a laptop needs a real staff account first.

Note the shape of the refusal. Being refused for a _missing staff record_ is treated as a bad request, not a permission failure — "you have not got a staff profile yet, go and get one" — which is a completely different message from "you are not allowed to do this." The system is careful about the difference, because a person who has never been set up is not a person who has been refused permission.

---

## 5. How a person is identified

Most people acting on the register are identified by their staff record, not by their login. This is deliberate, and it is why the register points at people rather than accounts.

Consequences worth knowing:

- Someone who leaves the school can still appear throughout the history. Their name is preserved on every movement and every change, forever.
- A login with no staff record can still _read_ the register if it has leadership authority. It simply cannot be recorded as holding anything.
- A person can be named in a record without ever having held a login.

Where a name would be needed and the person is gone, the register does not print a raw identifier or a blank. It prints a human phrase — the person is no longer on the staff roll. Where a record is signed by an account that had no staff record at all, it says so in words rather than showing nothing.

---

## 6. What an item record holds

### Identity

**A stock code.** Every item has one, in a fixed format: the letters "INV" followed by exactly five digits. If you do not type one, the system generates one. Codes are always stored in capitals, and the system treats "inv-12345" and "INV-12345" as the same code. A code can never be changed once the item exists.

**A name**, which cannot be blank.

**A category**, which cannot be deleted out from under live items.

### Counting

**How many are on hand.** Never negative.

**How many are out on loan.** Never negative, and never more than are on hand.

**How many are free to hand out.** This is never stored. It is worked out as on-hand minus on-loan, and it can never go below zero.

**The unit of count** — what one of these is counted in. "Chair", "box", "metre". There is a list of common ones and a free-text option, because schools count things in whatever way makes sense to the department doing the counting.

**A reorder level.** When the number on hand falls to or below this, the register shows a warning. Two deliberate choices here:

- It is a **warning, not a rule**. Nothing stops you setting stock below the reorder level, or writing stock off entirely. A hard floor would block a write-off at exactly the moment it is most needed.
- On an edit, you cannot _set_ a reorder level above the number currently on hand, with a clear message saying so. But you are allowed to have arrived at that position by other means, such as receiving stock or returning a loan.

### Character

**Condition**, from a fixed set: good, fair, damaged, under repair.

**Location** — free text. Where it is kept.

**Whether staff may take it.** This is off by default, and the safe direction is the default. Turning it on is what puts an item into the catalogue that teachers can browse and pick up.

### Money

**Purchase value** and **current value**, both optional.

Money is handled as plain decimal text the whole way through — never as a floating point number, because decimal numbers in binary cannot represent values like 1250.50 exactly and would slowly drift. Amounts must be typed as digits with at most two decimal places and no thousands separators: type _1250.00_, not _1,250.00_. The system says so on every money field, and the amount box deliberately is not a number picker, because number pickers let in exponents and stray characters that the format does not allow.

Blank means "leave it as it is" on an edit. Neither field assumes a currency.

### Responsibility

Who created it, who manages it, who holds it. Creating an item lets you seed the first manager and the first holder, which is a convenience — the system writes the opening history entries for you, with no reason, because there is nothing to explain yet.

### Retirement

An item is **retired**, never deleted. Retiring sets a retirement date and takes it off the working register. Its history, its loans and both logs all keep referring to it.

An item cannot be retired while any of its asset tags are still out — borrowed, issued or written off. The system names the specific tag that is blocking it and says what to do about it.

Retired items can be brought back. Bringing one back takes no reason, because a retirement is reversible and a change of hands is not. **Seeing retired items is restricted to administrators**, and the reason is scale: turning the filter on reveals every retired record in the school at once.

On a retired item the register suppresses the normal status badge entirely and says, in words, that it is not on the register and nothing can be lent, issued or written off against it. Its row also offers exactly one action — bring it back. The other nine actions are hidden, because every one of them would be refused by the system, and offering a control that cannot succeed is worse than offering nothing.

### What cannot be edited in place

Four things on an item are deliberately **not** editable by typing a new value:

- the number on hand
- the number out on loan
- who manages it
- who holds it

The first two are consequences of movements, not edits. Changing a count by typing a number would leave no record of who changed it or why. They move only through receiving stock, removing stock, loans and returns.

The second two would fork the accountability history, and would let a change of hands happen without a reason. They move only through the custody and manager procedures, which write the history.

The edit screen therefore opens with a short list of the four things it cannot change, each with a working button that takes you to the right screen for it.

---

## 7. Categories

Items are grouped into categories. Eight starter categories are provided, covering IT equipment, lab equipment, sports equipment, audio-visual, furniture, cleaning, kitchen and other. Each has a colour.

**Starting categories is safe to repeat.** Running it again adds anything missing and changes nothing that already exists. The register tells you how many were added and how many were already there, and if everything was already there it says so plainly rather than reporting a change that did not happen.

**Names are compared loosely.** Two categories that differ only by capitals, surrounding spaces or repeated internal spaces are the same category. So "IT Equipment", "it equipment" and " IT Equipment " all collide. Without this, you would end up with three of the same category and no way to tell them apart later.

**Colours must be a real hex colour**, six digits after a hash, and the field says so.

**A category cannot be removed while live items use it.** The refusal names the category and offers both ways forward: move the items, or retire them.

**Retired items do not block removal.** A category holding only retired items can be removed, because the history keeps the old name.

**Unused categories are listed too**, deliberately. A category with nothing in it still has to be visible, because otherwise the empty register has no way to offer you the starter set in the first place.

---

## 8. Two ways to count stock

An item is counted one of two ways, and the system treats both as completely normal.

**Tagged.** The item has individually tracked asset tags — physical labels stuck on specific devices. Twenty laptops are twenty tags, and you can say which laptop is which. Tags are unique across the whole school, not just within an item, so a tag number can never mean two things.

**Bulk-counted.** The item has no individual tags. It is a counted quantity — twenty office chairs, five boxes of cable. This is not a lesser kind of record. A bulk line can be lent, issued and written off exactly like a tagged one.

This distinction is decided in one place, so every operation agrees about it. The rule is:

- if you **named specific tags**, those exact tags are used
- if you **named no tags** and the item has tags on file, the **oldest available tags are chosen for you**, oldest first
- if you **named no tags** and the item has **no tags on file**, it is a bulk line and nothing individual happens

That last point has a visible consequence throughout the register: for a bulk line, the response says "no specific units" rather than returning an empty list. The two are different, and the difference is preserved everywhere it matters.

### Naming tags

**You may name fewer tags than the quantity, or more.** Both are refused, with the two ways out spelled out: name one tag for each unit, or clear the field and let the system choose the oldest ones for you. Refusing with a route out is the pattern the whole system follows.

The interface offers a one-click **"select the oldest N"** that does exactly what the server would have done, so the two can never disagree.

**A tag list must be all or nothing.** You cannot name three tags for five units. Either you name them all or you name none.

**Duplicate tags are refused**, naming the tag that was repeated. When pasting a list from a spreadsheet, the paste box splits on line breaks, commas and semicolons. If the pasted list is longer than the quantity allows, the extra tags are **not thrown away silently** — they are set aside and offered back, so you can either restore them and raise the quantity, or accept the smaller quantity knowingly.

**Receiving stock requires exactly one tag per unit received.** This is the only operation that creates asset tags, and the count is checked twice — once against what you typed, and once after blanks are stripped — with a message that explicitly says blank tags are not counted.

**A tag already on file is refused** with a message that tells you to check the label and use the tag as written on the device. This is the single most common real-world problem with asset registers, and the message is written to match it.

Asset tags can also be generated automatically for you when receiving stock, in a clearly synthetic format that is obviously not a real manufacturer's label.

### Asset tag status

Each tag is one of: available, borrowed, issued, disposed, or removed.

- **available** — on the shelf
- **borrowed** — out on a loan
- **issued** — gone permanently
- **disposed** — written off
- **removed** — taken off the shelf without a write-off (see section 9)

**Only two of these five can be set by hand** — available and removed. The other three change only through the operation that owns them, and the register says which:

- a borrowed tag becomes available again when the loan is **returned**
- an issued tag is **terminal** — it left the store permanently and there is no bringing it back
- a disposed tag changes when a **write-off is finalised**

So the asset register offers exactly two verbs on a tag: remove from stock, and restore to stock. It never offers a control that would be refused.

Setting a tag to "removed" reduces the item's on-hand count by one and raises the count again when it is restored. Both are ledger entries — a tag never silently changes the count of its item.

---

## 9. The four ways property leaves the store

The single most important rule in the whole system:

> **Two counters mean opposite things, and the system refuses to confuse them.**

- **On hand** counts property the school owns. Issuing, disposing and removing stock reduce it.
- **Out on loan** counts property that is temporarily elsewhere. Loans and returns move it and nothing else.

A loan never reduces the on-hand count. An issue never increases the loan count. This is enforced throughout, and the two operations carry warnings explaining why, because getting it backwards is the natural mistake.

### Loans

A loan is property handed to a staff member or a student that comes back.

A loan needs: the item, a quantity, a purpose, **and a date it is due back**. The due date is mandatory, on the reasoning that a loan with no date cannot be chased.

A loan has exactly one borrower — either a staff member or a student, never both and never neither. The system enforces this by construction rather than by checking, and the underlying record is protected so it cannot be corrupted into having two borrowers or none.

An administrator cannot be the borrower. Neither can an account with no staff record.

Lending something not marked as lendable is refused with a clear message. Lendable-ness is opt-in per item.

When a loan is returned, the condition it came back in is **mandatory**, even for a bulk loan, because the returned condition is the whole point of recording a return. It **overwrites** the tag's condition rather than merging with it — the tag now reads as it actually is.

A returned loan is closed forever. Trying to return it twice produces a message naming the date it was already returned.

The system also guards against its own records drifting: if the counters say one thing and the loan says another, the return is refused with a message that explains the discrepancy and says the register needs reconciling. A bulk loan with no tags attached is caught the same way.

Borrowers are shown with as much identifying detail as exists. A student is shown with their admission number and their class, where one is known, and the screen says "no class this year" rather than leaving a blank. A departed colleague is shown as departed.

The loans list can be filtered to open, returned, or overdue. Overdue is calculated by the system against today's date, not stored, so it is never stale. Loans sort overdue first. **How overdue a loan is does not change based on who borrowed it** — a student and a teacher are treated identically on purpose.

### Issues

An issue is property handed over permanently. It does not come back, and there is no cancellation and no return flow for it.

An issue needs the item, a quantity, and a recipient. The recipient is **free text, not a staff lookup**, for a specific reason: an issue often goes to a student who is leaving, and inviting a staff record for someone on their way out is wrong. A student's name goes in the text field and stays there.

Contact details for the recipient are optional, and phone numbers are normalised to a consistent international format when supplied.

An issue can carry an expected return date, but this is explicitly a **reconciliation note for a human to read, not a commitment** — there is no return flow to enforce it. The loans list shows issues that are past their expected return date with a neutral marker, and that marker is deliberately not a workflow state, because an issue is a finished fact.

An issued tag is terminal. The register says so before you confirm, in the confirmation dialog itself.

Confirming an issue is a two-step action. The confirmation names the quantity and the recipient and states plainly that the units leave the store permanently with no return and no cancellation.

### Removing stock without a write-off

Stock can be removed from the shelf without a full write-off process — for goods, spoiled stock, or items leaving without documentation.

This is named **"Remove from stock"**, not "Write off stock", and the rename is deliberate: "write off" in this system means a specific, two-signature process, and borrowing the word for a one-step removal made the register harder to read.

It still requires a reason, which is mandatory and must be at least a few characters. The field is labelled with the reason it exists: this is the first line of the removal record.

It optionally records who authorised it. The screen is careful to label this as _recorded, not enforced_ — the system writes down a name but does not check that the person was allowed to authorise anything. Being honest about the difference matters more than pretending the check happened.

It optionally records a condition override, with a description that explicitly **forbids inferring the condition from the reason text**. If someone writes "broken", the system will not quietly mark it damaged. Either the condition is chosen or it is not.

Removed tags can be restored, which raises the count again.

**None of this needs a signature**, and the screen says so in two places before you start.

---

## 10. Writing off property — the four-stage workflow

Writing off property is the only irreversible thing in the system, so it is the only process with more than one signature. It has four stages, and **two of them move nothing at all**.

The path through the four stages is:

- **Raise a request.** The property is still on the shelf. Tied tags are recorded and held.
- **Sign it off.** The property is still on the shelf. Nothing changes.
- **Finalise.** The on-hand count drops by the requested quantity, and the tied tags become disposed.
- **Withdraw** — available from either of the first two stages. The property is still on the shelf, and the tied tags are released and left exactly as they were.

Only the third stage changes anything. That is the entire point of requiring two people.

| Stage | On-hand count | Loan count | Tag status | Tied tags |
| --- | --- | --- | --- | --- |
| Raise a request | unchanged | unchanged | unchanged | recorded, held |
| Sign off | unchanged | unchanged | unchanged | unchanged |
| Finalise | **reduces** | unchanged | becomes disposed | unchanged |
| Withdraw | unchanged | unchanged | **untouched** | released |

**Raising a request moves nothing.** The quantity is still on the shelf. The screen says this in a notice before you fill anything in.

**Signing off moves nothing.** The quantity is still on the shelf. The screen says this too.

**Only finalising removes the property.** This is the entire point of the two-signature design: nothing can be written off by one keystroke, and the person who raises a request cannot be the person who signs it off.

**Withdrawing moves nothing, and does not undo anything**, because nothing was done. Tags are left exactly as they were. The screen says this in a notice as well, and the withdraw button is deliberately **not** styled as a destructive action — nothing is being reversed.

### Separation of duties

**You cannot sign off a request you raised yourself.** The refusal is explicit about it. This is the reason the two-signature design exists at all.

### Withdrawing

A withdrawal **requires a reason**, with a character limit and a live counter. It is the only mandatory field anywhere in the write-off process — everywhere else, almost everything is optional.

You can withdraw a request that is awaiting a signature or has been signed off. You cannot withdraw one that has been finalised, and the message says why: a finalised certificate is not reversible.

### The six final outcomes

A write-off ends in one of six ways: disposed, recycled, auctioned, written off, donated, or returned to supplier. Exactly one must be chosen at finalisation, and each carries a sentence describing what it means, shown as the description of the choice so you know what you are picking.

The reason for disposal is asked for at the _request_ stage, separately from the method. Both are kept.

An estimated value can be given when requesting, and revised at finalisation. If you leave it blank at finalisation, the original estimate is kept rather than erased.

### Choosing which tags

You may pin specific tags to a write-off request, or pin none.

**Pinning none is allowed and means the tags are chosen at the moment of finalisation**, oldest first. The screens say this at the point of the choice, because a request that names no tags and a request that names the wrong tags fail in very different ways.

A tag can only be pinned to one open write-off at a time. If it is already pinned to another request that has not been finalised or withdrawn, the system refuses and names the tag.

The availability of stock is **re-checked at finalisation**, not trusted from the time of the request. A request raised in January may be finalised in March, and the world may have changed in between.

### What the system will not let you do

- Finalise a request that has not been signed off.
- Sign off a request that is not awaiting a signature.
- Withdraw a finalised request.
- Sign off your own request.
- Finalise using an outcome that is not one of the six.
- Enter a final estimated value in a format that is not a plain amount.

### The status history

Every transition writes a history entry: where it came from, where it went, who did it, when, and any note. The first entry has no "from".

The screens handle a departed colleague and an account with no staff record in words rather than blanks.

The list is ordered so the **queue comes first** — anything awaiting a signature sits above everything else.

Four summary tiles come from the system rather than being counted in the browser: awaiting a signature, signed but not finalised, finalised, and withdrawn. The tiles are the server's answer to the same question, so they cannot disagree with the rows.

If the summary says there are requests awaiting a signature but no row shows one, the screen says so plainly rather than showing an empty list that looks like there is nothing to do.

### The default filter is deliberate

The write-off list opens on **"signed off"**, not on "awaiting a signature", and the reason is worth recording: the queue is the one view whose permissions the server is most likely to refuse for whoever is looking at it, so the default is the one that works.

---

## 11. Two permanent records of what happened

The system keeps **two separate permanent logs**, and they answer different questions.

### The movements log

This one answers **"how many are there, and who moved them?"**

It records every write that could change either count, and it stores **both sides of both counts** — the value before and the value after — not the difference. The difference is worked out when the log is displayed.

Crucially, it also records writes that **moved nothing**: a change of custodian, a signature on a write-off, a withdrawn request. These appear with identical before and after values. That is on purpose — "nothing moved, and here is who did it and why" is exactly the kind of thing an audit needs to see.

There are seventeen kinds of movement entry, grouped as:

- **Item lifecycle** — created, edited, retired
- **Stock** — received, removed
- **Hand-over** — issued, borrowed, returned
- **Custody** — taken, transferred, released
- **Ownership** — appointed, changed, cleared
- **Write-off** — requested, approved, finalised

Each entry also carries contextual detail relevant to that operation: the asset tags involved, the supplier and invoice for a delivery, the reason, who authorised it, the names of both parties in a transfer, and a flag when the item was counted in bulk.

Two deliberate details:

- **Bringing a retired item back is recorded as an edit**, because there is no "restored" verb in the movement vocabulary. The entry carries a note saying it was a restore and when it had been retired.
- **Withdrawing a write-off request is also recorded as an edit**, for the same reason. The detail records that it was a withdrawal and which state it came from. The source explains twice over why inventing a verb for this would be wrong.

### The change log

This one answers **"what did this record look like before somebody changed it?"**

It records creation, editing, retirement, restore, stock movements, tag edits, issues, loans, returns, and every step of the write-off workflow, plus every category change and every custody and manager change.

It stores the full previous state and the full new state for each record it touches.

Its action names are **ordinary words — created, updated, deleted — not the movement vocabulary**. This is deliberate: the two logs are different vocabularies for different jobs, and forcing one onto the other made both harder to read.

### Why the actor's name is stored on every log row

Every log row carries the person's **name written down at the time**, not just a reference to their record.

This is the single most deliberate design decision in the history system, and it has two effects:

- A person who leaves the school is still named throughout the history. Deleting a staff member does not anonymise the school's past.
- The log cannot be wedged. A row whose actor reference is cleared when the person is deleted still has a name, so it stays valid and readable.

### How the two are displayed

The movements screen shows the sign of every change — a real plus sign and a real minus sign, with a spoken alternative for screen readers — and a collapsible before-and-after panel giving both counters either side.

The change log screen shows a **field-by-field difference**: changed rows first, unchanged rows tucked behind a count. Selecting an item filters the log to that item; selecting another kind of record clears the item selection, because the two cannot be combined.

The "who made this movement" filter cannot name someone who has left, and it says so. It also states plainly that the three leadership accounts do not appear in it — they can move stock, but they have no staff record, so there is no person to attribute the movement to. The screen explains that rather than leaving an administrator to wonder.

The row limit is adjustable, and every screen says whether the list it is showing is the whole thing or only the first page.

---

## 12. The transfer reasons

Every change of custodian and every change of manager requires a reason, drawn from a fixed list of eight:

| Reason | When it applies |
| --- | --- |
| Teacher transfer | Moving between teachers, or a request approved by the holder |
| Staff departure | The holder is leaving the school |
| Damage repair | Sent for repair |
| Class reallocation | Moved to suit a class or department change |
| Long absence | The holder is away for a long period |
| Returned to store | Handed back to the store |
| Misassignment | Recorded in error and being corrected |
| Other | None of the above |

The last two are the honest escape hatches, and the presence of "misassignment" is a recognition that records are sometimes wrong and corrections are legitimate.

Three actions supply their own reason rather than asking:

- **Taking an item for yourself** records no reason. Nobody needs to justify claiming a projector.
- **Handing an item back to the store** records "returned to store", always.
- **A request approved by the current holder** records "teacher transfer", always.

Any other transfer asks the person to choose.

There is always a **separate free-text note** field, and it never replaces the reason. The reason field carries a permanent explanation of why it is required, and that explanation cannot be replaced by a caller's own text — if a screen supplies its own description, the standard rule is still shown.

Where a reason is genuinely not required, the field stops being required and says so.

---

## 13. Notices — telling someone about a change made about them

If an item is taken away from you — you were the custodian and now you are not — you get a **notice**. This is one of the more thoughtful parts of the system.

**A notice appears when:**

- a custody change affects you as the previous holder, or an ownership change affects you as the manager
- **you did not do it yourself** — you are never notified about your own action
- **you have not already dealt with it**

You can do one of two things with a notice:

- **Acknowledge** it — "yes, I know this happened". This closes it permanently. Doing it twice is harmless.
- **Dispute** it — "this never happened", with an explanation, which is mandatory and has a length limit.

**A dispute does not reverse anything.** It flags the record as contested and writes your explanation against it. It does not put the item back. The system is honest about this: the button says the change is being flagged, not undone.

A record cannot be disputed twice, and cannot be disputed without being acknowledged first — both are refused with clear messages.

Notices are capped, newest first, and a login with no staff record sees none rather than an error.

The system also keeps the plain rule that **a dispute must carry a note**. It is impossible to flag a record as wrong without saying what the right version is.

---

## 14. Asking a colleague for something they are holding

If an item is held by someone and you want it, you cannot simply take it. You **request** it.

The request captures who is holding it **at the moment you ask**, and that is who can decide it. This matters: if the item changes hands after you ask, the request is stale, and the system refuses to approve it and tells you to raise a new one. It does not silently transfer an item away from its new holder on the strength of a request aimed at the old one.

Refusals, all with plain wording:

- an administrator account cannot request equipment
- an account with no staff record cannot raise a request
- an item not marked as lendable cannot be requested
- **an item nobody is holding cannot be requested** — take it directly instead
- an item already assigned to you cannot be requested
- an item marked damaged is not requestable
- you cannot have two open requests for the same item

You can only request from someone who is actually holding it. The list of requestable items is the mirror image of the takeable catalogue: it names the current holder, and it is the one place a teacher legitimately learns a colleague's name in relation to an item.

**Approving a request is the transfer.** There is no separate "approve then transfer" step. Approving hands the item over, writes the custody history with the reason "teacher transfer", and logs the movement. The system records that the transfer happened via a request.

**Denying is a single ordinary click.** Approving requires press-and-hold confirmation, and that asymmetry is deliberate: the two buttons are not equally weighted, because one of them takes an item away from someone.

Only the person currently holding the item, or an administrator, can decide a request. If that person has since changed, the request cannot be approved.

Requests are shown as a banner on the equipment page, oldest first, with the extras collapsed. The holder is notified without a refresh. **A login with no staff record sees none.**

**One gap worth knowing about:** the request can be _approved_ or _denied_, but there is no way for the person who raised it to **withdraw** it. The system recognises "withdrawn" as a possible state everywhere — it is a valid status, the records allow it, and live updates mention it — but no operation produces it. A request you regret can only be dealt with by the holder.

---

## 15. The administrator's screens

### The register

The main view. One row per item, with a checkbox column, then:

| Column | Notes |
| --- | --- |
| **Asset** | Name, stock code, category with its colour, and either how many individual tags exist or the words "Counted in bulk" |
| **Responsible** | Both accountability states, side by side |
| **On hand / available / loan** | Three figures, each labelled for a screen reader |
| **Status** | Where the item stands |
| **Condition** | Hidden on narrow screens |
| **Location** | Hidden on narrow screens |
| **Actions** | The row menu |

**The item name is the only clickable part of the row.** Clicking it opens the custody history, because that is what you want when you click a specific item. The row itself is not a link, so there is no large invisible target doing something surprising.

**Sorting is done in the browser over the rows already loaded, and the screen says so** in a visible note above the table, which every sort control is tied to for screen readers. There are three sort states, not two: unsorted, one way, and a third click that hands control back to the server's own order. The number of rows is capped, so the note is not decoration.

**"Responsible" is deliberately not sortable.** Sorting by two people at once is not meaningful.

An item at or below its reorder level gets a small "At reorder level" marker in the counts column, using the same calculation as the filter, with no extra condition that could make the two disagree.

When an item's status is damaged, the condition column does not print a second identical red badge. It prints one muted line saying it is damaged and taken off the available count.

### Filtering

Seven controls, wrapping onto a second row on a narrow screen:

- **Search** — matches name, stock code and description
- **Status** — ordered for triage: out of stock, borrowed, damaged, available
- **Category**
- **Condition**
- **Custodian** — "who is holding it"
- **Low stock only** — a toggle
- **Show retired** — a toggle

Plus **Clear filters**, which only appears when something is set.

**The status list is checked against the set of possible statuses at build time**, so if someone adds a fifth status and forgets this list, it fails to compile rather than quietly offering four of five.

**Filters are not stored in the address bar.** They are deliberately component state. The reasons are practical: filters are exploratory and transient, putting them in the URL makes every filtered view a shareable link that means nothing to anyone else, and it would make the browser's back button fight the user. The one thing that _is_ in the address bar is the search box on the teacher's own equipment pages.

Two controls deserve note:

- **"Show retired"** is a toggle rather than something that can be refused. Only administrators reach this page at all, so the control can never be one the server turns down.
- **"No manager only"** is a separate toggle below the statistics, not one of the seven. It is the one filter computed in the browser rather than by the server, and the screen says so in two places — on the toggle and on the card that counts unowned items. It filters the loaded page, so the note also says when the page is only part of the register.

The count line under the filters has three forms, and each is honest about a different situation: everything is shown, a filter is narrowing things, or the list is only the first page of a longer register.

### Statistics

Seven tiles, in triage order: items, units, available, borrowed, low stock, out of stock, and **no manager**.

The borrowed and low-stock figures are warnings. Out of stock is the serious one.

**The figures are honest about their sources.** "Low stock" and "no manager" are totals for the whole register, asked of the server. The others are worked out from the rows on the page. "Borrowed" is the only figure that cannot be derived from item rows at all, so it is a separate question.

**The tiles are not buttons.** The one that has an action attached — no manager — has its own separate toggle, so a keyboard user has one control to reach, not seven.

### Row actions

A live item offers: view custody history, transfer custody, assign or change manager, hand on the ownership, call it back, and then either return it to the store or take it, depending on whether you are holding it. Then edit details, and finally retire.

A **retired** item offers exactly one action: bring it back.

Two actions are deliberately **not** hidden based on data the row already has: handing on the ownership is offered even when no manager is set, and calling back is offered whenever anyone is holding it. Their success depends on **who is asking** or on whether the item is on loan, neither of which the row can know. Rather than guess, the system shows the action and states the possible refusals inside the dialog.

The dialogs for these two open with a permanent panel headed **"Who can do this"**, quoting the server's own wording with the actual names in it. A teacher who cannot hand on an item's ownership learns that the current manager can, by name, without having to guess.

### Opening dialogs

Every dialog that makes a change follows the same rules:

- It **previews what will be recorded** before you commit, in plain words, including both names where a change of hands is involved.
- It **refuses to start on a state the server will reject.** Where the row shows the problem up front, the dialog states it rather than letting you fill in a form that cannot succeed.
- **A refusal leaves your input intact.** If the server refuses, the dialog does not clear what you typed. This is a deliberate, repeated decision.
- **A field left untouched is not sent as a removal.** "No manager" is a real, audited change, so a blank field and a cleared field have to be distinguishable. Blank staff fields show a dashed "none selected" marker, because a blank box cannot otherwise express "leave this alone" versus "remove this person".
- **Clearing a manager is a two-step, escaped action.** Choosing to remove the manager requires a confirmation whose cancel button reads "Leave them as it is", and the confirm dialog previews exactly what will be recorded as a result. The state of the field is tracked as three distinct intentions — leave alone, appoint, clear — rather than as a nullable value, precisely so that a blank never means "clear" by accident.
- The submit button **stays enabled** and the schema produces the message, rather than a disabled button with no explanation.
- Dialogs that can lose unsaved work ask about it, with "keep editing" and "discard" — and the question is dropped entirely if the form has gone back to clean.
- The create and edit dialogs keep their footers **outside** the form area so the buttons do not scroll away from a long form.

### The records area

A second area holds the four record views, plus the two ledgers:

1. **Loans** — with the overdue count on the tab itself
2. **Issues**
3. **Write-offs**
4. **Asset register** — every individual tag, its item, its status, condition, location and last change

Two direct actions sit above them: receive stock, and remove from stock. Both are named for what they do, and both carry a note that they take effect immediately and need no approval — which is the deliberate contrast with the write-off process, which needs two signatures.

The asset register has six counters — total, available, borrowed, issued, disposed, removed — counted over the loaded page, with a note when the page is partial.

Where an individual tag needs a change, the row shows **the procedure that owns its state** and a single action. A borrowed tag says so and offers nothing, because the return process owns it.

### The two ledgers

**Movements** and **Change log**, side by side. Both filter by item, by date range, by row limit, and by who made the change. The change log additionally filters by record kind.

The movements table carries a caption explaining that the two counters move independently, which is the single most confusing thing about the register if you are new to it.

---

## 16. The teacher's screens

### One page, three questions

The teacher's equipment page answers three questions, in three sections:

| Section          | The question                       |
| ---------------- | ---------------------------------- |
| **In charge of** | What am I accountable for?         |
| **In my hands**  | What am I holding?                 |
| **Lent out**     | What have I given to someone else? |

The distinction is exact. Something you are the manager of **and** holding appears in the first section only. Something you hold but do not manage appears in the second. Something you manage that somebody else holds appears in the third.

The third section is **hidden entirely when you have nothing in it**, so an empty band does not appear on the page.

If you hold an item that is on loan, it shows in your section, with the counts making it clear how much of it is out.

### What a row offers

Three actions: **report a problem**, **history**, and **hand back** — the last only when you are actually holding it.

**Reporting a problem copies a message to the clipboard** rather than opening a form. There is deliberately no way to report a problem from inside the register itself; a report is something you raise with a person, not a record you write. The copied text is a full, well-formed sentence, not a template with blanks.

**The row is clickable but is not a tab stop.** The three buttons are the keyboard route, and they stop the click from also opening the history.

**There is no "take" action on a row you already hold**, and no "hand back" on one you do not. The register never offers a control that would be refused.

### Where it is

Instead of the register's status badge, each row says **where the thing actually is**, in words: out on loan, with you, in the store, or with a named colleague. The recorded location sits underneath.

This is a deliberate replacement. The register's status is a property of the register line — out of stock, borrowed, damaged — which is the wrong question when you are asking about a laptop in your hand.

### Taking something

A catalogue of items free to take, filtered by search and category, and **no more filters than that** — a deliberate restraint.

Each row is a button showing the category, name, stock code, location, how many are free, and a plain statement of what taking it means: it goes into your hands until you hand it back.

**Out-of-stock items are not hidden.** They are shown, greyed, with a count of what is available. Hiding them would leave a teacher wondering whether the item exists.

**Changing a filter clears your selection**, because a selection made under one filter is meaningless under another.

Taking is a single step with a preview — no second confirmation. It is not a destructive action, and a teacher picking up a projector does not need to be made to confirm it twice.

### Handing something back

One dialog. An optional condition, an optional note with a length limit. The cancel button reads **"Keep holding it"**, and focus starts on the cancel button — so a teacher who reaches for the keyboard expecting to back out does.

The button reads **"Hand it back"**, not "Return". The system uses "return" for a loan being closed, and borrowing the word for putting an item on the shelf made the two unclear.

### Calling something in, and handing on ownership

Both available from the "lent out" section, and both are the teacher's own to use **only where they are the manager**.

**Calling something in** is two steps: the first explains the consequences, the second commits. The cancel button reads **"Leave it with them"**, and the confirmation states the three things that will happen — the holder loses it, the owner keeps it, and the record is permanent — and what the register will now claim about where the item is.

The success message **deliberately does not say the item came back.** It records that the custody was called in. The item's location is not something the system can assert.

**Handing on the ownership** requires naming a successor and giving a reason. The successor must be chosen from current staff. It is notable that the successor can only ever be **the person currently holding the item** — the equipment page has no wider staff list to choose from, and the screen says so rather than pretending otherwise.

The dialog states the three refusals that can apply: naming the current manager, the "nobody manages this" case, and the item being out on loan.

### Notices

A section at the top of the page, only when there are any. Each notice describes the change in one sentence written for **your** role in it — as the previous holder, or as the manager. Two actions per notice: acknowledge, and flag this as never having happened.

### Requests

A banner for requests other people have made for things you are holding, oldest first. **Deny is one click. Approve requires press-and-hold.** Approving takes the item away from the person who asked, so the two are not given equal weight.

A separate dialog to ask a colleague for something they hold, with a note addressed to them. It also offers to open the camera instead, if the item has a label you can scan.

### Scanning a label

Items can carry a printed label with a code on it. Scanning it opens a page for that item, and the page shows three buttons — **borrow this item**, **hand this back**, and **request this item** — each shown only if the system says you can.

**The three buttons are driven entirely by the system's own judgement**, not by guesswork in the browser. If you scan an item you have no connection to, you get a page explaining that you can only scan something that is free to take, free to request, or that you already hold or manage, with a link back to your own account.

The scanner needs the rear camera, and the page works around the browser quirks that stop that working on phones.

### The summary on the dashboard

The dashboard shows three tiles — in charge of, in my hands, lent out — worked out by asking the same two questions the page asks, so the dashboard and the page cannot disagree.

---

## 17. Codes used in condition, status and method

The system uses a small number of fixed lists. Each has a human label, and the system supplies the label rather than making the interface translate codes itself.

**Condition:** good, fair, damaged, under repair.

**Asset tag status:** available, borrowed, issued, disposed, removed.

**Loan status:** borrowed, returned.

**Movement kind:** seventeen, grouped in section 11.

**Custody change kind:** six, covered in section 3.

**Request status:** pending, approved, denied, withdrawn — although nothing currently produces the last one.

**Write-off method:** disposal, recycling, auction, write-off, donation, return to supplier. These are the _method_. The _outcome_ at finalisation is a different list of six: disposed, recycled, auctioned, written off, donated, returned to supplier. The two lists overlap almost exactly, and the system keeps them apart because they answer different questions — method is chosen at the request stage, outcome at finalisation.

**Write-off status:** awaiting a signature, signed off, the six final outcomes, and withdrawn.

Where a code has no known label — because something was added to the database without the interface catching up — the screen shows a readable version of the code rather than a blank or a raw identifier. Where a value was never set, it says "not set".

---

## 18. Rules that hold everywhere

These are the rules that cut across everything above. Each is enforced, not merely intended.

**1. On-hand and out-on-loan are opposite facts.** Issuing, disposing and removing reduce on-hand. Loans and returns move the loan count and nothing else. A loan never reduces on-hand; an issue never increases the loan count.

**2. Available is worked out, never stored.** On hand minus on loan, and never below zero.

**3. The order of the status ladder matters.** An item with nothing on hand is out of stock even if it is also on loan and also damaged — the emptiness wins. Then being on loan wins over being damaged. The rule is written once and used to work out both what a single item's status is and what a filtered list contains, because two implementations of one rule will eventually disagree.

**4. A counted quantity is a real, lendable thing.** "Twenty chairs" and "one camera with a label" are the same kind of record and can both be lent, issued and written off.

**5. Nothing is ever counted by typing a number.** Quantities change only through a movement, and every movement is a log entry with a person and a reason.

**6. Every change to a count takes a lock first.** Two people doing two things at once cannot interleave and produce a wrong number. The before value is read from the locked record, never from what the browser sent.

**7. Two workflows lock in a fixed order.** The write-off workflow locks the request before the item. The loan workflow locks the loan before the item. Neither ever takes them the other way round, so the two cannot deadlock against each other.

**8. Four races are caught by the database, not by checking first.** Two people issuing the same tagged device, lending the same device, pinning the same device to two write-offs, and two people creating an item with the same stock code. In each case the database refuses and the system translates that into a sentence a person can act on — "reload the item and issue the units that are still available".

**9. Quantities and tags can never go negative or impossible.** Not enough on hand, a borrower that does not exist, a tag that does not belong to the item you said it did — each refused in words.

**10. A reason is required for every change of hands.** The only exceptions are claiming an item for yourself, handing one back to the store, and a request approved by the holder, where the reason is obvious and supplied by the system.

**11. A change of manager and a change of custodian are different events** and are recorded as such, and the records themselves refuse to blur the two.

**12. A loan is an open obligation.** You cannot change an item's owner, call it in, or store it while it is out on loan. A loan can only be closed through the return route, which is what records the condition it came back in.

**13. A person with no staff record can read but not be recorded.** Refusals for a missing staff profile are phrased as a missing profile, never as a permission failure.

**14. Nothing is deleted.** Items are retired and restorable. Tags are marked removed and restorable. Loans, issues, write-offs, custody history and both logs are permanent.

**15. Money is text all the way through,** and is validated as a plain decimal at every point it enters.

**16. The reorder level is a warning, not a floor.** It can be set above the count at creation, it cannot be _set_ above the current count on an edit, and nothing stops stock falling below it.

**17. Names are preserved forever.** Every log row carries the name as written at the time.

**18. A retired item's own screen says what is true.** No status badge, no available count, one action, and a plain sentence about where the history lives.

**19. Stock counts are capped, and the screen admits it.** The register loads up to two hundred rows; sorting and one of the filters work over what is loaded, and both say so.

**20. Two small deliberate absences.** There is no "reserved" quantity — the source system this was ported from had one, and it was not carried over. And there is no "cancelled" write-off movement, because withdrawing a request moved nothing and recording it as a movement would be a lie; it is recorded as an edit, with the withdrawal in the detail.

---

## 19. Deleting a staff member

A staff member who has any history cannot be deleted, and the refusal explains why and what to do instead.

The system checks for four kinds of trace: items they manage or hold, custody history they appear in, loans they are the borrower on, and write-off history they signed.

The refusal suggests the right action: transfer the equipment and the management to someone else, or set their employment status to terminated instead.

**Two things are deliberately not checked:** the movements log and the change log. Both store the person's name as well as a reference, so their history survives a deletion. This is the whole reason the name is denormalised onto those rows.

One rough edge: custody requests are not checked either. Those references are protected against deletion at the database level, so the deletion is refused — but with a raw error rather than the friendly explanation above.

---

## 20. Printing labels

An administrator can select items and print a sheet of labels, each carrying a scannable code that opens that item's page.

There is **no preview of the sheet**. The dialog shows one row per item with a count of how many copies to print, a running total, and a download. The sheet itself is built when you download it.

Copy counts default sensibly, and a one-click action fills the count to everything on hand. Each count can be set individually.

Nothing happens until you download, and the download is a PDF of labels, three to a row.

---

## 21. Photographs

An item can carry one photograph, which makes the register much easier to recognise at a glance.

**Only an administrator can upload one**, matching the same rule as everything else that changes an item.

Uploads are limited to **8 megabytes** — the note in the code says "a phone photo, not a scan" — and to four image formats. Both limits are checked and both say what they are.

Files are stored **on the server's own disk**, in the folder the rest of the site's uploads use, so the picture is served at a matching address with no second route to read it back. This is not a database blob and not cloud storage; it is the plainest thing that is actually true of a single-server school deployment.

The reasoning for that choice is recorded: the file record's address field is documented as "local filesystem in development, object storage in production" — an intention that had not been built either half of. The upload builds the development half for real. **For a multi-server production deployment, exactly one line would change** — swap the file-write call for an upload call and store the returned address in the same place — because everything that reads an image only cares that it is a fetchable address, never how it got there.

The field shows a small preview, a remove button, and it uploads as soon as you choose a file.

---

## 22. What is deliberately not built

These are decisions, not gaps.

- **Reservations.** There is no held-back quantity and no "reserved" tag status. A school of this size did not need it, and the source system it was ported from had one that was not carried over.
- **Hard deletion.** Items are retired and restorable. This is why the retired filter exists and why it is administrator-only.
- **A storekeeper role.** One administrator maintains the register. There is no third tier of custody between "school" and "person".
- **Teacher authority over anybody else's equipment.** A teacher acts on what they hold, what they manage, and the small catalogue of unheld lendable items. Nothing more.
- **A student-facing screen.** Students are borrowers, never actors. A student has no login, so there is nothing for them to log into and no way for them to appear in the custody trail as a responsible party.
- **Typing a new quantity.** Quantities move only through movements.
- **A stock code that can be changed.** Once an item exists, its code is fixed. A retired item that comes back keeps its code, and the system carries an unused safeguard for the day a code could conceivably be taken by a different item.
- **An Excel export of the register, and a conflict report to print.** The only export is the label sheet. Every other report is on screen.
- **Phone layouts.** This is a desktop-first system for office staff. Dialogs go full-screen on a narrow window and tables scroll sideways; nothing reflows into cards.
- **Product keyboard shortcuts.** Apart from Escape to close a dialog and Tab to move between fields, there are none. This was a deliberate decision, not an omission.

---

## 23. Known gaps

Recorded so the next person does not rediscover them as bugs.

**1. The count of a teacher's reachable actions is out of date.** The permission notes still say a teacher can reach nine inventory actions. The number is now higher, because the request-and-notice family and the scan page were added later. Nothing has leaked — every added action is either narrowed to the caller or returns fewer fields — but the written security summary no longer matches the system.

**2. A request cannot be withdrawn.** "Withdrawn" is a valid state throughout the system, and nothing produces it. See section 14.

**3. Seven shared helper functions live in the wrong file.** The stock dialogs file still holds formatting and name helpers that belong with the other shared pieces. There is a note in the file saying so, and a plan to move them.

**4. Two components exist twice.** The "what will this record" preview exists in two places, and the counters-and-category pair exists in two places. In both cases the duplication is deliberate and both copies carry a rule that they must never be allowed to drift apart. That rule depends on people remembering it.

**5. Five actions are refreshed by hand.** The teacher's lent-out list, the takeable catalogue, the request list, notices and the scan page are all updated individually after the actions that change them, because they sit outside the shared invalidation table. The reason is documented at each site.

**6. The "no manager" filter is the only page filter computed in the browser.** The server can already filter by manager, but cannot yet filter for "no manager at all". That is a one-line addition. Until it is made, the screen states the scope of its own filter.

**7. The retire-and-restore safety net is currently unreachable.** A retired item still holds its stock code, so the "somebody else took your code" case cannot yet happen. The safeguard is written and waiting for the day it can.

**8. This description was assembled from an automated reading of the system,** and one of those readings was itself cut off partway through its own list of known gaps. The gaps listed here are the ones recovered, plus this one. Nothing was left out on purpose, but a small number of drift notes from that source were never captured.

**9. The inventory feature's own design note is behind in one respect.** It describes the pane and sub-tab as living in the address bar. They are now separate pages, which was a change made after that note was written.

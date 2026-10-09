# Implementation Plan — ISBN/ISMN Barcode Script v47 → v50

Scope: the 18 items from the review (corrections, optimizations, enhancements), nothing else.
Target file: `ISBN-13 Barcode Generator for Adobe InDesign.js` (currently v46).
Each phase leaves a working, installable script. The user can stop after any phase.

---

## 0. Ground rules

### Engineering standards applied
- **Pure core, thin shell.** Everything that does not touch InDesign (validation, encoding, ISBN-10 conversion, hyphen handling, EAN-5, geometry) becomes a pure top-level function: input in, value out, no `app`, no side effects. InDesign calls live in a small render layer. This is what makes the code testable outside InDesign.
- **Automated tests for the pure core.** `tests/run.js`, Node + built-in `assert`, no dependencies. Each fixture comes from a published reference, not from our own code's output.
- **Single source of truth.** Spec constants (module counts, quiet zones, guard extension, nominal X) live in one `SPEC` object. Tunables the user may change live in one `CFG` object. No magic numbers in the render code.
- **Fail loudly, never silently.** Overset text, a locked layer, a missing font or a failed `unite()` produce a clear Greek message, or a logged warning where a fallback exists. No swallowed errors that change the output.
- **Leave the user's document as found.** Units, ruler origin and zero point are restored in `finally`. The whole draw is one Undo step. Cancel leaves nothing behind.
- **ES3 only** (ExtendScript): `var`, `for` loops, no `JSON` / `Array.prototype.map` / `trim`.
- **Single-file distribution.** No `#include`, so a single copy into the Scripts Panel keeps working.
- **Language.** UI strings stay in Greek. Code, comments and this plan are in English.

### Target file layout (top to bottom)
```
#target "InDesign"
SPEC            // GS1 constants (verified, see §5)
CFG defaults    // tunables
DOMAIN (pure)   // normalizeInput, isbn10To13, ean13Checksum, buildEAN13Pattern,
                // buildEAN5Pattern, validateCode, displayText
LAYOUT (pure)   // computeGeometry(spec, cfg, hasAddOn) -> plain numbers in mm
SETTINGS        // load/save last-used options (file in Folder.userData)
DIALOG          // ScriptUI; returns a validated request object or null
RENDER          // InDesign-only: draw bars, text, outline, measure, background, group
MAIN            // if (typeof app !== "undefined") { request = dialog(); app.doScript(render...) }
```

### How Node loads the file (test harness decision)
- `tests/run.js` reads the script, drops the `#target` line, and runs the rest in `vm.createContext({})`, so `app` is undefined there.
- `MAIN` runs only when `typeof app !== "undefined"`, so in Node it does nothing and the pure functions stay reachable on the context.
- Run with: `node tests/run.js`. One file, plain `assert`, prints `ok N` / the failing assertion.

### Per-phase checklist (repeat at the end of every phase)
1. Bump the header version (`COMPACT v4x`).
2. `node --check` on a copy without the `#target` line.
3. `node tests/run.js` passes.
4. Update CLAUDE.md wherever behaviour or layout changed.
5. Back up the installed copy (`*.v4x-backup` in the project folder), then copy to `%APPDATA%\Adobe\InDesign\Version 21.0\en_US\Scripts\Scripts Panel\`.
6. Run that phase's manual InDesign checks (listed under the phase). Nothing here has been run in InDesign yet.

---

## Phase 0 — Restructure + test harness (v47, no visible change)

Goal: make the core testable before changing behaviour.

- Move `isValidEAN13Checksum`, `buildEAN13Pattern`, `getHRISegments`, `calculateGeometry` out of the IIFE to top-level pure functions. Pass all inputs as arguments.
- Rename `getEAN13DomainData` → `SPEC` constant object.
- Add the `typeof app` guard around the entry point.
- Create `tests/run.js` with fixtures:
  - EAN-13 checksum: valid `9789605994839`, `9790060115615`; invalid (check digit off by one).
  - A full 95-module pattern for one known code, taken from a published worked example (Wikipedia "International Article Number" or the GS1 spec), not from our own output.
- **Manual check:** the output is pixel-identical to v46 (same code, same page), so the refactor changed nothing.

---

## Phase 1 — Scan-critical corrections (v48) — DONE (code + tests; not yet run in InDesign)

As built, differing from the text below: `computeGeometry(spec, cfg)` has no `hasAddOn` parameter yet (add-on constants unverified; added in Phase 5). Item 5 was solved by centring every text block on its measured outline bounds, so no InDesign confirmation was needed. Item 2 is defence in depth: the dialog already swaps codes that disagree with the type. Text is kept on one line with `noBreak`, so `overflows` means "too wide". A failure mid-draw removes everything already drawn.

Items: **1, 2, 3, 4, 5, 7, 14 (spec height as default)**. These are the items that decide whether the barcode scans and prints cleanly.

### 1. Quiet zones (add-on aware)
- `computeGeometry(spec, cfg, hasAddOn)`: left quiet = `SPEC.QUIET_LEFT_X × X`, right quiet = `SPEC.QUIET_RIGHT_X × X` without an add-on; with an add-on, the right side becomes `ADDON_GAP_X × X` + add-on width + `ADDON_QUIET_RIGHT_X × X`. Phase 5 only has to flip `hasAddOn`.
- The background covers both quiet zones. The leading HRI digit sits inside the left quiet zone.
- Values: 11X / 7X, to be checked against GS1 (§5) before coding.

### 2. Reject "ISBN" with a 9790 prefix
- `validateCode(type, digits)` returns `{ ok, message }`. ISBN requires 978, or 979 with a 4th digit ≠ 0. ISMN requires 9790.

### 3. Text robustness
- Each text frame gets: object style `[None]`, paragraph style `[No Paragraph Style]` with `clearOverrides()`, inset 0, auto-size off, explicit leading, first-baseline offset set explicitly, no hyphenation, no baseline-grid alignment. Exact `$ID/` names and enum values checked in the DOM reference (§5).
- Before `createOutlines()`: if `tf.overflows`, throw a Greek error naming the text. Never outline overset text.

### 4. Gaps and background from measured glyphs (font-independent)
- New draw order: bars → text frames → outline → **measure** the outlines' `geometricBounds` → move the ISBN line so its bottom sits `CFG.isbnGapMM` above the bars' top, and the HRI digits so their top sits `CFG.hriGapMM` below the bars' bottom → size the background to the union of everything plus the quiet zones and `CFG.paddingMM` → `sendToBack()`.
- Why: font metrics differ between Arial, Helvetica, Myriad and OCR-B. Measuring the real outlines removes the 0.25–0.3 mm guesswork.
- Removes the hardcoded 5 mm frame height and the `originYMM`-based background bottom.

### 5. Tracking on the last character (conditional)
- First confirm in InDesign: with tracking 200 and centred text, does the group shift right? (Compare the outline bounds' centre with the frame centre.)
- Only if confirmed: set tracking 0 on the last character of each HRI group and of the ISBN line. If not confirmed, drop the item and note it in CLAUDE.md.

### 7. Remove the per-character loop in `drawISBNText`
- Styling `texts[0]` already covers every character. Delete the loop.

### 14. Bar height default
- `CFG.barHeightPct` (100 = full spec height at the chosen size). The default stays at the current visual size (~66%) so nothing jumps unexpectedly. Phase 3 exposes it in the dialog.
- Guard-bar extension = `SPEC.GUARD_EXTENSION_X × X` (5X, verify) instead of 8% of bar height.

**Tests added:** quiet-zone widths and symbol width at 100% from `computeGeometry`; `validateCode` cases (978 ok, 979-1 ok, 9790 as ISBN rejected, 9791 as ISMN rejected).

**Manual checks:**
- Scan with a phone app at 100% and at the smallest size used.
- Test with Arial, then with Arial uninstalled or renamed so it falls back to Helvetica or Myriad.
- Test in a document whose `[Basic Paragraph]` has a 10 mm first-line indent and 30 pt leading. The barcode must look identical.

---

## Phase 2 — Small corrections (v48, same release as Phase 1 if convenient) — DONE (code; not yet run in InDesign)

Items: **6, 10, 17**. Independent, low risk.

- **6. Correct page.** If `app.activeWindow.constructor.name === "LayoutWindow"` and its document is `app.activeDocument`, use `app.activeWindow.activePage`; otherwise `doc.pages[0]`. Also check `doc.activeLayer`: if it is locked or hidden, show a Greek error before drawing.
- **10. Naming cleanup.** `hrittoValue` → `hriTrackingValue`; `isbnGapFactor` / `hriGapFactor` → `isbnGapMM` / `hriGapMM`; all factors that are really mm become `*MM`.
- **17. Group name.** `group.name = codeType + " " + code`, so it is findable in the Layers panel.

**Manual check:** two windows open on the same document, with the active one on page 3 → the barcode lands on page 3. Locked layer → clear error, nothing drawn, no undo step.

---

## Phase 3 — Dialog, undo and settings (v49) — DONE (code + tests; not yet run in InDesign)

As built: size is entered as bars width in mm with live % and X feedback (not a dropdown); bar height range 40–100%; gaps and padding are now in modules (X) so 80% and 200% keep proportions; the code itself is not remembered between runs, only the options.

Items: **8, 9, 13, 14 (exposed), 18**. All dialog work, done together.

- **8. Dialog before `doScript`.** `MAIN` = load settings → dialog → if cancelled, return (no undo step) → save settings → `app.doScript(function () { render(request); }, ..., UndoModes.ENTIRE_SCRIPT, "Barcode ISBN/ISMN")`. Validation and font resolution move out of the undoable part, so `render` receives an already-validated `request` object.
- **9. Inline validation.** The OK button's `onClick` runs `validateCode` and the field checks. On error it writes the Greek message into a red `statictext` in the dialog and keeps the dialog open. `dialog.close(1)` only on success.
- **13. Size and position fields.**
  - Size: magnification % (80–200, GS1 range, verify) **or** width in mm, as one dropdown of common values plus an editable field. Show the resulting X in mm as live feedback.
  - Bar height: % of spec height (exposes item 14).
  - Position: X/Y in mm from the page's top-left corner, **or** a checkbox "Μέσα στο επιλεγμένο πλαίσιο", enabled only when a single page item is selected, which centres the barcode in that item's bounds.
  - All numeric fields: parse with `parseFloat`, reject NaN and out-of-range values inline.
- **18. Remember settings.** Plain `key=value` lines in `Folder.userData + "/ISBN-Barcode/settings.txt"` (type, size, height, position mode, X, Y, last add-on). Use a file rather than `app.insertLabel`, because file persistence across restarts is certain and inspectable. Corrupt or missing file → defaults, never an error.

**Tests added:** settings serialize/parse round-trip (pure functions), including a corrupt line and an unknown key.

**Manual checks:** Cancel → Undo history unchanged. Invalid code → dialog stays open with a message. Restart InDesign → last settings restored. "Selected frame" mode centres correctly.

---

## Phase 4 — Code content (v49, same release as Phase 3 if convenient) — DONE (code + tests; not yet run in InDesign)

As built: on OK, an ISBN-10 is converted in the code field (hyphenation kept, `978-` prepended, new check digit) and the dialog stays open with a blue notice so the user confirms the ISBN-13 with a second OK. The ISBN line shrinks to fit within the quiet zones when hyphens make it wider. Fixtures: Wikipedia "ISBN" (0-306-40615-2; 0-345-24223-8 ↔ 978-0-345-24223-5).

Items: **12, 11, 15**. Order matters: conversion first, then the display string.

- **12. ISBN-10 → ISBN-13.** `normalizeInput(raw)`: if it has 10 characters after stripping (last may be `X`/`x`), validate the ISBN-10 mod-11 check, then build `978` + first 9 digits + a new EAN-13 check digit. Show a note in the dialog: "Μετατράπηκε σε ISBN-13: …".
- **11. Hyphenated display.** `displayText(type, raw, code)`: if the raw input contains only digits, hyphens and spaces, and its digits equal `code`, use it as typed (spaces → hyphens, repeated hyphens collapsed). Otherwise use the plain 13 digits. After an ISBN-10 conversion there are no user hyphens for the new code, so show the plain 13 digits. No hyphenation range tables (out of scope).
- **15. OCR-B for HRI digits.** ✅ Done early in v48 (user installed OCR-B: family `OCR-B`, style `Regular`/`Normal`). Digits sized by measured height so the font swap keeps the same visual size. Font resolution order for HRI: `OCR-B` variants (checked by exact installed names), then the existing Arial → Helvetica → Myriad chain. The ISBN line keeps the sans font. Log which font was used.

**Tests added:** ISBN-10 → 13 with a published pair (e.g. one from the ISBN Users' Manual), including an `X` check digit; an invalid ISBN-10 rejected; `displayText` cases (hyphens kept, mismatched digits → plain, letters → plain).

**Manual checks:** typing `960-599-483-X`-style input converts correctly; hyphenated input shows hyphens; OCR-B used when installed.

---

## Phase 5 — EAN-5 price add-on (v50) — DONE (code + tests; not yet run in InDesign)

As built: visible gap 9X (GAP_X 8 + the leading space of `01011`; GS1 range 7–12X), add-on right quiet zone 5X, add-on digits on top aligned with the main bars' top, add-on bars from below the digits down to the guard-bar bottom (layout per revk.uk analysis of the GS1 figure; normative GS1 add-on figure not read). Deviation: the add-on is **not** remembered between runs, so a previous book's price can't slip onto the next one. Fixture: Wikipedia "EAN-5" 52495.

Item: **16**.

- **Domain:** `ean5Checksum(d)` = (3×(d1+d3+d5) + 9×(d2+d4)) mod 10 → parity pattern from the 10-entry table → `buildEAN5Pattern(d)` = start `01011` + digit, separator `01`, digit … (L/G sets reused from EAN-13). Verify the table and patterns against a published reference (§5) before coding.
- **Dialog:** optional field "Πρόσθετο τιμής (5 ψηφία)". Empty = no add-on. 5 digits only; validated inline. Remembered in settings.
- **Geometry:** `computeGeometry(..., hasAddOn = true)`: gap, add-on bars aligned to the main bars' top and shorter at the bottom, add-on HRI digits **above** the add-on bars, right quiet zone after the add-on. Values from GS1 (§5).
- **Render:** add-on bars `unite()`d separately from the main symbol (two compound paths with a gap). Everything still ends up in one named group.

**Tests added:** EAN-5 checksum and full pattern for a published example (e.g. the price code `52495` from a reference that shows its bars); a 5-digit validation rejecting 4 or 6 digits.

**Manual checks:** scan the main code and the add-on separately with a phone app that supports EAN-5 (many do not; note which one worked).

---

## 5. Facts to verify before coding (do not hardcode from memory)

| Fact | Used in | Source to check |
|---|---|---|
| ✅ Nominal X = 0.33 mm (min 0.264, max 0.660 → 80–200%) | Ph 1, 3 | Verified: GS1 symbol specification table; GS1 UK size guide |
| ✅ Quiet zones: 11X left, 7X right (3.63 / 2.31 mm at 100%) | Ph 1 | Verified: GS1 UK "What is a quiet zone"; GS1 table |
| ✅ Guard-bar extension 5X | Ph 1 | Corroborated: full-size symbol guard overhang 0.065 in ≈ 1.65 mm = 5 × 0.33 mm (Seagull Scientific docs). Normative text not read. |
| ✅ Target bar height 22.85 mm at 100% (min 18.28 mm) | Ph 1, 3 | Verified: GS1 symbol specification table |
| ❔ HRI character height at 100% (still unverified; v48 keeps 8% of symbol width) | Ph 4 | GS1 General Specifications (HRI rules) |
| EAN-5: gap to main symbol, bar height, HRI above, right quiet zone | Ph 5 | GS1 General Specifications, add-on section |
| EAN-5 parity table, start/separator patterns | Ph 5 | GS1 spec or a published worked example |
| ISMN display form `979-0-…` | Ph 4 | International ISMN Agency user manual |
| ISBN display convention ("ISBN" + hyphenated 13 digits) | Ph 4 | ISBN Users' Manual (International ISBN Agency) |
| `$ID/[No paragraph style]`, `$ID/[None]` object style, `FirstBaseline` enum names, `TextFramePreference` properties | Ph 1 | InDesign scripting DOM reference for v21 |
| Centred text shifts right when the last character has tracking | Ph 1 (item 5) | Test in InDesign |
| `app.activeWindow` type when a story editor window is active | Ph 2 | InDesign DOM reference + quick test |

---

## 6. Out of scope (later, only if asked)

- Bar width reduction (BWR) to compensate for ink spread on press.
- Light-margin indicators (`<` / `>`) beside the quiet zones.
- Automatic hyphenation from ISBN range tables.
- Plain EAN-13 / UPC-A for non-book products.
- Swatch-name localisation for non-English InDesign (`Black` / `Paper`), currently en_US only.

---

## 7. Release summary

| Version | Phases | User-visible result |
|---|---|---|
| v47 | 0 | No change (restructure + tests) |
| v48 | 1 + 2 (+ item 15) | Correct quiet zones, robust text, measured background, right page, named group, OCR-B digits |
| v49 | 3 + 4 | Better dialog (inline errors, size/position, remembers settings), ISBN-10 input, hyphens |
| v50 | 5 | Optional EAN-5 price add-on |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

One Adobe InDesign ExtendScript file: `ISBN-13 Barcode Generator for Adobe InDesign.js`. It draws an EAN-13 barcode for an ISBN-13 (978/979) or ISMN-13 (9790) on the active page. No build, no package manager, no git repo. `PLAN.md` holds the phased roadmap (v47 → v50) with facts that must be verified before coding.

## Running

- In InDesign: copy the file to the user Scripts Panel folder (Window → Utilities → Scripts → right-click "User" → Reveal), then double-click it. Needs an open document.
- From VS Code: "ExtendScript Debugger" extension, target InDesign.
- Tests: `node tests/run.js` (Node + `assert`, no dependencies). It loads the script into a `vm` context with the `#target` line stripped; since `app` is undefined there, the InDesign entry point is skipped and the top-level pure functions are tested. Arrays returned from the vm context have a foreign prototype, so compare them via `join`, not `deepStrictEqual`. Fixtures must come from published references, not from the script's output.
- Syntax check: `node --check` on a copy with the `#target` line removed.
- Manual check in InDesign is still required for drawing changes. The dialog defaults are valid: `9789605994839` (ISBN) and `9790060115615` (ISMN), held in `DEFAULT_CODES` in `runInDesign`. The dialog auto-selects the type from the code prefix and swaps in the matching default when the selected type and the code disagree. Scan or visually inspect the bars.

## Language constraints (ExtendScript = ES3)

- No `let`/`const`, arrow functions, template literals, `Array.prototype.forEach/map/filter/indexOf`, `String.prototype.trim`, or `JSON` (unless polyfilled). Write `var` + `for` loops, as the existing code does.
- `#target "InDesign"` must stay at the top.
- Debug output uses `$.writeln` (goes to the ExtendScript console). User-facing messages use `alert`.
- UI strings and error messages are in Greek. Keep new user-facing text in Greek.

## Architecture

- File layout: `SPEC` (global constant: EAN-13 tables + GS1 `dimensions` incl. 80–200% magnification + `addOn` EAN-5 constants) → pure top-level functions (`isValidEAN13Checksum`, `validateCode`, `buildEAN13Pattern`, `getHRISegments`, `computeGeometry`, `unionBounds`, `ean13CheckDigit`, `isValidISBN10`, `convertISBN10` (ISBN-10 → {code, text keeping the user's hyphens, error}), `displayCode` (user's hyphenation if its digits equal the code, else plain), `ean5Checksum`, `buildEAN5Pattern`, `getAddOnHRISegments`, and the options/settings helpers `DEFAULT_OPTIONS`, `parseDecimal` (accepts Greek comma), `validateOptions`, `serializeSettings`, `parseSettings`; no InDesign calls, keep it that way so they stay testable) → `runInDesign()`, called only when `typeof app !== "undefined"`. InDesign-only helpers are nested inside `runInDesign`.
- `SPEC`: static EAN-13 tables. Module counts (`S`), L/G/R digit encodings and first-digit parity table (`E`), and the human-readable-interpretation (HRI) layout (`H`). `H` places digit groups by module index relative to the first bar. The first digit sits at modules -8..-1, inside the left quiet zone.
- `runInDesign` flow, all *before* the undo step: open document? → active layer locked/hidden? → resolve fonts → `getSelectedPageItem` → `showBarcodeDialog(loadSettings(), hasSelection)` (on OK: an ISBN-10 is converted in place and the dialog stays open with a blue notice for a second OK; then validates inline with `validateCode` + `validateOptions`, red message and stays open on error; Cancel returns null, so no empty undo step) → `saveSettings`. Then `app.doScript(..., UndoModes.ENTIRE_SCRIPT, "Barcode ISBN/ISMN")` runs `drawInMillimetres` (switches units/ruler/zero point, restores in `finally`) → `drawBarcode`. Page: the selected item's `parentPage` in "selection" mode, else `getTargetPage` (active `LayoutWindow`'s page). The final group is named `"<ISBN|ISMN> <13 digits>"`. Draw order: bars (`unite`) → each text block via `createOutlinedText` (neutral, fully specified style, `noBreak`, overset check, outlined) → measured and moved: ISBN line (`codeType + " " + C.display`, shrunk to fit the quiet zones if hyphens make it too wide) centred `isbnGapX` modules above the bars, digit groups centred on their module ranges `hriGapX` below → optional EAN-5 add-on (`drawAddOn`: digits on top at the main bars' top, add-on bars from below them to the guard-bar bottom, united separately; `computeGeometry` widens the right margin to gap + 48-module add-on + 5X) → background = union + `paddingX` vertically, never narrower than the 11X/7X quiet zones, plus `sidePaddingX` (6X) extra white on each side beyond both the quiet zones and any text → group → moved so its top-left is `(xMM, yMM)`, or centred on the selected item. Centring by measured outlines makes tracking and font metrics irrelevant. Any failure removes what was drawn (`drawBarcode`).
- User options (`DEFAULT_OPTIONS`, edited in the dialog, remembered in `Folder.userData/ISBN-Barcode/settings.txt` (Windows: `%APPDATA%\ISBN-Barcode\settings.txt`) as `key=value` lines; delete to reset): `codeType`, `widthMM` (bars width; sets X; 25.08–62.70 mm), `barHeightPct` (% of the GS1 22.85 mm target, scaled; 40–100, default 66), `positionMode` (`page`|`selection`), `xMM`, `yMM`. The EAN-5 add-on is validated by `validateOptions` but deliberately not in `DEFAULT_OPTIONS`, so it is never remembered. Fixed look lives in `STYLE` inside `runInDesign`: text sizes as a share of bars width, gaps/padding in modules (X) so everything scales with size. The draw config `C` = `{symbol, layout, typography: STYLE, font, hriFont}`.
- `drawBars` always returns an array: one united compound path, or the separate bars if `unite()` fails. Guard bars extend `GUARD_EXTENSION_X` (5X).

## Gotchas

- All coordinates are passed to `geometricBounds` (`[top, left, bottom, right]`) as raw numbers in millimetres. `drawInMillimetres` switches units to mm, ruler origin to `PAGE_ORIGIN` and `doc.zeroPoint` to `[0, 0]` and restores them in a `finally`. New drawing code must run inside it, and any page-item bounds (e.g. the selected anchor item) must be read inside it too. `xMM/yMM` are measured from the target page's top-left corner.
- `buildBarcode` fills the caller's `items` array in place so `drawBarcode` can remove partial output on failure.
- Built-in "no style" entries come from `builtInStyle(collection, "$ID/...")`: the `$ID/` name if valid, else index 0 (always the built-in entry). Text frames are also forced to one column, no wrap, no inset.
- Font lookup (`getCompatibleFont`) returns a Font object, trying `"Arial\tRegular"` (tab-separated family/style), `"Arial"`, then Helvetica and Myriad Pro (Regular first). Applying the object, not a family name, stops a Bold/Italic document default leaking in. The HRI digits use `findFont(STYLE.hriFontNames)` (OCR-B variants) and fall back to the main font. They are sized by measured height (`hriDigitHeightFactor`): `drawHRIDigits` outlines once, measures, and redraws at the corrected size, because OCR-B digits are ~0.96 em tall vs Arial's ~0.72 em. The ISBN line above stays point-size based (`isbnSizeFactor`) in the main font.
- Header comment holds the version (`COMPACT v51`). Bump it when behaviour changes.
- User guide: `docs/guide.html` (Greek, A4, 5 pages, barcode SVG inlined) → `docs/ISBN-ISMN Barcode Generator - Οδηγός.pdf`. Rebuild with headless Chrome (`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe --headless=new --no-pdf-header-footer --print-to-pdf=<out.pdf> file:///<path>/guide.html`). Update its spec table, error table and "Σε εξέλιξη" note whenever behaviour changes.

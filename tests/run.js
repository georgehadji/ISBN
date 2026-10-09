// Tests for the pure (non-InDesign) functions of the barcode script.
// Run: node tests/run.js
// Fixtures come from Wikipedia "International Article Number" (EAN-13 tables and worked examples),
// typed in here independently of the script's own SPEC tables.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const SCRIPT = path.join(__dirname, "..", "ISBN-13 Barcode Generator for Adobe InDesign.js");
const source = fs.readFileSync(SCRIPT, "utf8").replace(/^#target.*$/m, "");
const ctx = vm.createContext({}); // no `app` -> the InDesign entry point is skipped
vm.runInContext(source, ctx, { filename: SCRIPT });

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log("ok " + passed + " - " + name);
}

test("checksum accepts valid EAN-13 codes", () => {
    for (const c of ["4003994155486", "4006381333931", "9789605994839", "9790060115615"]) {
        assert.strictEqual(ctx.isValidEAN13Checksum(c), true, c);
    }
});

test("checksum rejects a wrong check digit", () => {
    assert.strictEqual(ctx.isValidEAN13Checksum("4003994155487"), false);
    assert.strictEqual(ctx.isValidEAN13Checksum("9789605994838"), false);
});

test("EAN-13 pattern for 4 003994 155486 matches the published encoding", () => {
    // Leading 4 -> parity LGLLGG (Wikipedia's OEOOEE); right half all R-codes.
    const expected =
        "101" +
        "0001101" + "0100111" + "0111101" + "0001011" + "0010111" + "0011101" + // 0L 0G 3L 9L 9G 4G
        "01010" +
        "1100110" + "1001110" + "1001110" + "1011100" + "1001000" + "1010000" + // 1 5 5 4 8 6 (R)
        "101";
    const p = ctx.buildEAN13Pattern("4003994155486", ctx.SPEC.encoding);
    assert.strictEqual(p.length, 95);
    assert.strictEqual(p, expected);
});

test("SPEC encoding tables match the published L/G/R and parity tables", () => {
    const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
    const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
    const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
    const PAR = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
    const E = ctx.SPEC.encoding;
    for (let d = 0; d < 10; d++) {
        assert.strictEqual(E.L[d], L[d], "L" + d);
        assert.strictEqual(E.G[d], G[d], "G" + d);
        assert.strictEqual(E.R[d], R[d], "R" + d);
        assert.strictEqual(E.PARITY[d], PAR[d], "parity " + d);
    }
});

test("HRI segments split the code 1 + 6 + 6", () => {
    const s = ctx.getHRISegments("9789605994839", ctx.SPEC.hriLayout);
    // join: arrays from the vm context have a different Array prototype than this realm
    assert.strictEqual(s.map(x => x.text).join("|"), "9|789605|994839");
});

// GS1 General Specifications: at 100% (X = 0.330 mm) the left quiet zone is 3.63 mm (11X),
// the right 2.31 mm (7X), the target bar height 22.85 mm; guard bars extend 5X (1.65 mm).
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 0.005, label + ": " + actual + " != " + expected);
const cfg = (widthMM, barHeightPct) => ({
    symbol: { widthMM, barHeightPct },
    layout: { originXMM: 100, originYMM: 150 }
});

test("geometry at 100% matches GS1 nominal dimensions", () => {
    const g = ctx.computeGeometry(ctx.SPEC, cfg(31.35, 100));
    near(g.moduleW, 0.33, "X");
    near(g.magnificationPct, 100, "magnification");
    near(g.quietLeftMM, 3.63, "left quiet zone");
    near(g.quietRightMM, 2.31, "right quiet zone");
    near(g.barHeightMM, 22.85, "bar height");
    near(g.guardExtMM, 1.65, "guard extension");
    near(g.barsLeft, 103.63, "bars start after the left quiet zone");
    near(g.barsRight - g.barsLeft, 31.35, "bars width");
});

test("geometry scales with width and barHeightPct", () => {
    const g = ctx.computeGeometry(ctx.SPEC, cfg(30, 66));
    near(g.moduleW, 30 / 95, "X");
    near(g.quietLeftMM, 11 * 30 / 95, "left quiet zone");
    near(g.barHeightMM, 22.85 * (30 / 31.35) * 0.66, "bar height");
});

test("validateCode accepts valid ISBN and ISMN codes", () => {
    assert.strictEqual(ctx.validateCode("ISBN", "9789605994839"), "");
    assert.strictEqual(ctx.validateCode("ISBN", "9791032305690"), "");   // 979-10 prefix (check digit computed by hand)
    assert.strictEqual(ctx.validateCode("ISMN", "9790060115615"), "");
});

test("validateCode rejects wrong prefixes, lengths and check digits", () => {
    assert.notStrictEqual(ctx.validateCode("ISBN", "9790060115615"), "", "9790 as ISBN");
    assert.notStrictEqual(ctx.validateCode("ISMN", "9789605994839"), "", "978 as ISMN");
    assert.notStrictEqual(ctx.validateCode("ISBN", "4003994155486"), "", "non-book EAN as ISBN");
    assert.notStrictEqual(ctx.validateCode("ISBN", "978960599483"), "", "12 digits");
    assert.notStrictEqual(ctx.validateCode("ISBN", "9789605994838"), "", "bad check digit");
});

test("unionBounds returns the enclosing [top, left, bottom, right]", () => {
    const u = ctx.unionBounds([[10, 20, 30, 40], [5, 25, 35, 38], [12, 15, 20, 50]]);
    assert.strictEqual(u.join(","), "5,15,35,50");
});

const opts = (over) => Object.assign(ctx.copyOptions(ctx.DEFAULT_OPTIONS), over);

test("parseDecimal accepts dot and Greek comma, rejects junk", () => {
    assert.strictEqual(ctx.parseDecimal("30"), 30);
    assert.strictEqual(ctx.parseDecimal(" 30,5 "), 30.5);
    assert.strictEqual(ctx.parseDecimal("31.35"), 31.35);
    assert.strictEqual(ctx.parseDecimal("-2"), -2);
    for (const bad of ["", "abc", "30mm", "1,2,3", "30."]) assert.ok(Number.isNaN(ctx.parseDecimal(bad)), bad);
});

test("validateOptions enforces the GS1 80-200% width range", () => {
    assert.strictEqual(ctx.validateOptions(opts({}), ctx.SPEC), "", "defaults");
    assert.strictEqual(ctx.validateOptions(opts({ widthMM: 25.08 }), ctx.SPEC), "", "80%");
    assert.strictEqual(ctx.validateOptions(opts({ widthMM: 62.7 }), ctx.SPEC), "", "200%");
    assert.notStrictEqual(ctx.validateOptions(opts({ widthMM: 25 }), ctx.SPEC), "", "below 80%");
    assert.notStrictEqual(ctx.validateOptions(opts({ widthMM: 63 }), ctx.SPEC), "", "above 200%");
    assert.notStrictEqual(ctx.validateOptions(opts({ widthMM: NaN }), ctx.SPEC), "", "NaN width");
});

test("validateOptions checks bar height and page coordinates", () => {
    assert.notStrictEqual(ctx.validateOptions(opts({ barHeightPct: 39 }), ctx.SPEC), "");
    assert.notStrictEqual(ctx.validateOptions(opts({ barHeightPct: 101 }), ctx.SPEC), "");
    assert.notStrictEqual(ctx.validateOptions(opts({ xMM: NaN }), ctx.SPEC), "", "page mode needs X");
    assert.strictEqual(ctx.validateOptions(opts({ positionMode: "selection", xMM: NaN }), ctx.SPEC), "", "selection ignores X");
});

test("settings round-trip through serialize/parse", () => {
    const o = opts({ codeType: "ISMN", widthMM: 31.35, barHeightPct: 100, positionMode: "selection", xMM: 12.5, yMM: 240 });
    const back = ctx.parseSettings(ctx.serializeSettings(o), ctx.DEFAULT_OPTIONS);
    assert.strictEqual(JSON.stringify(back), JSON.stringify(o));
});

test("parseSettings ignores corrupt lines, unknown keys and bad values", () => {
    const text = "garbage\r\nwidthMM=abc\nbarHeightPct=80\nunknown=1\ncodeType=EAN\npositionMode=moon\n=5";
    const o = ctx.parseSettings(text, ctx.DEFAULT_OPTIONS);
    assert.strictEqual(o.widthMM, 30, "bad number -> default");
    assert.strictEqual(o.barHeightPct, 80, "good number kept");
    assert.strictEqual(o.codeType, "ISBN", "bad enum -> default");
    assert.strictEqual(o.positionMode, "page", "bad enum -> default");
    assert.strictEqual(o.unknown, undefined, "unknown key dropped");
    assert.strictEqual(ctx.parseSettings(undefined, ctx.DEFAULT_OPTIONS).xMM, 100, "missing file text -> defaults");
});

// Wikipedia "ISBN": 0-306-40615-2 is a valid ISBN-10; the same book appears as
// ISBN 0-345-24223-8 and ISBN 978-0-345-24223-5.
test("ISBN-10 check digit validation", () => {
    assert.strictEqual(ctx.isValidISBN10("0306406152"), true);
    assert.strictEqual(ctx.isValidISBN10("0345242238"), true);
    assert.strictEqual(ctx.isValidISBN10("080442957X"), true, "X check digit (sum 199 + 10 = 209 = 19*11, computed)");
    assert.strictEqual(ctx.isValidISBN10("0306406153"), false);
    assert.strictEqual(ctx.isValidISBN10("X306406152"), false, "X only allowed last");
});

test("ISBN-10 converts to the published ISBN-13, keeping hyphenation", () => {
    const h = ctx.convertISBN10("0-345-24223-8");
    assert.strictEqual(h.error, "");
    assert.strictEqual(h.code, "9780345242235");
    assert.strictEqual(h.text, "978-0-345-24223-5");
    const p = ctx.convertISBN10(" 0345242238 ");
    assert.strictEqual(p.text, "9780345242235", "no hyphens in -> plain digits out");
    assert.strictEqual(ctx.convertISBN10("080442957x").code.length, 13, "lowercase x accepted");
});

test("convertISBN10 rejects bad ISBN-10 and ignores non-ISBN-10 input", () => {
    assert.notStrictEqual(ctx.convertISBN10("0-345-24223-9").error, "", "bad check digit");
    assert.strictEqual(ctx.convertISBN10("9789605994839"), null, "13 digits");
    assert.strictEqual(ctx.convertISBN10("978-960-599-483-9"), null, "hyphenated 13 digits");
});

test("displayCode keeps the user's hyphens only for an exact match", () => {
    assert.strictEqual(ctx.displayCode("978-0-345-24223-5", "9780345242235"), "978-0-345-24223-5");
    assert.strictEqual(ctx.displayCode("979 0 060 11561 5", "9790060115615"), "979-0-060-11561-5", "spaces -> hyphens");
    assert.strictEqual(ctx.displayCode("978--0-345-24223-5-", "9780345242235"), "978-0-345-24223-5", "collapse + trim");
    assert.strictEqual(ctx.displayCode("9780345242235", "9780345242235"), "9780345242235", "no separators");
    assert.strictEqual(ctx.displayCode("ISBN 978-0-345-24223-5", "9780345242235"), "9780345242235", "letters -> plain");
    assert.strictEqual(ctx.displayCode("978-0-345-24223-6", "9780345242235"), "9780345242235", "digits differ -> plain");
});

// Wikipedia "EAN-5": 52495 -> checksum 141 mod 10 = 1 -> parity GLGLL, full pattern below.
test("EAN-5 checksum and pattern match the published 52495 example", () => {
    assert.strictEqual(ctx.ean5Checksum("52495"), 1);
    const expected = "01011" + "0111001" + "01" + "0010011" + "01" + "0011101" + "01" + "0001011" + "01" + "0110001";
    const p = ctx.buildEAN5Pattern("52495", ctx.SPEC.encoding, ctx.SPEC.addOn);
    assert.strictEqual(p, expected);
    assert.strictEqual(p.length, ctx.SPEC.addOn.PATTERN_MODULES);
});

test("EAN-5 parity table matches the published table", () => {
    const PAR = ["GGLLL","GLGLL","GLLGL","GLLLG","LGGLL","LLGGL","LLLGG","LGLGL","LGLLG","LLGLG"];
    assert.strictEqual(ctx.SPEC.addOn.PARITY.join(","), PAR.join(","));
});

test("add-on geometry: 9X visible gap, 5X right quiet zone", () => {
    const g = ctx.computeGeometry(ctx.SPEC, Object.assign(cfg(31.35, 100), { addOn: "90000" }));
    near(g.addOnLeft - g.barsRight, 8 * 0.33, "pattern start after GAP_X");
    // first bar of the add-on is 1 module into the pattern ("0" of 01011): 9X from the main end guard
    near(g.addOnLeft + 0.33 - g.barsRight, 9 * 0.33, "visible gap");
    assert.ok(9 >= 7 && 9 <= 12, "GS1 7-12X");
    near(g.quietRightMM, (8 + 48 + 5) * 0.33, "right margin = gap + add-on + 5X");
    near(g.addOnRight + 5 * 0.33, g.barsRight + g.quietRightMM, "add-on quiet zone ends at the margin");
    assert.strictEqual(ctx.computeGeometry(ctx.SPEC, cfg(30, 66)).hasAddOn, false);
    near(g.mainWidthMM, 113 * 0.33, "ISBN-line limit = main symbol + its own quiet zones, not the add-on");
});

test("add-on HRI segments sit over each 7-module digit", () => {
    const s = ctx.getAddOnHRISegments("52495", ctx.SPEC);
    assert.strictEqual(s.map(x => x.text).join(""), "52495");
    assert.strictEqual(s[0].startModule, 95 + 8 + 5);
    assert.strictEqual(s[1].startModule - s[0].startModule, 9, "7 modules + 01 separator");
    assert.strictEqual(s[4].endModule, 95 + 8 + 48);
});

test("validateOptions accepts an empty or 5-digit add-on only", () => {
    assert.strictEqual(ctx.validateOptions(opts({ addOn: "" }), ctx.SPEC), "");
    assert.strictEqual(ctx.validateOptions(opts({ addOn: "90000" }), ctx.SPEC), "");
    for (const bad of ["9000", "900000", "9000a"]) assert.notStrictEqual(ctx.validateOptions(opts({ addOn: bad }), ctx.SPEC), "", bad);
});

console.log("\nall " + passed + " tests passed");

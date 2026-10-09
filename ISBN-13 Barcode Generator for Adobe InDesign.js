/* =====================================================
   ISBN-13 / EAN-13 BARCODE — COMPACT v51
   ===================================================== */

#target "InDesign"

/* ---------- SPEC: EAN-13 symbology constants ---------- */

var SPEC = {
    structure: {TOTAL_MODULES:95,GUARD_START_LEN:3,GUARD_CENTER_LEN:5,DATA_LEFT_LEN:42,DATA_RIGHT_LEN:42},
    // GS1 General Specifications, EAN-13 symbol dimensions (X = module width)
    dimensions: {
        NOMINAL_X_MM: 0.33,          // 100% magnification
        NOMINAL_BAR_HEIGHT_MM: 22.85, // target bar height at 100%
        QUIET_LEFT_X: 11,
        QUIET_RIGHT_X: 7,
        GUARD_EXTENSION_X: 5,         // guard bars extend this far below the normal bars
        MIN_MAGNIFICATION_PCT: 80,    // X from 0.264 mm
        MAX_MAGNIFICATION_PCT: 200    // X up to 0.660 mm
    },
    encoding: {
        L: {"0":"0001101","1":"0011001","2":"0010011","3":"0111101","4":"0100011","5":"0110001","6":"0101111","7":"0111011","8":"0110111","9":"0001011"},
        G: {"0":"0100111","1":"0110011","2":"0011011","3":"0100001","4":"0011101","5":"0111001","6":"0000101","7":"0010001","8":"0001001","9":"0010111"},
        R: {"0":"1110010","1":"1100110","2":"1101100","3":"1000010","4":"1011100","5":"1001110","6":"1010000","7":"1000100","8":"1001000","9":"1110100"},
        PARITY: ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
    },
    // EAN-5 price add-on (Wikipedia "EAN-5"; GS1: separation 7-12X, add-on right quiet zone 5X).
    // PATTERN_MODULES counts the leading space of START, so the visible gap is GAP_X + 1 modules (9X).
    addOn: {
        START: "01011",
        SEPARATOR: "01",
        PARITY: ["GGLLL","GLGLL","GLLGL","GLLLG","LGGLL","LLGGL","LLLGG","LGLGL","LGLLG","LLGLG"],
        PATTERN_MODULES: 48,
        GAP_X: 8,
        QUIET_RIGHT_X: 5
    },
    // HRI digit groups, positioned by module index relative to the first bar
    hriLayout: [
        { startModule: -8, endModule: -1, codeIndex: 0, codeLength: 1 },
        { startModule: 3, endModule: 45, codeIndex: 1, codeLength: 6 },
        { startModule: 50, endModule: 92, codeIndex: 7, codeLength: 6 }
    ]
};

/* ---------- DOMAIN + LAYOUT: pure functions (no InDesign calls; tested by tests/run.js) ---------- */

// Check digit for the first 12 digits of an EAN-13 (weights 1,3,1,3...).
function ean13CheckDigit(d12){
    var sum = 0;
    for (var i = 0; i < 12; i++){
        sum += (i % 2 === 1 ? 3 : 1) * (+d12.charAt(i));
    }
    return (10 - (sum % 10)) % 10;
}

function isValidEAN13Checksum(c){
    return ean13CheckDigit(c) === +c.charAt(12);
}

// ISBN-10: weights 10..1, sum divisible by 11; "X" stands for 10 (last position only).
function isValidISBN10(s){
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 10; i++){
        var ch = s.charAt(i);
        sum += (10 - i) * (ch === "X" ? 10 : +ch);
    }
    return sum % 11 === 0;
}

// Input that looks like an ISBN-10 -> { code, text, error }; anything else -> null.
// `text` keeps the user's hyphenation: "0-345-24223-8" -> "978-0-345-24223-5".
function convertISBN10(raw){
    var t = String(raw).replace(/^\s+|\s+$/g, "");
    var compact = t.replace(/[\s-]/g, "").toUpperCase();
    if (!/^\d{9}[\dX]$/.test(compact)) return null;
    if (!isValidISBN10(compact)) {
        return { code: "", text: "", error: "ΣΦΑΛΜΑ: Μη έγκυρο ISBN-10. Ελέγξτε το ψηφίο ελέγχου." };
    }
    var d12 = "978" + compact.substr(0, 9);
    var code = d12 + ean13CheckDigit(d12);
    var text = /[\s-]/.test(t) ? "978-" + t.replace(/[\s-]+/g, "-").replace(/.$/, "") + code.charAt(12) : code;
    return { code: code, text: text, error: "" };
}

// The human-readable code above the bars: the user's own hyphenation when it is just
// digits + separators for exactly this code, otherwise the plain 13 digits.
function displayCode(raw, code){
    var t = String(raw).replace(/^\s+|\s+$/g, "");
    if (!/[\s-]/.test(t) || !/^[\d\s-]+$/.test(t) || t.replace(/\D/g, "") !== code) return code;
    return t.replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "");
}

// Returns "" when the code is acceptable for the type, otherwise a Greek error message.
function validateCode(codeType, code){
    if (!/^\d{13}$/.test(code) || !isValidEAN13Checksum(code)) {
        return "ΣΦΑΛΜΑ: Μη έγκυρος κωδικός. Ελέγξτε μήκος και ψηφίο ελέγχου.";
    }
    var isIsmnPrefix = code.substr(0, 4) === "9790";
    if (codeType === "ISBN") {
        if (isIsmnPrefix) return "ΣΦΑΛΜΑ: Ο κωδικός ξεκινά με 9790, άρα είναι ISMN. Επιλέξτε ISMN-13.";
        var prefix = code.substr(0, 3);
        if (prefix !== "978" && prefix !== "979") return "ΣΦΑΛΜΑ: Το ISBN-13 πρέπει να ξεκινά με 978 ή 979.";
    }
    if (codeType === "ISMN" && !isIsmnPrefix) return "ΣΦΑΛΜΑ: Το ISMN-13 πρέπει να ξεκινά με 9790.";
    return "";
}

function buildEAN13Pattern(c, E){
    var p = "101";
    var par = E.PARITY[+c.charAt(0)];

    for (var i = 1; i <= 6; i++){
        p += (par.charAt(i-1) === "L" ? E.L : E.G)[c.charAt(i)];
    }

    p += "01010";

    for (var j = 7; j <= 12; j++){
        p += E.R[c.charAt(j)];
    }
    return p + "101";
}

function getHRISegments(c, H) {
    var segments = [];
    for (var i = 0; i < H.length; i++) {
        var block = H[i];
        segments.push({
            text: c.substr(block.codeIndex, block.codeLength),
            startModule: block.startModule,
            endModule: block.endModule
        });
    }
    return segments;
}

// Bar geometry in mm. Text and background are placed later from measured outlines,
// and the finished group is moved so its top-left lands on (originXMM, originYMM).
function computeGeometry(spec, C){
    var D = spec.dimensions;
    var A = spec.addOn;
    var hasAddOn = !!C.addOn;
    var X = C.symbol.widthMM / spec.structure.TOTAL_MODULES;
    var scale = X / D.NOMINAL_X_MM;
    var barHeightMM = D.NOMINAL_BAR_HEIGHT_MM * scale * C.symbol.barHeightPct / 100;
    var quietLeftMM = D.QUIET_LEFT_X * X;
    // With an add-on, everything right of the main bars (gap + add-on + its quiet zone) is "right margin".
    var quietRightMM = hasAddOn ? (A.GAP_X + A.PATTERN_MODULES + A.QUIET_RIGHT_X) * X : D.QUIET_RIGHT_X * X;
    var barsLeft = C.layout.originXMM + quietLeftMM;
    var addOnLeft = barsLeft + C.symbol.widthMM + A.GAP_X * X;
    var barsTop = C.layout.originYMM;

    return {
        moduleW: X,
        magnificationPct: scale * 100,
        symbolWidthMM: C.symbol.widthMM,
        barHeightMM: barHeightMM,
        guardExtMM: D.GUARD_EXTENSION_X * X,
        quietLeftMM: quietLeftMM,
        quietRightMM: quietRightMM,
        barsLeft: barsLeft,
        barsRight: barsLeft + C.symbol.widthMM,
        barsTop: barsTop,
        barsBottom: barsTop + barHeightMM,
        // Main symbol with its own GS1 quiet zones, excluding any add-on (limits the ISBN line).
        mainWidthMM: (D.QUIET_LEFT_X + spec.structure.TOTAL_MODULES + D.QUIET_RIGHT_X) * X,
        hasAddOn: hasAddOn,
        addOnLeft: hasAddOn ? addOnLeft : null,
        addOnRight: hasAddOn ? addOnLeft + A.PATTERN_MODULES * X : null
    };
}

// Union of [top, left, bottom, right] bounds.
function unionBounds(list){
    var u = [list[0][0], list[0][1], list[0][2], list[0][3]];
    for (var i = 1; i < list.length; i++) {
        var b = list[i];
        if (b[0] < u[0]) u[0] = b[0];
        if (b[1] < u[1]) u[1] = b[1];
        if (b[2] > u[2]) u[2] = b[2];
        if (b[3] > u[3]) u[3] = b[3];
    }
    return u;
}

// EAN-5 checksum: digits weighted 3,9,3,9,3, mod 10. Selects the parity pattern.
function ean5Checksum(d){
    var sum = 0;
    for (var i = 0; i < 5; i++) sum += (i % 2 === 0 ? 3 : 9) * (+d.charAt(i));
    return sum % 10;
}

function buildEAN5Pattern(d, E, A){
    var parity = A.PARITY[ean5Checksum(d)];
    var p = A.START;
    for (var i = 0; i < 5; i++){
        if (i > 0) p += A.SEPARATOR;
        p += (parity.charAt(i) === "L" ? E.L : E.G)[d.charAt(i)];
    }
    return p;
}

// One HRI segment per add-on digit, centred on its 7 modules; module indexes relative to the main bars' left edge.
function getAddOnHRISegments(d, spec){
    var A = spec.addOn;
    var first = spec.structure.TOTAL_MODULES + A.GAP_X + A.START.length;
    var step = 7 + A.SEPARATOR.length;
    var segments = [];
    for (var i = 0; i < d.length; i++) {
        var start = first + i * step;
        segments.push({ text: d.charAt(i), startModule: start, endModule: start + 7 });
    }
    return segments;
}

/* ---------- OPTIONS + SETTINGS: pure functions (tested by tests/run.js) ---------- */

var DEFAULT_OPTIONS = {
    codeType: "ISBN",
    widthMM: 30,          // width of the bars (95 modules)
    barHeightPct: 66,     // % of the GS1 target bar height at this size
    positionMode: "page", // "page": background top-left at (xMM, yMM); "selection": centred on the selected item
    xMM: 100,
    yMM: 150
};

var OPTION_LIMITS = { MIN_BAR_HEIGHT_PCT: 40, MAX_BAR_HEIGHT_PCT: 100 };

function nominalWidthMM(spec){
    return spec.structure.TOTAL_MODULES * spec.dimensions.NOMINAL_X_MM;
}

// Accepts "30", "30.5" and the Greek "30,5". Returns NaN for anything else.
function parseDecimal(text){
    var s = String(text).replace(/^\s+|\s+$/g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}

function formatDecimal(n, digits){
    return n.toFixed(digits).replace(".", ",");
}

function copyOptions(o){
    var c = {};
    for (var k in DEFAULT_OPTIONS) c[k] = o[k];
    return c;
}

// Returns "" when the options are usable, otherwise a Greek error message.
function validateOptions(o, spec){
    var nominal = nominalWidthMM(spec);
    var minW = nominal * spec.dimensions.MIN_MAGNIFICATION_PCT / 100;
    var maxW = nominal * spec.dimensions.MAX_MAGNIFICATION_PCT / 100;
    if (isNaN(o.widthMM) || o.widthMM < minW - 0.005 || o.widthMM > maxW + 0.005) {
        return "ΣΦΑΛΜΑ: Το πλάτος μπαρών πρέπει να είναι από " + formatDecimal(minW, 2) + " έως " + formatDecimal(maxW, 2) +
            " mm (" + spec.dimensions.MIN_MAGNIFICATION_PCT + "–" + spec.dimensions.MAX_MAGNIFICATION_PCT + "% κατά GS1).";
    }
    if (isNaN(o.barHeightPct) || o.barHeightPct < OPTION_LIMITS.MIN_BAR_HEIGHT_PCT || o.barHeightPct > OPTION_LIMITS.MAX_BAR_HEIGHT_PCT) {
        return "ΣΦΑΛΜΑ: Το ύψος μπαρών πρέπει να είναι από " + OPTION_LIMITS.MIN_BAR_HEIGHT_PCT + " έως " + OPTION_LIMITS.MAX_BAR_HEIGHT_PCT + "%.";
    }
    if (o.addOn && !/^\d{5}$/.test(o.addOn)) {
        return "ΣΦΑΛΜΑ: Το πρόσθετο τιμής πρέπει να έχει ακριβώς 5 ψηφία, ή να μείνει κενό.";
    }
    if (o.positionMode === "page" && (isNaN(o.xMM) || isNaN(o.yMM))) {
        return "ΣΦΑΛΜΑ: Οι συντεταγμένες X και Y πρέπει να είναι αριθμοί σε mm.";
    }
    return "";
}

function serializeSettings(o){
    var lines = [];
    for (var k in DEFAULT_OPTIONS) lines.push(k + "=" + o[k]);
    return lines.join("\n");
}

// Unknown keys, bad values and missing lines fall back to `defaults`; never throws.
function parseSettings(text, defaults){
    var o = copyOptions(defaults);
    var lines = String(text || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var eq = lines[i].indexOf("=");
        if (eq < 1) continue;
        var key = lines[i].substr(0, eq);
        var value = lines[i].substr(eq + 1);
        if (!defaults.hasOwnProperty(key)) continue;
        if (typeof defaults[key] === "number") {
            var n = parseDecimal(value);
            if (!isNaN(n)) o[key] = n;
        } else if (key === "codeType" && (value === "ISBN" || value === "ISMN")) {
            o[key] = value;
        } else if (key === "positionMode" && (value === "page" || value === "selection")) {
            o[key] = value;
        }
    }
    return o;
}

/* ---------- MAIN: InDesign only (skipped when loaded by the Node tests) ---------- */

if (typeof app !== "undefined") runInDesign();

function runInDesign() {

    var S = SPEC.structure;
    var E = SPEC.encoding;
    var H = SPEC.hriLayout;

    // Fixed look; size and position come from the dialog. Spacing is in modules (X) so it scales with size.
    var STYLE = {
        isbnSizeFactor: 0.08,          // ISBN line point size as a share of bars width
        hriDigitHeightFactor: 0.0575,  // digit height as a share of bars width (1.73 mm at 30 mm)
        isbnGapX: 2.5,                 // ISBN line bottom -> bars top
        hriGapX: 1.6,                  // bars bottom -> digits top
        paddingX: 3.2,                 // white space above the ISBN line and below the digits
        sidePaddingX: 6,               // extra white space left/right, beyond the quiet zones and any text (1.9 mm at 30 mm)
        isbnTrackingValue: 200,
        hriTrackingValue: 200,
        fontName: "Arial",
        // Digits under the bars: OCR-B (the barcode standard) if installed, else the main font.
        hriFontNames: ["OCR-B\tRegular", "OCR-B\tNormal", "OCR-B", "OCR B Std\tRegular", "OCR B\tRegular"],
        MM_TO_PT: 2.83464567
    };
    var SETTINGS_FILE = File(Folder.userData + "/ISBN-Barcode/settings.txt");
    var DEFAULT_CODES = ["9789605994839", "9790060115615"]; // ISBN, ISMN — indexed like the type dropdown

    try {
        if (!app.documents.length) { alert("ΣΦΑΛΜΑ: Δεν υπάρχει ανοιχτό έγγραφο."); return; }
        var doc = app.activeDocument;

        var layer = doc.activeLayer;
        if (layer.locked || !layer.visible) {
            alert("ΣΦΑΛΜΑ: Η ενεργή στρώση «" + layer.name + "» είναι κλειδωμένη ή κρυφή. Ξεκλειδώστε την και κάντε την ορατή, ή επιλέξτε άλλη στρώση.");
            return;
        }

        var font = getCompatibleFont(STYLE.fontName);
        if (!font) {
            alert("ΣΦΑΛΜΑ FONT: Η γραμματοσειρά '" + STYLE.fontName + "' ή μια συμβατή εναλλακτική δεν βρέθηκε.");
            return;
        }
        var hriFont = findFont(STYLE.hriFontNames) || font;

        // Dialog runs before doScript, so Cancel leaves no undo step behind.
        var selectedItem = getSelectedPageItem();
        var request = showBarcodeDialog(loadSettings(), selectedItem !== null);
        if (!request) return;
        saveSettings(request.options);

        var opts = request.options;
        var anchor = (opts.positionMode === "selection") ? selectedItem : null;
        var page = anchor ? anchor.parentPage : getTargetPage(doc);
        var C = {
            symbol: { widthMM: opts.widthMM, barHeightPct: opts.barHeightPct },
            layout: { originXMM: opts.xMM, originYMM: opts.yMM, anchorItem: anchor },
            typography: STYLE,
            font: font,
            hriFont: hriFont,
            display: request.display,  // code as shown above the bars (user's hyphenation kept)
            addOn: request.addOn       // "" or 5 digits
        };

        app.doScript(function () {
            try {
                drawInMillimetres(doc, page, C, request.code, request.codeType);
            } catch (e) {
                alert("Προέκυψε απρόσμενο σφάλμα κατά την εκτέλεση του script:\n" + e.toString());
            }
        }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Barcode ISBN/ISMN");

    } catch (e) {
        alert("Προέκυψε απρόσμενο σφάλμα κατά την εκτέλεση του script:\n" + e.toString());
    }

    // Units, ruler origin and zero point are switched for the drawing and always restored.
    function drawInMillimetres(doc, page, C, code, codeType){
        var vp = doc.viewPreferences;
        var saved = { h: vp.horizontalMeasurementUnits, v: vp.verticalMeasurementUnits, origin: vp.rulerOrigin, zero: doc.zeroPoint };
        vp.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS;
        vp.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;
        vp.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
        doc.zeroPoint = [0, 0];
        try {
            drawBarcode(doc, page, C, code, codeType);
        } finally {
            vp.horizontalMeasurementUnits = saved.h;
            vp.verticalMeasurementUnits = saved.v;
            vp.rulerOrigin = saved.origin;
            doc.zeroPoint = saved.zero;
        }
    }

    // Order: bars -> text (outlined, measured, moved) -> background sized to everything -> group -> final move.
    // On any failure, removes what was already drawn so no half-built barcode is left on the page.
    function drawBarcode(doc, page, C, code, codeType){
        var items = [];
        try {
            return buildBarcode(doc, page, C, code, codeType, items);
        } catch (e) {
            for (var i = 0; i < items.length; i++) {
                try { items[i].remove(); } catch (ignored) {}
            }
            throw e;
        }
    }

    // `items` is filled in place so drawBarcode can clean up after a failure.
    function buildBarcode(doc, page, C, code, codeType, items){
        var G = computeGeometry(SPEC, C);
        pushAll(items, drawBars(page, G, buildEAN13Pattern(code, E), S));
        var bounds = [[G.barsTop, G.barsLeft, G.barsBottom + G.guardExtMM, G.barsRight]];

        var isbn = drawISBNText(doc, page, C, G, codeType + " " + (C.display || code));
        pushAll(items, isbn);
        bounds.push(measure(isbn));

        var segments = getHRISegments(code, H);
        for (var i = 0; i < segments.length; i++) {
            var hri = drawHRIDigits(doc, page, C, G, segments[i]);
            pushAll(items, hri);
            bounds.push(measure(hri));
        }

        if (G.hasAddOn) pushAll(items, drawAddOn(doc, page, C, G, bounds));

        // Background: everything plus padding, and never narrower than the GS1 quiet zones.
        var padMM = C.typography.paddingX * G.moduleW;
        var sidePadMM = C.typography.sidePaddingX * G.moduleW;
        var u = unionBounds(bounds);
        var bg = drawBackground(page, [
            u[0] - padMM,
            Math.min(u[1], G.barsLeft - G.quietLeftMM) - sidePadMM,
            u[2] + padMM,
            Math.max(u[3], G.barsRight + G.quietRightMM) + sidePadMM
        ]);
        items.push(bg);

        var group = page.groups.add(items);
        group.name = codeType + " " + code + (C.addOn ? " + " + C.addOn : ""); // findable in the Layers panel
        items.length = 0;
        items.push(group);

        var gb = group.geometricBounds;
        var anchor = C.layout.anchorItem;
        if (anchor && anchor.isValid) {
            var ab = anchor.geometricBounds; // read here, while units are mm
            group.move(undefined, [(ab[1] + ab[3]) / 2 - (gb[1] + gb[3]) / 2, (ab[0] + ab[2]) / 2 - (gb[0] + gb[2]) / 2]);
        } else {
            group.move(undefined, [C.layout.originXMM - gb[1], C.layout.originYMM - gb[0]]);
        }
        return group;
    }

    function pushAll(target, list){
        for (var i = 0; i < list.length; i++) target.push(list[i]);
    }

    // The page shown in the active layout window. A story-editor window or a second window
    // on the same document no longer sends the barcode to the wrong page.
    function getTargetPage(doc) {
        try {
            var w = app.activeWindow;
            if (w.constructor.name === "LayoutWindow" && w.activePage.isValid) return w.activePage;
        } catch (e) {
            $.writeln("Note: no active layout window (" + e + "); using the document's first layout window.");
        }
        return doc.layoutWindows.length ? doc.layoutWindows[0].activePage : doc.pages[0];
    }

    // A single selected page item that sits on a page (not the pasteboard), or null.
    function getSelectedPageItem() {
        try {
            if (app.selection.length !== 1) return null;
            var item = app.selection[0];
            if (!item.hasOwnProperty("geometricBounds") || !item.hasOwnProperty("parentPage")) return null;
            return (item.parentPage && item.parentPage.isValid) ? item : null;
        } catch (e) {
            return null;
        }
    }

    // Returns a Font object (family + style), so a document default of Bold/Italic is not inherited.
    function getCompatibleFont(preferredFont) {
        return findFont([
            preferredFont + "\tRegular",
            preferredFont,
            preferredFont + " Regular",
            "Helvetica\tRegular",
            "Helvetica",
            "Myriad Pro\tRegular",
            "Myriad Pro"
        ]);
    }

    // First installed font from a list of InDesign font names ("Family\tStyle"), or null.
    function findFont(names) {
        for (var i = 0; i < names.length; i++) {
            var fontItem = app.fonts.itemByName(names[i]);
            if (fontItem.isValid) {
                return fontItem;
            }
        }
        return null;
    }

    // Missing or unreadable file -> defaults. Settings problems never block the barcode.
    function loadSettings() {
        try {
            if (!SETTINGS_FILE.exists) return copyOptions(DEFAULT_OPTIONS);
            SETTINGS_FILE.encoding = "UTF-8";
            if (!SETTINGS_FILE.open("r")) return copyOptions(DEFAULT_OPTIONS);
            var text = SETTINGS_FILE.read();
            SETTINGS_FILE.close();
            return parseSettings(text, DEFAULT_OPTIONS);
        } catch (e) {
            $.writeln("Warning: could not read settings: " + e);
            return copyOptions(DEFAULT_OPTIONS);
        }
    }

    function saveSettings(options) {
        try {
            if (!SETTINGS_FILE.parent.exists) SETTINGS_FILE.parent.create();
            SETTINGS_FILE.encoding = "UTF-8";
            if (!SETTINGS_FILE.open("w")) return;
            SETTINGS_FILE.write(serializeSettings(options));
            SETTINGS_FILE.close();
        } catch (e) {
            $.writeln("Warning: could not save settings: " + e);
        }
    }

    // Returns { codeType, code, options } once everything is valid, or null on Cancel.
    // Errors are shown inside the dialog, which stays open until they are fixed.
    function showBarcodeDialog(saved, hasSelection) {
        var dialog = new Window("dialog", "Δημιουργία Barcode ISBN/ISMN");
        dialog.orientation = "column";
        dialog.alignChildren = "fill";

        // --- Code ---
        var codePanel = dialog.add("panel", undefined, "Κωδικός");
        codePanel.alignChildren = "left";
        var typeGroup = codePanel.add("group");
        typeGroup.add("statictext", undefined, "Τύπος Κωδικού:");
        var typeDropdown = typeGroup.add("dropdownlist", undefined, ["ISBN-13 (978/979)", "ISMN-13 (9790)"]);
        typeDropdown.selection = (saved.codeType === "ISMN") ? 1 : 0;

        var codeGroup = codePanel.add("group");
        codeGroup.add("statictext", undefined, "Κωδικός (ή ISBN-10):");
        var codeInput = codeGroup.add("edittext", undefined, DEFAULT_CODES[typeDropdown.selection.index]);
        codeInput.characters = 18;

        // Swap in the example code only when the current code doesn't match the chosen type,
        // so a code the user typed (which also auto-selects the type below) is never overwritten.
        typeDropdown.onChange = function () {
            if (!typeDropdown.selection) return;
            var isIsmnCode = codeInput.text.replace(/\D/g, "").substr(0, 4) === "9790";
            var wantsIsmn = typeDropdown.selection.index === 1;
            if (isIsmnCode !== wantsIsmn) {
                codeInput.text = DEFAULT_CODES[typeDropdown.selection.index];
            }
        };

        codeInput.onChanging = function () {
            var digits = codeInput.text.replace(/\D/g, "");
            if (digits.length >= 4) {
                typeDropdown.selection = (digits.substr(0, 4) === "9790") ? 1 : 0;
            }
        };

        // --- Size ---
        var sizePanel = dialog.add("panel", undefined, "Μέγεθος");
        sizePanel.alignChildren = "left";
        var widthGroup = sizePanel.add("group");
        widthGroup.add("statictext", undefined, "Πλάτος μπαρών (mm):");
        var widthInput = widthGroup.add("edittext", undefined, formatDecimal(saved.widthMM, 2));
        widthInput.characters = 7;
        var widthInfo = widthGroup.add("statictext", undefined, "");
        widthInfo.characters = 26;

        var heightGroup = sizePanel.add("group");
        heightGroup.add("statictext", undefined, "Ύψος μπαρών (% του πλήρους):");
        var heightInput = heightGroup.add("edittext", undefined, String(saved.barHeightPct));
        heightInput.characters = 5;

        var addOnGroup = sizePanel.add("group");
        addOnGroup.add("statictext", undefined, "Πρόσθετο τιμής EAN-5 (προαιρετικό):");
        var addOnInput = addOnGroup.add("edittext", undefined, "");
        addOnInput.characters = 7;
        addOnGroup.add("statictext", undefined, "π.χ. 90000 = χωρίς τιμή");

        function updateWidthInfo() {
            var w = parseDecimal(widthInput.text);
            widthInfo.text = isNaN(w) ? "" :
                "≈ " + formatDecimal(w / nominalWidthMM(SPEC) * 100, 0) + "% · X = " + formatDecimal(w / S.TOTAL_MODULES, 3) + " mm";
        }
        widthInput.onChanging = updateWidthInfo;
        updateWidthInfo();

        // --- Position ---
        var posPanel = dialog.add("panel", undefined, "Θέση");
        posPanel.alignChildren = "left";
        var pageRadio = posPanel.add("radiobutton", undefined, "Στη σελίδα · πάνω αριστερή γωνία του λευκού φόντου:");
        var xyGroup = posPanel.add("group");
        xyGroup.add("statictext", undefined, "X (mm):");
        var xInput = xyGroup.add("edittext", undefined, formatDecimal(saved.xMM, 1));
        xInput.characters = 7;
        xyGroup.add("statictext", undefined, "Y (mm):");
        var yInput = xyGroup.add("edittext", undefined, formatDecimal(saved.yMM, 1));
        yInput.characters = 7;
        var selRadio = posPanel.add("radiobutton", undefined, "Στο κέντρο του επιλεγμένου αντικειμένου");
        selRadio.enabled = hasSelection;

        var useSelection = hasSelection && saved.positionMode === "selection";
        selRadio.value = useSelection;
        pageRadio.value = !useSelection;
        function updatePositionFields() { xyGroup.enabled = pageRadio.value; }
        pageRadio.onClick = updatePositionFields;
        selRadio.onClick = updatePositionFields;
        updatePositionFields();

        // --- Errors + buttons ---
        var errorText = dialog.add("statictext", undefined, "", { multiline: true });
        errorText.preferredSize = [420, 50]; // 3 lines: the width-range message is long
        // Red for errors, dark blue for notices (e.g. the ISBN-10 conversion).
        function showMessage(text, isError) {
            var g = errorText.graphics;
            g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, isError ? [0.8, 0.1, 0.1] : [0.1, 0.25, 0.55], 1);
            errorText.text = text;
        }

        var buttonGroup = dialog.add("group");
        buttonGroup.alignment = "right";
        var okButton = buttonGroup.add("button", undefined, "OK", { name: "ok" });
        buttonGroup.add("button", undefined, "Ακύρωση", { name: "cancel" });

        var result = null;
        okButton.onClick = function () {
            // ISBN-10: convert in place and stay open, so the user sees and confirms the ISBN-13.
            var isbn10 = convertISBN10(codeInput.text);
            if (isbn10) {
                if (isbn10.error) { showMessage(isbn10.error, true); return; }
                codeInput.text = isbn10.text;
                typeDropdown.selection = 0;
                showMessage("Το ISBN-10 μετατράπηκε σε ISBN-13: " + isbn10.text + ". Ελέγξτε το και πατήστε ξανά OK.", false);
                return;
            }
            var codeType = (typeDropdown.selection.index === 0) ? "ISBN" : "ISMN";
            var code = codeInput.text.replace(/\D/g, "");
            var options = {
                codeType: codeType,
                widthMM: parseDecimal(widthInput.text),
                barHeightPct: parseDecimal(heightInput.text),
                positionMode: selRadio.value ? "selection" : "page",
                xMM: parseDecimal(xInput.text),
                yMM: parseDecimal(yInput.text),
                addOn: addOnInput.text.replace(/\s/g, "")
            };
            var error = validateCode(codeType, code) || validateOptions(options, SPEC);
            if (error) {
                showMessage(error, true);
                return;
            }
            // Keep the last valid X/Y even when centring on a selection.
            if (options.positionMode === "selection") {
                if (isNaN(options.xMM)) options.xMM = saved.xMM;
                if (isNaN(options.yMM)) options.yMM = saved.yMM;
            }
            result = { codeType: codeType, code: code, display: displayCode(codeInput.text, code), addOn: options.addOn, options: options };
            dialog.close(1);
        };

        return (dialog.show() === 1) ? result : null;
    }

    function drawBackground(page, b){
        var r = page.rectangles.add({
            geometricBounds: b,
            fillColor:"Paper", strokeWeight:0, strokeColor:"None"
        });
        r.sendToBack();
        return r;
    }

    // Always returns an array: one united compound path, or the separate bars if unite() fails.
    function drawBars(page, G, pattern, S){
        var bars = [];
        var x = G.barsLeft;

        var CG_START = S.GUARD_START_LEN + S.DATA_LEFT_LEN;
        var CG_END = CG_START + S.GUARD_CENTER_LEN;
        var EG_START = CG_END + S.DATA_RIGHT_LEN;

        for (var i = 0; i < pattern.length; i++){
            var isGuard = (i < S.GUARD_START_LEN) || (i >= CG_START && i < CG_END) || (i >= EG_START);

            if (pattern.charAt(i) === "1"){
                var barBottomY = G.barsBottom + (isGuard ? G.guardExtMM : 0);
                bars.push(
                    page.rectangles.add({
                        geometricBounds:[G.barsTop, x, barBottomY, x + G.moduleW],
                        fillColor:"Black", strokeWeight:0, strokeColor:"None"
                    })
                );
            }
            x += G.moduleW;
        }

        return uniteOrKeep(bars);
    }

    // One united compound path, or the separate bars if Pathfinder unite() fails.
    function uniteOrKeep(bars){
        try {
            return [bars[0].unite(bars.slice(1))];
        } catch (e) {
            $.writeln("Warning: Pathfinder unite() failed. Returning individual bars. Error: " + e);
            return bars;
        }
    }

    function drawISBNText(doc, page, C, G, text){
        var sizeMM = G.symbolWidthMM * C.typography.isbnSizeFactor;
        var outlines = createOutlinedText(doc, page, C, text, C.font, sizeMM, C.typography.isbnTrackingValue);
        var b = measure(outlines);
        // A hyphenated line can outgrow the symbol: shrink it to fit the main symbol's quiet zones
        // (not the add-on, whose digits sit just below this line).
        var maxWidthMM = G.mainWidthMM;
        var w = b[3] - b[1];
        if (w > maxWidthMM) {
            for (var i = 0; i < outlines.length; i++) outlines[i].remove();
            outlines = createOutlinedText(doc, page, C, text, C.font, sizeMM * maxWidthMM / w, C.typography.isbnTrackingValue);
            b = measure(outlines);
        }
        // Centre over the bars and sit isbnGapX above them, from the real glyph bounds.
        moveAll(outlines,
            (G.barsLeft + G.barsRight) / 2 - (b[1] + b[3]) / 2,
            (G.barsTop - C.typography.isbnGapX * G.moduleW) - b[2]);
        return outlines;
    }

    // Digits sit below the main bars, or with their top at `topY` when given (add-on digits).
    function drawHRIDigits(doc, page, C, G, segment, topY){
        // Sized by measured digit height, not point size: OCR-B digits are ~33% taller than Arial's at the same size.
        var targetHeightMM = G.symbolWidthMM * C.typography.hriDigitHeightFactor;
        var outlines = createOutlinedText(doc, page, C, segment.text, C.hriFont, targetHeightMM, C.typography.hriTrackingValue);
        var b = measure(outlines);
        var h = b[2] - b[0];
        if (h > 0 && Math.abs(h - targetHeightMM) > 0.01) {
            for (var i = 0; i < outlines.length; i++) outlines[i].remove();
            outlines = createOutlinedText(doc, page, C, segment.text, C.hriFont,
                targetHeightMM * targetHeightMM / h, C.typography.hriTrackingValue);
            b = measure(outlines);
        }
        var centerX = G.barsLeft + (segment.startModule + segment.endModule) / 2 * G.moduleW;
        moveAll(outlines,
            centerX - (b[1] + b[3]) / 2,
            (topY !== undefined ? topY : G.barsBottom + C.typography.hriGapX * G.moduleW) - b[0]);
        return outlines;
    }

    // EAN-5 add-on: digits on top (aligned with the main bars' top), bars below them down to the
    // guard-bar bottom, united separately from the main symbol. Pushes its bounds into `bounds`.
    function drawAddOn(doc, page, C, G, bounds){
        var items = [];
        var segments = getAddOnHRISegments(C.addOn, SPEC);
        var digitBounds = [];
        for (var i = 0; i < segments.length; i++) {
            var d = drawHRIDigits(doc, page, C, G, segments[i], G.barsTop);
            pushAll(items, d);
            digitBounds.push(measure(d));
        }
        var top = unionBounds(digitBounds)[2] + C.typography.hriGapX * G.moduleW;
        var bottom = G.barsBottom + G.guardExtMM;
        var pattern = buildEAN5Pattern(C.addOn, E, SPEC.addOn);
        var bars = [];
        for (var j = 0; j < pattern.length; j++) {
            if (pattern.charAt(j) !== "1") continue;
            var x = G.addOnLeft + j * G.moduleW;
            bars.push(page.rectangles.add({
                geometricBounds: [top, x, bottom, x + G.moduleW],
                fillColor: "Black", strokeWeight: 0, strokeColor: "None"
            }));
        }
        pushAll(items, uniteOrKeep(bars));
        bounds.push(unionBounds(digitBounds), [top, G.addOnLeft, bottom, G.addOnRight]);
        return items;
    }

    // One line of text in a neutral, fully specified style, converted to outlines.
    // Position is irrelevant here: callers move the outlines by their measured bounds.
    function createOutlinedText(doc, page, C, text, font, sizeMM, tracking){
        var sizePt = sizeMM * C.typography.MM_TO_PT;
        var tf = page.textFrames.add({
            geometricBounds: [0, 0, sizeMM * 4, sizeMM * text.length * 2 + 10],
            contents: text
        });

        tf.applyObjectStyle(builtInStyle(doc.objectStyles, "$ID/[None]"), true);
        tf.fillColor = "None";
        tf.strokeColor = "None";
        tf.strokeWeight = 0;
        var tfp = tf.textFramePreferences;
        tfp.insetSpacing = [0, 0, 0, 0];
        tfp.autoSizingType = AutoSizingTypeEnum.OFF;
        tfp.verticalJustification = VerticalJustification.TOP_ALIGN;
        tfp.ignoreWrap = true;
        tfp.textColumnCount = 1;

        var t = tf.texts[0];
        t.applyParagraphStyle(builtInStyle(doc.paragraphStyles, "$ID/[No paragraph style]"), true);
        t.applyCharacterStyle(builtInStyle(doc.characterStyles, "$ID/[None]"));

        t.appliedFont = font;
        t.pointSize = sizePt;
        t.leading = sizePt * 1.2;
        t.tracking = (typeof tracking === "number" && !isNaN(tracking)) ? tracking : 0;
        t.justification = Justification.LEFT_ALIGN;
        t.fillColor = "Black";
        t.strokeColor = "None";
        t.noBreak = true;
        t.leftIndent = 0; t.rightIndent = 0; t.firstLineIndent = 0;
        t.spaceBefore = 0; t.spaceAfter = 0;
        t.hyphenation = false;
        t.alignToBaseline = false;
        t.baselineShift = 0;
        t.horizontalScale = 100; t.verticalScale = 100; t.skew = 0;
        t.capitalization = Capitalization.NORMAL;
        t.position = Position.NORMAL;
        t.underline = false; t.strikeThru = false;
        t.ruleAbove = false; t.ruleBelow = false;

        if (tf.overflows) {
            tf.remove();
            throw new Error("Το κείμενο «" + text + "» δεν χωράει στο πλαίσιο του. Δεν δημιουργήθηκε barcode.");
        }

        var outlines = tf.createOutlines(true);
        var result = [];
        for (var i = 0; i < outlines.length; i++) result.push(outlines[i]);
        return result;
    }

    // The built-in "no style" entry: by locale-independent $ID name, else index 0 (always the built-in one).
    function builtInStyle(collection, idName){
        var s = collection.item(idName);
        return s.isValid ? s : collection[0];
    }

    function measure(items){
        var list = [];
        for (var i = 0; i < items.length; i++) list.push(items[i].geometricBounds);
        return unionBounds(list);
    }

    function moveAll(items, dx, dy){
        for (var i = 0; i < items.length; i++) items[i].move(undefined, [dx, dy]);
    }

}

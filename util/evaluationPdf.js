// util/evaluationPdf.js
//
// Generates the downloadable Guardian Evaluation Form PDF from a submitted
// EvaluationForm document. Content flows continuously top-to-bottom and a
// new page is only started once the current one actually runs out of room
// (via ensureSpace(), using pdfkit's heightOfString to measure ahead of
// time) — so the page count reflects how much was actually filled in,
// instead of a fixed 7 mostly-empty pages. Fixed-choice questions (yes/no,
// single-select, multi-select) are rendered as a checkbox list showing every
// option with the guardian's choice(s) checked, instead of plain text.
//
// English-only by design — see evaluationFormLabels.js. The app's own
// "Translate" (Google Translate) button covers other languages wherever a
// guardian reads this content on the site; the PDF itself never carried a
// second language.
//
// The page count isn't known until everything has flowed, so the logo mark
// and "Filled by / Page X of Y" footer are added in a second pass over every
// buffered page (doc.bufferedPageRange()) right before doc.end() — see
// finalizePages().

const path = require("path");
const PDFDocument = require("pdfkit");
const { L } = require("./evaluationFormLabels");

const MARGIN = 46;
const FOOTER_H = 34; // strip reserved at the bottom of every page for the running footer
const LOGO_PATH = path.join(__dirname, "..", "assets", "images", "shubukanIndia-black.png");

const INK = "#3C3A36";
const VERMILLION = "#A61B1B";
const LINE_COLOR = "#ddd";

const val = (v, fallback = "-") => (v === null || v === undefined || v === "" ? fallback : String(v));

const MODE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "beforeExam", label: "Only before exam" },
];
const YES_NO_OPTIONS = [
  { value: true, label: L.yes },
  { value: false, label: L.no },
];
const SPORT_PERFORMANCE_OPTIONS = ["Bad", "Very bad", "Good", "Very good", "Excellent"].map((v) => ({ value: v, label: v }));
const TRAINING_AREA_OPTIONS = [
  { value: "Kihon", label: "Kihon (Basic)" },
  { value: "Kata", label: "Kata (Form)" },
  { value: "Ido Kihon", label: "Ido Kihon (Stepping Basic & Combination)" },
  { value: "Kumite", label: "Kumite (Fighting)" },
  { value: "Theory", label: "Theory" },
];
const TRAINING_NEEDED_OPTIONS = [
  { value: "Dojo", label: "Dojo (Center Training)" },
  { value: "District Camp", label: "District Camp" },
  { value: "State Camp", label: "State Camp" },
  { value: "National Camp", label: "National Camp" },
  { value: "Seminar", label: "Seminar" },
  { value: "International Session", label: "International Session" },
];
const FOOD_TYPE_OPTIONS = [
  { value: "veg", label: "Veg" },
  { value: "nonveg", label: "Non-Veg" },
];
const SCREEN_MODE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "onlyIfNecessary", label: "Only if necessary" },
];

function registerFonts(doc) {
  doc.registerFont("EN", "Helvetica");
  doc.registerFont("EN-Bold", "Helvetica-Bold");
}

// A labelKey looks up evaluationFormLabels.js; passing a plain string
// instead lets a caller use an ad-hoc sub-caption (e.g. "Duration") without
// needing a dedicated entry in that file.
const resolveLabel = (labelOrKey) => (typeof labelOrKey === "string" && labelOrKey in L ? L[labelOrKey] : labelOrKey);

const contentWidth = (doc) => doc.page.width - MARGIN * 2;
const bottomLimit = (doc) => doc.page.height - MARGIN - FOOTER_H;

// Starts a fresh page only when the next block of content wouldn't fit above
// the reserved footer strip — the core of the dynamic pagination.
function ensureSpace(doc, neededHeight) {
  if (doc.y + neededHeight > bottomLimit(doc)) {
    doc.addPage();
  }
}

// ---------- field helpers ----------

// "Label: value" — a plain field line.
function field(doc, labelOrKey, valueText, opts = {}) {
  const label = resolveLabel(labelOrKey);
  if (!label) return;
  const width = opts.width ?? contentWidth(doc);
  const line = valueText !== undefined && valueText !== null ? `${label}:  ${val(valueText)}` : label;

  doc.font("EN-Bold").fontSize(11);
  const h = doc.heightOfString(line, { width });
  ensureSpace(doc, h + 10);

  doc.font("EN-Bold").fontSize(11).fillColor(INK).text(line, MARGIN, doc.y, { width });
  doc.moveDown(0.4);
  doc.fillColor("#000");
}

function sectionHeading(doc, key) {
  const label = L[key];
  const width = contentWidth(doc);
  doc.font("EN-Bold").fontSize(16);
  const h = doc.heightOfString(label, { width });
  ensureSpace(doc, h + 30);

  doc.moveDown(0.5);
  doc.font("EN-Bold").fontSize(16).fillColor(VERMILLION).text(label, MARGIN, doc.y, { width });
  doc.moveTo(MARGIN, doc.y + 3).lineTo(doc.page.width - MARGIN, doc.y + 3).strokeColor(LINE_COLOR).stroke();
  // Extra breathing room below each major section's heading, before its
  // first question starts.
  doc.moveDown(1.1);
  doc.fillColor("#000");
}

function instructionLine(doc) {
  const width = contentWidth(doc);
  doc.font("EN").fontSize(9.5);
  const h = doc.heightOfString(L.yesNoInstruction, { width });
  ensureSpace(doc, h + 14);
  doc.font("EN").fontSize(9.5).fillColor("#777").text(L.yesNoInstruction, MARGIN, doc.y, { width });
  doc.moveDown(0.6).fillColor("#000");
}

// A checkbox glyph drawn as vectors — Helvetica/WinAnsi has no reliable
// Unicode checkbox glyph to fall back on.
function drawCheckbox(doc, x, y, size, checked) {
  doc.lineWidth(1).rect(x, y, size, size).strokeColor(checked ? VERMILLION : "#999").stroke();
  if (checked) {
    doc.rect(x + 2.2, y + 2.2, size - 4.4, size - 4.4).fillColor(VERMILLION).fill();
  }
}

// Renders the label, then every `options` entry as a checkbox, wrapping
// left-to-right into as many rows as needed, with the guardian's selected
// value(s) checked. `selected` is always an array — a single-select/yes-no
// field just wraps its one value before calling this.
function optionsField(doc, labelOrKey, options, selected) {
  const label = resolveLabel(labelOrKey);
  if (!label) return;
  const width = contentWidth(doc);
  const BOX = 10;
  const ROW_H = 20;
  const GAP_X = 18;

  doc.font("EN-Bold").fontSize(11);
  const labelHeight = doc.heightOfString(label, { width });

  // Pre-measure how many rows the options will wrap into, so the *whole*
  // field's height can be reserved in one ensureSpace call — a question
  // never gets awkwardly split across a page break.
  doc.font("EN").fontSize(10);
  const itemWidths = options.map((o) => BOX + 6 + doc.widthOfString(o.label) + GAP_X);
  let rows = 1;
  let rowW = 0;
  itemWidths.forEach((w) => {
    if (rowW + w > width && rowW > 0) {
      rows += 1;
      rowW = w;
    } else {
      rowW += w;
    }
  });

  ensureSpace(doc, labelHeight + 8 + rows * ROW_H + 6);

  doc.font("EN-Bold").fontSize(11).fillColor(INK).text(label, MARGIN, doc.y, { width });
  doc.moveDown(0.3);

  let x = MARGIN;
  let y = doc.y;
  options.forEach((o, i) => {
    const w = itemWidths[i];
    if (x + w - GAP_X > MARGIN + width && x > MARGIN) {
      x = MARGIN;
      y += ROW_H;
    }
    const checked = selected.includes(o.value);
    drawCheckbox(doc, x, y + 2, BOX, checked);
    // `width` here is a generous upper bound (remaining space to the right
    // margin), not the item's own tight-fit width — sizing it exactly to
    // the pre-measured label width caused pdfkit to wrap mid-word on
    // rounding differences between widthOfString() and the actual glyph
    // layout used by text(). lineBreak:false + positions already fixed by
    // `x` below means this never bleeds into the next item.
    doc
      .font(checked ? "EN-Bold" : "EN")
      .fontSize(10)
      .fillColor(checked ? VERMILLION : "#444")
      .text(o.label, x + BOX + 6, y, { width: MARGIN + width - (x + BOX + 6), lineBreak: false });
    x += w;
  });
  doc.x = MARGIN;
  doc.y = y + ROW_H + 4;
  doc.fillColor("#000");
}

const yesNoField = (doc, labelOrKey, value) => optionsField(doc, labelOrKey, YES_NO_OPTIONS, [value]);

function paragraph(doc, text, opts = {}) {
  const width = opts.width ?? contentWidth(doc);
  doc.font("EN").fontSize(11);
  const h = doc.heightOfString(val(text), { width });
  ensureSpace(doc, h + 14);
  doc.font("EN").fontSize(11).fillColor("#000").text(val(text), MARGIN, doc.y, { width });
  doc.moveDown(0.4);
}

// A label followed by its free-text answer on the next line (used for the
// longer remarks/suggestion fields, mirroring the original layout).
function labeledParagraph(doc, labelOrKey, text) {
  field(doc, labelOrKey, null);
  paragraph(doc, text);
}

// ---------- title / footer (footer added in a second pass — see below) ----------

function drawTitleBlock(doc) {
  const width = contentWidth(doc);
  try {
    doc.image(LOGO_PATH, doc.page.width / 2 - 30, doc.y, { width: 60 });
    // Margin below the logo before the title text starts.
    doc.moveDown(5.2);
  } catch (e) {
    // Missing/unreadable logo file should never break PDF generation.
  }
  doc.font("EN-Bold").fontSize(22).fillColor(INK).text(L.formTitle, { align: "center" });
  doc.font("EN").fontSize(9.5).fillColor("#666").text("Shubukan India  |  www.shubukanindia.org", { align: "center" });
  doc.moveDown(1.2);
  doc.fillColor("#000");
}

function drawFinalSignature(doc, form) {
  const colWidth = 220;
  ensureSpace(doc, 90);
  doc.moveDown(1);
  const sigY = doc.y;
  if (form.filledByName) {
    doc.font("EN-Bold").fontSize(12).fillColor(INK).text(form.filledByName, MARGIN, sigY + 10, {
      width: colWidth,
      align: "center",
    });
  }
  doc.moveTo(MARGIN, sigY + 48).lineTo(MARGIN + colWidth, sigY + 48).strokeColor("#999").stroke();
  doc.font("EN").fontSize(10).fillColor("#666").text(L.guardianSignature, MARGIN, sigY + 52, { width: colWidth, align: "center" });
  doc.moveDown(1.4);
  doc.font("EN").fontSize(10).fillColor("#666").text(
    `${L.date}: ${form.submittedAt ? new Date(form.submittedAt).toLocaleDateString() : "-"}`,
    MARGIN
  );
  doc.fillColor("#000");
}

// Adds the small corner logo + "Filled by / Page X of Y" footer to every
// already-generated page. Run once at the very end, since the final page
// count is only known after all content has flowed (bufferPages: true keeps
// every page in memory until doc.end() so this is possible).
function finalizePages(doc, filledByName) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);

    if (i > 0) {
      try {
        doc.image(LOGO_PATH, doc.page.width - MARGIN - 30, 14, { width: 30 });
      } catch (e) {
        // fine without it
      }
    }

    const y = doc.page.height - MARGIN - FOOTER_H + 14;
    doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).strokeColor(LINE_COLOR).stroke();
    doc.font("EN").fontSize(8.5).fillColor("#999");
    doc.text(filledByName ? `Filled by: ${filledByName}` : "", MARGIN, y + 7, { width: 260, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - MARGIN - 140, y + 7, {
      width: 140,
      align: "right",
      lineBreak: false,
    });
    doc.fillColor("#000");
  }
}

function generateEvaluationFormPdf(form) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
      registerFonts(doc);

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const s = form.student || {};
      const t = form.teacher || {};
      const tr = form.training || {};

      /* ================= Title ================= */
      drawTitleBlock(doc);

      /* ================= For Students ================= */
      sectionHeading(doc, "studentSectionTitle");
      instructionLine(doc);

      field(doc, "studentName", s.name);
      field(doc, "age", s.age);
      field(doc, "dob", s.dob ? new Date(s.dob).toLocaleDateString() : null);
      field(doc, "currentRank", s.currentRank);
      field(doc, "instructor", s.instructorName);
      field(doc, "dojo", s.dojoName);
      field(doc, "classOf", s.classOf);
      field(doc, "board", s.board);
      field(doc, "q2", s.studyTime);

      optionsField(doc, "q3", MODE_OPTIONS, [s.karatePractice?.mode]);
      if (s.karatePractice?.mode && s.karatePractice.mode !== "beforeExam" && s.karatePractice?.duration) {
        field(doc, "Duration", s.karatePractice.duration);
      }
      optionsField(doc, "q4", MODE_OPTIONS, [s.karateNotes?.mode]);
      if (s.karateNotes?.mode && s.karateNotes.mode !== "beforeExam" && s.karateNotes?.duration) {
        field(doc, "Duration", s.karateNotes.duration);
      }

      field(doc, "q5", s.otherArtsNames);
      optionsField(doc, "Other Arts — Practice Time", MODE_OPTIONS, [s.otherArtsPractice?.mode]);
      if (s.otherArtsPractice?.mode && s.otherArtsPractice.mode !== "beforeExam" && s.otherArtsPractice?.duration) {
        field(doc, "Duration", s.otherArtsPractice.duration);
      }

      field(doc, "q6", s.physicalExerciseTime);

      yesNoField(doc, "q7", s.screenDevice?.used);
      if (s.screenDevice?.used) {
        optionsField(doc, "How Often", SCREEN_MODE_OPTIONS, [s.screenDevice?.mode]);
        if (s.screenDevice?.mode === "daily" && s.screenDevice?.duration) {
          field(doc, "Duration", s.screenDevice.duration);
        }
      }

      field(doc, "q8", s.sleep?.totalDuration);
      field(doc, "bedTime", s.sleep?.bedTime);
      field(doc, "afternoonSleep", s.sleep?.afternoonSleep);

      optionsField(doc, "q9", FOOD_TYPE_OPTIONS, [s.food?.type]);

      field(doc, "q10", null);
      field(doc, "breakfast", s.food?.times?.breakfast);
      field(doc, "lunch", s.food?.times?.lunch);
      field(doc, "afternoonSnacks", s.food?.times?.afternoonSnacks);
      field(doc, "dinner", s.food?.times?.dinner);

      const tiffins = s.food?.otherTiffinTimes || [];
      if (tiffins.length) {
        field(doc, "q11", tiffins.map((tf) => `No.${tf.no}: ${tf.time}`).join("  "));
      }
      if (s.food?.remarks) field(doc, "remarksIfAny", s.food.remarks);

      field(doc, "q12height", s.height);
      field(doc, "q12weight", s.weight);

      optionsField(doc, "q13", SPORT_PERFORMANCE_OPTIONS, [s.sportPerformance]);

      field(doc, "q14", s.hobby);
      if (s.hobbyRemarks) field(doc, "hobbyRemarks", s.hobbyRemarks);

      labeledParagraph(doc, "q15", s.karateLearningRemarks);

      /* ================= For the Teacher ================= */
      sectionHeading(doc, "teacherSectionTitle");
      instructionLine(doc);
      yesNoField(doc, "t1", t.punctual);
      yesNoField(doc, "t2", t.attentionToEachStudent);
      yesNoField(doc, "t3", t.hardWorking);
      optionsField(doc, "t4", TRAINING_AREA_OPTIONS, t.goodTrainingAreas || []);
      yesNoField(doc, "t5", t.honest);
      labeledParagraph(doc, "t6", t.remarks);

      /* ================= About Training ================= */
      sectionHeading(doc, "trainingSectionTitle");
      instructionLine(doc);

      optionsField(doc, "tr1", TRAINING_NEEDED_OPTIONS, tr.trainingNeeded || []);

      yesNoField(doc, "tr2i", tr.studiedSportKarateBefore?.answer);
      if (tr.studiedSportKarateBefore?.answer) {
        field(doc, "styleName", tr.studiedSportKarateBefore.styleName);
        field(doc, "coachName", tr.studiedSportKarateBefore.coachName);
        field(doc, "yearsLearnt", tr.studiedSportKarateBefore.yearsLearnt);
      }

      yesNoField(doc, "tr2ii", tr.newInTraditionalFullContact);

      yesNoField(doc, "tr2iii", tr.otherMartialArts?.answer);
      if (tr.otherMartialArts?.answer) {
        field(doc, "styleName", tr.otherMartialArts.styleName);
        field(doc, "coachName", tr.otherMartialArts.coachName);
        field(doc, "yearsLearnt", tr.otherMartialArts.yearsLearnt);
      }

      yesNoField(doc, "tr3", tr.preferScientificEffectiveLesson);
      if (tr.preferScientificEffectiveLesson === false) {
        labeledParagraph(doc, "suggestIfNo", tr.preferScientificSuggestion);
      }

      yesNoField(doc, "tr4", tr.preferOnlyFitness);
      if (tr.preferOnlyFitness === true) {
        labeledParagraph(doc, "suggestIfYes", tr.preferOnlyFitnessSuggestion);
      }

      yesNoField(doc, "tr5", tr.onlyNeedBeltCertificate);
      if (tr.onlyNeedBeltCertificate === false) {
        labeledParagraph(doc, "suggestIfNo", tr.onlyNeedBeltCertificateSuggestion);
      }

      labeledParagraph(doc, "tr6", tr.remarksAndSuggestion);

      /* ================= Signature ================= */
      field(doc, "filledByName", form.filledByName);
      drawFinalSignature(doc, form);

      finalizePages(doc, form.filledByName);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateEvaluationFormPdf };

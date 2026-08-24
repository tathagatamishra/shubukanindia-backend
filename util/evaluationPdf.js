// util/evaluationPdf.js
//
// Generates the downloadable Guardian Evaluation Form PDF from a submitted
// EvaluationForm document. Page breaks mirror the original 7-page
// "Guardian Evaluation Marksheet" PDF exactly. Each field is rendered with
// its English label followed by the Bengali translation on the next line.
//
// NOTE on Bengali rendering: pdfkit does not perform full OpenType complex-
// script shaping (no HarfBuzz), so a handful of Bengali conjunct sequences
// can throw when drawn. drawBengaliLine() below catches that per-call and
// simply skips that one line, rather than disabling Bengali for the whole
// document (which was the original bug here).

const path = require("path");
const PDFDocument = require("pdfkit");
const { L } = require("./evaluationFormLabels");

const MARGIN = 46;
const BENGALI_FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansBengali-Regular.ttf");

const yn = (v) => (v === true ? "Yes" : v === false ? "No" : "-");
const val = (v, fallback = "-") => (v === null || v === undefined || v === "" ? fallback : String(v));
const MODE_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", beforeExam: "Only before exam" };
const timeVal = (entry) => {
  if (!entry || !entry.mode) return "-";
  if (entry.mode === "beforeExam") return "Only before exam";
  const label = MODE_LABEL[entry.mode] || entry.mode;
  return entry.duration ? `${label} — ${entry.duration}` : label;
};

let bengaliFontLoaded = true;

function registerFonts(doc) {
  doc.registerFont("EN", "Helvetica");
  doc.registerFont("EN-Bold", "Helvetica-Bold");
  try {
    doc.registerFont("BN", BENGALI_FONT_PATH);
    bengaliFontLoaded = true;
  } catch (e) {
    bengaliFontLoaded = false;
  }
}

// Draws one line of Bengali text if possible. If this specific string trips a
// pdfkit shaping bug, it's skipped silently - it does NOT affect later lines.
function drawBengaliLine(doc, text, x, y, opts = {}) {
  if (!bengaliFontLoaded || !text) return;
  try {
    doc.font("BN").text(text, x, y, opts);
  } catch (e) {
    // Skip just this line; other Bengali text elsewhere is unaffected.
  }
}

// Draws "English Label: value" then, on the next line, the Bengali label in muted small text.
function bilingualField(doc, labelKey, valueText, opts = {}) {
  const label = L[labelKey];
  if (!label) return;
  const startX = opts.x ?? MARGIN;
  const width = opts.width ?? doc.page.width - MARGIN * 2;

  const line = valueText !== undefined && valueText !== null ? `${label.en}:  ${val(valueText)}` : label.en;
  doc.font("EN-Bold").fontSize(9.5).fillColor("#3C3A36").text(line, startX, doc.y, { width });

  doc.fontSize(8.5).fillColor("#8a8578");
  drawBengaliLine(doc, label.bn, startX, doc.y, { width });
  doc.moveDown(0.35);
}

function sectionHeading(doc, key) {
  const label = L[key];
  doc.moveDown(0.4);
  doc.font("EN-Bold").fontSize(13).fillColor("#A61B1B").text(label.en);
  doc.fontSize(11).fillColor("#A61B1B");
  drawBengaliLine(doc, label.bn, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 });
  doc.moveTo(MARGIN, doc.y + 2).lineTo(doc.page.width - MARGIN, doc.y + 2).strokeColor("#ddd").stroke();
  doc.moveDown(0.5);
  doc.fillColor("#000");
}

function instructionLine(doc) {
  doc.font("EN").fontSize(8.5).fillColor("#777").text(L.yesNoInstruction.en, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 });
  doc.fontSize(8).fillColor("#999");
  drawBengaliLine(doc, L.yesNoInstruction.bn, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 });
  doc.moveDown(0.5).fillColor("#000");
}

// `filledByName` is printed in the signature slot so the form always shows
// who filled it in (there is no uploaded signature image).
function drawFooterSignature(doc, filledByName) {
  const bottomY = doc.page.height - MARGIN - 55;
  if (filledByName) {
    doc.font("EN-Bold").fontSize(10).fillColor("#3C3A36").text(filledByName, doc.page.width - MARGIN - 170, bottomY - 26, {
      width: 170,
      align: "center",
    });
  }
  const colX = doc.page.width - MARGIN - 170;
  doc.moveTo(colX, bottomY).lineTo(doc.page.width - MARGIN, bottomY).strokeColor("#999").stroke();
  doc.font("EN").fontSize(9).fillColor("#666").text(L.guardianSignature.en, colX, bottomY + 4, { width: 170, align: "center" });
  doc.fontSize(8).fillColor("#999");
  drawBengaliLine(doc, L.guardianSignature.bn, colX, doc.y, { width: 170, align: "center" });
  doc.fillColor("#000");
}

function pageHeader(doc, title) {
  doc.font("EN-Bold").fontSize(11).fillColor("#3C3A36").text(title, MARGIN, MARGIN - 10, { align: "left" });
  doc.moveDown(0.6);
}

function generateEvaluationFormPdf(form) {
  return new Promise(async (resolve, reject) => {
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

      /* ================= PAGE 1: Header + Student info + Q1-7 ================= */
      doc.font("EN-Bold").fontSize(20).fillColor("#3C3A36").text(L.formTitle.en, { align: "center" });
      doc.fontSize(13).fillColor("#3C3A36");
      drawBengaliLine(doc, L.formTitle.bn, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2, align: "center" });
      doc.font("EN").fontSize(9).fillColor("#666").text("Shubukan India  |  www.shubukanindia.org", { align: "center" });
      doc.moveDown(0.8);

      sectionHeading(doc, "studentSectionTitle");
      instructionLine(doc);

      bilingualField(doc, "studentName", s.name);
      bilingualField(doc, "age", s.age);
      bilingualField(doc, "dob", s.dob ? new Date(s.dob).toLocaleDateString() : null);
      bilingualField(doc, "currentRank", s.currentRank);
      bilingualField(doc, "instructor", s.instructorName);
      bilingualField(doc, "dojo", s.dojoName);
      bilingualField(doc, "classOf", s.classOf);
      bilingualField(doc, "board", s.board);
      bilingualField(doc, "q2", s.studyTime);
      bilingualField(doc, "q3", timeVal(s.karatePractice));
      bilingualField(doc, "q4", timeVal(s.karateNotes));
      bilingualField(doc, "q5", `${val(s.otherArtsNames)} — ${timeVal(s.otherArtsPractice)}`);
      bilingualField(doc, "q6", s.physicalExerciseTime);
      bilingualField(
        doc,
        "q7",
        `${yn(s.screenDevice?.used)}${
          s.screenDevice?.used
            ? ` — ${s.screenDevice.mode === "onlyIfNecessary" ? "only if necessary" : val(s.screenDevice.duration)}`
            : ""
        }`
      );
      drawFooterSignature(doc, form.filledByName);

      /* ================= PAGE 2: Sleep & Food (Q8-11) ================= */
      doc.addPage();
      pageHeader(doc, "Guardian Evaluation Marksheet — Sleep & Food");
      bilingualField(doc, "q8", s.sleep?.totalDuration);
      bilingualField(doc, "bedTime", s.sleep?.bedTime);
      bilingualField(doc, "afternoonSleep", s.sleep?.afternoonSleep);
      bilingualField(doc, "q9", s.food?.type === "veg" ? "Vegetarian" : s.food?.type === "nonveg" ? "Non-vegetarian" : "-");
      bilingualField(doc, "q10", null);
      bilingualField(doc, "breakfast", s.food?.times?.breakfast);
      bilingualField(doc, "lunch", s.food?.times?.lunch);
      bilingualField(doc, "afternoonSnacks", s.food?.times?.afternoonSnacks);
      bilingualField(doc, "dinner", s.food?.times?.dinner);
      const tiffins = s.food?.otherTiffinTimes || [];
      if (tiffins.length) {
        bilingualField(doc, "q11", tiffins.map((tf) => `No.${tf.no}: ${tf.time}`).join("  "));
      }
      if (s.food?.remarks) bilingualField(doc, "remarksIfAny", s.food.remarks);
      drawFooterSignature(doc, form.filledByName);

      /* ================= PAGE 3: Physical & Personal (Q12-15) ================= */
      doc.addPage();
      pageHeader(doc, "Guardian Evaluation Marksheet — Physical & Personal");
      bilingualField(doc, "q12height", s.height);
      bilingualField(doc, "q12weight", s.weight);
      bilingualField(doc, "q13", s.sportPerformance);
      bilingualField(doc, "q14", s.hobby);
      if (s.hobbyRemarks) bilingualField(doc, "hobbyRemarks", s.hobbyRemarks);
      bilingualField(doc, "q15", null);
      doc.font("EN").fontSize(10).fillColor("#000").text(val(s.karateLearningRemarks), { width: 480 });
      drawFooterSignature(doc, form.filledByName);

      /* ================= PAGE 4: For the Teacher ================= */
      doc.addPage();
      pageHeader(doc, "Guardian Evaluation Marksheet — For the Teacher");
      sectionHeading(doc, "teacherSectionTitle");
      instructionLine(doc);
      bilingualField(doc, "t1", yn(t.punctual));
      bilingualField(doc, "t2", yn(t.attentionToEachStudent));
      bilingualField(doc, "t3", yn(t.hardWorking));
      bilingualField(doc, "t4", (t.goodTrainingAreas || []).join(", ") || "-");
      bilingualField(doc, "t5", yn(t.honest));
      bilingualField(doc, "t6", null);
      doc.font("EN").fontSize(10).fillColor("#000").text(val(t.remarks), { width: 480 });
      drawFooterSignature(doc, form.filledByName);

      /* ================= PAGE 5: About Training — Q1, Q2 ================= */
      doc.addPage();
      pageHeader(doc, "Guardian Evaluation Marksheet — About Training");
      sectionHeading(doc, "trainingSectionTitle");
      instructionLine(doc);
      bilingualField(doc, "tr1", (tr.trainingNeeded || []).join(", ") || "-");
      bilingualField(doc, "tr2i", yn(tr.studiedSportKarateBefore?.answer));
      if (tr.studiedSportKarateBefore?.answer) {
        bilingualField(doc, "styleName", tr.studiedSportKarateBefore.styleName);
        bilingualField(doc, "coachName", tr.studiedSportKarateBefore.coachName);
        bilingualField(doc, "yearsLearnt", tr.studiedSportKarateBefore.yearsLearnt);
      }
      bilingualField(doc, "tr2ii", yn(tr.newInTraditionalFullContact));
      bilingualField(doc, "tr2iii", yn(tr.otherMartialArts?.answer));
      if (tr.otherMartialArts?.answer) {
        bilingualField(doc, "styleName", tr.otherMartialArts.styleName);
        bilingualField(doc, "coachName", tr.otherMartialArts.coachName);
        bilingualField(doc, "yearsLearnt", tr.otherMartialArts.yearsLearnt);
      }
      drawFooterSignature(doc, form.filledByName);

      /* ================= PAGE 6: About Training — Q3, Q4 ================= */
      doc.addPage();
      pageHeader(doc, "Guardian Evaluation Marksheet — Training Preferences");
      bilingualField(doc, "tr3", yn(tr.preferScientificEffectiveLesson));
      if (tr.preferScientificEffectiveLesson === false) {
        bilingualField(doc, "suggestIfNo", tr.preferScientificSuggestion);
      }
      bilingualField(doc, "tr4", yn(tr.preferOnlyFitness));
      if (tr.preferOnlyFitness === true) {
        bilingualField(doc, "suggestIfYes", tr.preferOnlyFitnessSuggestion);
      }
      drawFooterSignature(doc, form.filledByName);

      /* ================= PAGE 7: About Training — Q5, Q6 + final signatures ================= */
      doc.addPage();
      pageHeader(doc, "Guardian Evaluation Marksheet — Final");
      bilingualField(doc, "tr5", yn(tr.onlyNeedBeltCertificate));
      if (tr.onlyNeedBeltCertificate === false) {
        bilingualField(doc, "suggestIfNo", tr.onlyNeedBeltCertificateSuggestion);
      }
      bilingualField(doc, "tr6", null);
      doc.font("EN").fontSize(10).fillColor("#000").text(val(tr.remarksAndSuggestion), { width: 480 });

      doc.moveDown(1.2);
      bilingualField(doc, "filledByName", form.filledByName);

      doc.moveDown(1.3);
      const sigY = doc.y;
      const colWidth = 220;

      if (form.filledByName) {
        doc.font("EN-Bold").fontSize(11).fillColor("#3C3A36").text(form.filledByName, MARGIN, sigY + 10, {
          width: colWidth,
          align: "center",
        });
      }
      doc.moveTo(MARGIN, sigY + 45).lineTo(MARGIN + colWidth, sigY + 45).strokeColor("#999").stroke();
      doc.font("EN").fontSize(9).fillColor("#666").text(L.guardianSignature.en, MARGIN, sigY + 48, { width: colWidth, align: "center" });
      doc.fontSize(8).fillColor("#999");
      drawBengaliLine(doc, L.guardianSignature.bn, MARGIN, doc.y, { width: colWidth, align: "center" });

      doc.moveDown(2);
      doc.font("EN").fontSize(9).fillColor("#666").text(
        `${L.date.en}: ${form.submittedAt ? new Date(form.submittedAt).toLocaleDateString() : "-"}`,
        MARGIN
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateEvaluationFormPdf };

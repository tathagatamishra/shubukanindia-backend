// controller/evaluationCtrl.js
const EvaluationWindowModel = require("../model/evaluationWindowModel");
const EvaluationFormModel = require("../model/evaluationFormModel");
const LearnerModel = require("../model/learnerModel");
const GuardianModel = require("../model/guardianModel");
const InstructorIDModel = require("../model/instructorIDModel");
const { sendEmail } = require("../util/sendEmail");
const { evaluationWindowEmailTemplate } = require("../util/emailTemplate");
const { generateEvaluationFormPdf } = require("../util/evaluationPdf");

const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Select inputs on the frontend send "" before a choice is made. Mongoose enum
// paths only accept the declared values (plus null), so "" must be normalized
// to null before it ever reaches a save() call.
function sanitizeStudentEnums(student) {
  if (!student) return student;
  const s = { ...student };
  if (s.sportPerformance === "") s.sportPerformance = null;
  if (s.food) s.food = { ...s.food, type: s.food.type === "" ? null : s.food.type };
  if (s.screenDevice) s.screenDevice = { ...s.screenDevice, mode: s.screenDevice.mode === "" ? null : s.screenDevice.mode };
  ["karatePractice", "karateNotes", "otherArtsPractice"].forEach((key) => {
    if (s[key]) s[key] = { ...s[key], mode: s[key].mode === "" ? null : s[key].mode };
  });
  return s;
}

/* ===================== ADMIN: EVALUATION WINDOWS ===================== */

// Admin opens the portal for one or more instructors over a date range
exports.createEvaluationWindow = async (req, res) => {
  try {
    const { title, instructorCodes, startDate, endDate } = req.body;
    if (!title || !Array.isArray(instructorCodes) || !instructorCodes.length || !startDate || !endDate) {
      return res.status(400).json({
        message: "title, instructorCodes (non-empty array), startDate and endDate are required",
      });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: "startDate must be before endDate" });
    }

    const window = await EvaluationWindowModel.create({
      title,
      instructorCodes,
      startDate,
      endDate,
      createdBy: req.admin._id,
    });

    // Notify every guardian who currently has a learner under any of these instructors
    const learners = await LearnerModel.find({
      instructorCode: { $in: instructorCodes },
      isDeleted: false,
    }).distinct("guardianId");

    const guardians = await GuardianModel.find({
      _id: { $in: learners },
      isDeleted: false,
      isVerified: true,
    });

    await Promise.all(
      guardians.map((g) =>
        sendEmail(
          g.email,
          `${title} is now open`,
          evaluationWindowEmailTemplate({ title, startDate, endDate })
        )
      )
    );

    window.notifiedGuardianIds = guardians.map((g) => g._id);
    await window.save();

    return res.status(201).json({ success: true, data: window });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllEvaluationWindows = async (req, res) => {
  try {
    const windows = await EvaluationWindowModel.find({ isDeleted: false }).sort({ createdAt: -1 });
    return res.json({ success: true, count: windows.length, data: windows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin edits an open window's title, dates, or instructor coverage.
// Guardians already notified are not re-notified on edit.
exports.updateEvaluationWindow = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, instructorCodes, startDate, endDate } = req.body;
    if (!title || !Array.isArray(instructorCodes) || !instructorCodes.length || !startDate || !endDate) {
      return res.status(400).json({
        message: "title, instructorCodes (non-empty array), startDate and endDate are required",
      });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: "startDate must be before endDate" });
    }

    const window = await EvaluationWindowModel.findOne({ _id: id, isDeleted: false });
    if (!window) return res.status(404).json({ message: "Window not found" });
    if (!window.isCurrentlyOpen()) {
      return res.status(400).json({ message: "Only currently open windows can be edited" });
    }

    window.title = title;
    window.instructorCodes = instructorCodes;
    window.startDate = startDate;
    window.endDate = endDate;
    await window.save();

    return res.json({ success: true, data: window });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeEvaluationWindowEarly = async (req, res) => {
  try {
    const { id } = req.params;
    const window = await EvaluationWindowModel.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { closedEarly: true },
      { new: true }
    );
    if (!window) return res.status(404).json({ message: "Window not found" });
    return res.json({ success: true, data: window });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ===================== GUARDIAN: FILL FORM ===================== */

// All currently-open windows that cover at least one of this guardian's learners,
// with per-learner draft/submitted/pending status.
exports.getActiveWindowsForGuardian = async (req, res) => {
  try {
    const now = new Date();
    const learners = await LearnerModel.find({ guardianId: req.guardian._id, isDeleted: false });
    const codes = learners.map((l) => l.instructorCode).filter(Boolean);

    const windows = await EvaluationWindowModel.find({
      isDeleted: false,
      closedEarly: false,
      instructorCodes: { $in: codes },
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ startDate: -1 });

    const result = await Promise.all(
      windows.map(async (w) => {
        const eligibleLearners = learners.filter((l) => l.instructorCode && w.instructorCodes.includes(l.instructorCode));
        const forms = await EvaluationFormModel.find({
          windowId: w._id,
          learnerId: { $in: eligibleLearners.map((l) => l._id) },
          isDeleted: false,
        });
        const formByLearner = new Map(forms.map((f) => [String(f.learnerId), f]));

        return {
          window: w,
          learners: eligibleLearners.map((l) => {
            const f = formByLearner.get(String(l._id));
            return {
              learner: l,
              status: f ? f.status : "pending",
              formId: f ? f._id : null,
              submittedAt: f ? f.submittedAt : null,
            };
          }),
        };
      })
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const assertLearnerIsGuardians = async (guardianId, learnerId) => {
  const learner = await LearnerModel.findOne({ _id: learnerId, guardianId, isDeleted: false });
  return learner;
};

const assertWindowOpenForLearner = async (windowId, learner) => {
  const window = await EvaluationWindowModel.findOne({ _id: windowId, isDeleted: false });
  if (!window) return { window: null, ok: false, reason: "Evaluation window not found" };
  if (!learner.instructorCode || !window.instructorCodes.includes(learner.instructorCode)) {
    return { window, ok: false, reason: "This window does not cover this learner's instructor" };
  }
  if (!window.isCurrentlyOpen()) {
    return { window, ok: false, reason: "This evaluation window is not currently open" };
  }
  return { window, ok: true };
};

// Create or update a draft (partial fields allowed)
exports.saveDraftForm = async (req, res) => {
  try {
    const { learnerId, windowId } = req.params;
    const learner = await assertLearnerIsGuardians(req.guardian._id, learnerId);
    if (!learner) return res.status(404).json({ message: "Learner not found" });

    const { ok, reason } = await assertWindowOpenForLearner(windowId, learner);
    if (!ok) return res.status(400).json({ message: reason });

    let form = await EvaluationFormModel.findOne({ windowId, learnerId, isDeleted: false });

    if (form && form.status === "submitted") {
      const withinEdit = Date.now() - new Date(form.submittedAt).getTime() <= EDIT_WINDOW_MS;
      if (!withinEdit) {
        return res.status(403).json({ message: "Edit window (5 minutes after submission) has expired" });
      }
    }

    const { student, teacher, training, filledByName } = req.body;

    const update = {
      guardianId: req.guardian._id,
      learnerId,
      windowId,
      dojoId: learner.dojoId,
      instructorCode: learner.instructorCode,
    };
    if (student) update.student = { ...(form ? form.student.toObject() : {}), ...sanitizeStudentEnums(student) };
    if (teacher) update.teacher = { ...(form ? form.teacher.toObject() : {}), ...teacher };
    if (training) update.training = { ...(form ? form.training.toObject() : {}), ...training };
    if (filledByName !== undefined) update.filledByName = filledByName;

    if (!form) {
      update.status = "draft";
      form = await EvaluationFormModel.create(update);
    } else {
      Object.assign(form, update);
      // finalized forms edited within the 5-min window stay "submitted"
      await form.save();
    }

    return res.status(200).json({ success: true, data: form });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A form for this learner already exists for this window" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Validates that every mandatory field is filled before allowing finalization.
// The second argument to req() is what the guardian actually sees in the
// "please fill in ..." error if it's missing — a plain question label, not a
// dev-facing field path — so keep it human-readable.
function findMissingFields(form) {
  const missing = [];
  const req = (cond, label) => {
    if (!cond) missing.push(label);
  };
  const s = form.student || {};
  req(s.name, "Student Name");
  req(s.age !== null && s.age !== undefined, "Age");
  req(s.dob, "Date of Birth");
  req(s.currentRank, "Student's Current Rank");
  req(s.classOf, "Class");
  req(s.board, "Board");
  req(s.studyTime, "Study Time");
  req(s.karatePractice?.mode, "Karate Practice Time");
  req(s.karateNotes?.mode, "Karate Notes/Theory Studies");
  req(s.otherArtsNames, "Other Arts Practiced (names)");
  req(s.otherArtsPractice?.mode, "Other Arts Practice Time");
  req(s.physicalExerciseTime, "Physical Exercise Time");
  req(s.screenDevice?.used !== null && s.screenDevice?.used !== undefined, "Screen Device Usage");
  if (s.screenDevice?.used) req(s.screenDevice?.mode, "Screen Device — How Often");
  req(s.sleep?.totalDuration, "Sleep Duration");
  req(s.sleep?.bedTime, "Bed Time");
  // afternoon sleep is optional
  req(s.food?.type, "Food Type (Veg/Non-Veg)");
  req(s.food?.times?.breakfast, "Breakfast Time");
  req(s.food?.times?.lunch, "Lunch Time");
  req(s.food?.times?.afternoonSnacks, "Afternoon Snacks Time");
  req(s.food?.times?.dinner, "Dinner Time");
  req(s.height !== null && s.height !== undefined, "Height");
  req(s.weight !== null && s.weight !== undefined, "Weight");
  req(s.sportPerformance, "Sport Performance");
  req(s.hobby, "Hobby");
  req(s.karateLearningRemarks, "Remarks on Karate Learning");

  const t = form.teacher || {};
  req(t.punctual !== null && t.punctual !== undefined, "Is Teacher Punctual");
  req(t.attentionToEachStudent !== null && t.attentionToEachStudent !== undefined, "Teacher's Attention to Each Student");
  req(t.hardWorking !== null && t.hardWorking !== undefined, "Teacher's Hard Work in Teaching");
  req(t.goodTrainingAreas && t.goodTrainingAreas.length, "What Teacher Trains Well");
  req(t.honest !== null && t.honest !== undefined, "Is Teacher Honest");
  req(t.remarks, "Remarks About Teacher");

  const tr = form.training || {};
  req(tr.trainingNeeded && tr.trainingNeeded.length, "Which Training You Need");
  req(
    tr.studiedSportKarateBefore?.answer !== null && tr.studiedSportKarateBefore?.answer !== undefined,
    "Studied Sport Karate Before"
  );
  if (tr.studiedSportKarateBefore?.answer) {
    req(tr.studiedSportKarateBefore?.styleName, "Style Name (Sport Karate)");
    req(tr.studiedSportKarateBefore?.coachName, "Coach Name (Sport Karate)");
    req(tr.studiedSportKarateBefore?.yearsLearnt, "Years Learnt (Sport Karate)");
  }
  req(
    tr.newInTraditionalFullContact !== null && tr.newInTraditionalFullContact !== undefined,
    "New in Traditional Full Contact Karate"
  );
  req(tr.otherMartialArts?.answer !== null && tr.otherMartialArts?.answer !== undefined, "Any Other Martial Arts Practiced");
  if (tr.otherMartialArts?.answer) {
    req(tr.otherMartialArts?.styleName, "Style Name (Other Martial Arts)");
    req(tr.otherMartialArts?.coachName, "Coach Name (Other Martial Arts)");
    req(tr.otherMartialArts?.yearsLearnt, "Years Learnt (Other Martial Arts)");
  }
  req(
    tr.preferScientificEffectiveLesson !== null && tr.preferScientificEffectiveLesson !== undefined,
    "Prefer Scientific, Effective Lessons"
  );
  if (tr.preferScientificEffectiveLesson === false) req(tr.preferScientificSuggestion, "Suggestion (Scientific Lessons)");
  req(tr.preferOnlyFitness !== null && tr.preferOnlyFitness !== undefined, "Prefer Only a Fitness Programme");
  if (tr.preferOnlyFitness === true) req(tr.preferOnlyFitnessSuggestion, "Suggestion (Fitness Programme)");
  req(
    tr.onlyNeedBeltCertificate !== null && tr.onlyNeedBeltCertificate !== undefined,
    "Only Need Belt & Certificate"
  );
  if (tr.onlyNeedBeltCertificate === false) req(tr.onlyNeedBeltCertificateSuggestion, "Suggestion (Belt & Certificate)");
  req(tr.remarksAndSuggestion, "Remarks & Suggestion (Training)");

  req(form.filledByName, "Guardian's Name (Signature)");

  return missing;
}

exports.finalizeForm = async (req, res) => {
  try {
    const { learnerId, windowId } = req.params;
    const learner = await assertLearnerIsGuardians(req.guardian._id, learnerId);
    if (!learner) return res.status(404).json({ message: "Learner not found" });

    const { ok, reason } = await assertWindowOpenForLearner(windowId, learner);
    if (!ok) return res.status(400).json({ message: reason });

    const form = await EvaluationFormModel.findOne({ windowId, learnerId, isDeleted: false });
    if (!form) return res.status(404).json({ message: "No draft found to finalize. Save the form first." });

    if (form.status === "submitted") {
      const withinEdit = Date.now() - new Date(form.submittedAt).getTime() <= EDIT_WINDOW_MS;
      if (!withinEdit) {
        return res.status(403).json({ message: "Edit window (5 minutes after submission) has expired" });
      }
    }

    const missing = findMissingFields(form);
    if (missing.length) {
      return res.status(400).json({ message: "Form is incomplete", missingFields: missing });
    }

    form.status = "submitted";
    form.submittedAt = new Date();
    await form.save();

    return res.json({ success: true, message: "Form submitted", data: form });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Guardian's own submitted+draft forms
exports.getMyForms = async (req, res) => {
  try {
    const forms = await EvaluationFormModel.find({ guardianId: req.guardian._id, isDeleted: false }).sort({
      createdAt: -1,
    });
    return res.json({ success: true, count: forms.length, data: forms });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ===================== VIEW / DOWNLOAD (role-based) ===================== */

// Admin: all submitted forms (drafts are never visible to admin)
exports.getAllSubmittedForms = async (req, res) => {
  try {
    const forms = await EvaluationFormModel.find({ status: "submitted", isDeleted: false }).sort({
      submittedAt: -1,
    });
    return res.json({ success: true, count: forms.length, data: forms });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Instructor: only submitted forms for their own learners
exports.getMyInstructorForms = async (req, res) => {
  try {
    const forms = await EvaluationFormModel.find({
      instructorCode: req.instructor.instructorId,
      status: "submitted",
      isDeleted: false,
    }).sort({ submittedAt: -1 });
    return res.json({ success: true, count: forms.length, data: forms });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const fetchFormForRole = async (req) => {
  const { id } = req.params;
  const form = await EvaluationFormModel.findOne({ _id: id, isDeleted: false });
  if (!form) return { form: null, allowed: false };

  if (req.admin) return { form, allowed: form.status === "submitted" };
  if (req.instructor) {
    return { form, allowed: form.status === "submitted" && form.instructorCode === req.instructor.instructorId };
  }
  if (req.guardian) {
    return { form, allowed: String(form.guardianId) === String(req.guardian._id) };
  }
  return { form: null, allowed: false };
};

exports.getFormById = async (req, res) => {
  try {
    const { form, allowed } = await fetchFormForRole(req);
    if (!form || !allowed) return res.status(404).json({ message: "Form not found" });
    return res.json({ success: true, data: form });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.downloadFormPdf = async (req, res) => {
  try {
    const { form, allowed } = await fetchFormForRole(req);
    if (!form || !allowed) return res.status(404).json({ message: "Form not found" });

    const pdfBuffer = await generateEvaluationFormPdf(form);
    const filename = `evaluation-${form.student?.name || form._id}.pdf`;

    // Respond as JSON (base64), not raw application/pdf bytes. Download-manager
    // browser extensions (e.g. IDM) intercept responses by Content-Type/MIME
    // sniffing - a JSON response is invisible to that, so it always reaches our
    // own JS. The frontend rebuilds the real PDF blob client-side below.
    return res.json({ success: true, filename, base64: pdfBuffer.toString("base64") });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
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

// Validates that every mandatory field is filled before allowing finalization
function findMissingFields(form) {
  const missing = [];
  const req = (cond, label) => {
    if (!cond) missing.push(label);
  };
  const s = form.student || {};
  req(s.name, "student.name");
  req(s.age !== null && s.age !== undefined, "student.age");
  req(s.dob, "student.dob");
  req(s.currentRank, "student.currentRank");
  req(s.classOf, "student.classOf");
  req(s.board, "student.board");
  req(s.studyTime, "student.studyTime");
  req(s.karatePractice?.mode, "student.karatePractice");
  req(s.karateNotes?.mode, "student.karateNotes");
  req(s.otherArtsNames, "student.otherArtsNames");
  req(s.otherArtsPractice?.mode, "student.otherArtsPractice");
  req(s.physicalExerciseTime, "student.physicalExerciseTime");
  req(s.screenDevice?.used !== null && s.screenDevice?.used !== undefined, "student.screenDevice.used");
  if (s.screenDevice?.used) req(s.screenDevice?.mode, "student.screenDevice.mode");
  req(s.sleep?.totalDuration, "student.sleep.totalDuration");
  req(s.sleep?.bedTime, "student.sleep.bedTime");
  // student.sleep.afternoonSleep is optional
  req(s.food?.type, "student.food.type");
  req(s.food?.times?.breakfast, "student.food.times.breakfast");
  req(s.food?.times?.lunch, "student.food.times.lunch");
  req(s.food?.times?.afternoonSnacks, "student.food.times.afternoonSnacks");
  req(s.food?.times?.dinner, "student.food.times.dinner");
  req(s.height !== null && s.height !== undefined, "student.height");
  req(s.weight !== null && s.weight !== undefined, "student.weight");
  req(s.sportPerformance, "student.sportPerformance");
  req(s.hobby, "student.hobby");
  req(s.karateLearningRemarks, "student.karateLearningRemarks");

  const t = form.teacher || {};
  req(t.punctual !== null && t.punctual !== undefined, "teacher.punctual");
  req(t.attentionToEachStudent !== null && t.attentionToEachStudent !== undefined, "teacher.attentionToEachStudent");
  req(t.hardWorking !== null && t.hardWorking !== undefined, "teacher.hardWorking");
  req(t.goodTrainingAreas && t.goodTrainingAreas.length, "teacher.goodTrainingAreas");
  req(t.honest !== null && t.honest !== undefined, "teacher.honest");
  req(t.remarks, "teacher.remarks");

  const tr = form.training || {};
  req(tr.trainingNeeded && tr.trainingNeeded.length, "training.trainingNeeded");
  req(
    tr.studiedSportKarateBefore?.answer !== null && tr.studiedSportKarateBefore?.answer !== undefined,
    "training.studiedSportKarateBefore.answer"
  );
  if (tr.studiedSportKarateBefore?.answer) {
    req(tr.studiedSportKarateBefore?.styleName, "training.studiedSportKarateBefore.styleName");
    req(tr.studiedSportKarateBefore?.coachName, "training.studiedSportKarateBefore.coachName");
    req(tr.studiedSportKarateBefore?.yearsLearnt, "training.studiedSportKarateBefore.yearsLearnt");
  }
  req(
    tr.newInTraditionalFullContact !== null && tr.newInTraditionalFullContact !== undefined,
    "training.newInTraditionalFullContact"
  );
  req(tr.otherMartialArts?.answer !== null && tr.otherMartialArts?.answer !== undefined, "training.otherMartialArts.answer");
  if (tr.otherMartialArts?.answer) {
    req(tr.otherMartialArts?.styleName, "training.otherMartialArts.styleName");
    req(tr.otherMartialArts?.coachName, "training.otherMartialArts.coachName");
    req(tr.otherMartialArts?.yearsLearnt, "training.otherMartialArts.yearsLearnt");
  }
  req(
    tr.preferScientificEffectiveLesson !== null && tr.preferScientificEffectiveLesson !== undefined,
    "training.preferScientificEffectiveLesson"
  );
  if (tr.preferScientificEffectiveLesson === false) req(tr.preferScientificSuggestion, "training.preferScientificSuggestion");
  req(tr.preferOnlyFitness !== null && tr.preferOnlyFitness !== undefined, "training.preferOnlyFitness");
  if (tr.preferOnlyFitness === true) req(tr.preferOnlyFitnessSuggestion, "training.preferOnlyFitnessSuggestion");
  req(
    tr.onlyNeedBeltCertificate !== null && tr.onlyNeedBeltCertificate !== undefined,
    "training.onlyNeedBeltCertificate"
  );
  if (tr.onlyNeedBeltCertificate === false) req(tr.onlyNeedBeltCertificateSuggestion, "training.onlyNeedBeltCertificateSuggestion");
  req(tr.remarksAndSuggestion, "training.remarksAndSuggestion");

  req(form.filledByName, "filledByName");

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
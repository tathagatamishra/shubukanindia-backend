// controller/learnerCtrl.js
const LearnerModel = require("../model/learnerModel");
const DojoModel = require("../model/dojoModel");
const InstructorIDModel = require("../model/instructorIDModel");
const EvaluationWindowModel = require("../model/evaluationWindowModel");
const { sendEmail } = require("../util/sendEmail");
const { evaluationWindowEmailTemplate } = require("../util/emailTemplate");
const { resolveInstructorCode } = require("../util/instructorMatch");

// Guardian adds a learner by picking a dojo+instructor card and giving a name
exports.addLearner = async (req, res) => {
  try {
    const { name, dojoId, dojoName, instructorName, instructorCode } = req.body;
    if (!name || !dojoId || !dojoName || !instructorName) {
      return res.status(400).json({ message: "name, dojoId, dojoName and instructorName are required" });
    }

    const dojo = await DojoModel.findOne({ _id: dojoId, isDeleted: false });
    if (!dojo) return res.status(404).json({ message: "Dojo not found" });

    const instructorIdDocs = await InstructorIDModel.find({ isDeleted: false }).lean();

    // Trust a client-supplied code only if it's a real, currently valid instructor code
    // (the directory API already resolves this correctly, so this is just a fast path).
    let resolvedCode = null;
    if (instructorCode && instructorIdDocs.some((i) => i.instructorId === instructorCode)) {
      resolvedCode = instructorCode;
    } else {
      resolvedCode = resolveInstructorCode(instructorName, instructorIdDocs);
    }

    const learner = await LearnerModel.create({
      guardianId: req.guardian._id,
      name,
      dojoId,
      dojoName,
      instructorName,
      instructorCode: resolvedCode,
    });

    // If an active window already covers this instructor, notify the guardian right away
    // so the new learner's form is immediately fillable (per admin workflow).
    if (learner.instructorCode) {
      const now = new Date();
      const activeWindow = await EvaluationWindowModel.findOne({
        isDeleted: false,
        closedEarly: false,
        instructorCodes: learner.instructorCode,
        startDate: { $lte: now },
        endDate: { $gte: now },
      });

      if (activeWindow) {
        await sendEmail(
          req.guardian.email,
          `${activeWindow.title} is open for ${learner.name}`,
          evaluationWindowEmailTemplate({
            title: activeWindow.title,
            startDate: activeWindow.startDate,
            endDate: activeWindow.endDate,
          })
        );
      }
    }

    return res.status(201).json({ success: true, data: learner });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Guardian edits an existing learner's name or dojo+instructor. Only affects
// this learner's snapshot fields going forward (drafts read live learner data
// as a fallback); already-submitted forms keep their own frozen snapshot.
exports.updateLearner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dojoId, dojoName, instructorName, instructorCode } = req.body;
    if (!name || !dojoId || !dojoName || !instructorName) {
      return res.status(400).json({ message: "name, dojoId, dojoName and instructorName are required" });
    }

    const learner = await LearnerModel.findOne({ _id: id, guardianId: req.guardian._id, isDeleted: false });
    if (!learner) return res.status(404).json({ message: "Learner not found" });

    const dojo = await DojoModel.findOne({ _id: dojoId, isDeleted: false });
    if (!dojo) return res.status(404).json({ message: "Dojo not found" });

    const instructorIdDocs = await InstructorIDModel.find({ isDeleted: false }).lean();
    let resolvedCode = null;
    if (instructorCode && instructorIdDocs.some((i) => i.instructorId === instructorCode)) {
      resolvedCode = instructorCode;
    } else {
      resolvedCode = resolveInstructorCode(instructorName, instructorIdDocs);
    }

    learner.name = name;
    learner.dojoId = dojoId;
    learner.dojoName = dojoName;
    learner.instructorName = instructorName;
    learner.instructorCode = resolvedCode;
    await learner.save();

    return res.json({ success: true, data: learner });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyLearners = async (req, res) => {
  try {
    const learners = await LearnerModel.find({ guardianId: req.guardian._id, isDeleted: false }).sort({
      createdAt: -1,
    });
    return res.json({ success: true, count: learners.length, data: learners });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteLearner = async (req, res) => {
  try {
    const { id } = req.params;
    const learner = await LearnerModel.findOneAndUpdate(
      { _id: id, guardianId: req.guardian._id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!learner) return res.status(404).json({ message: "Learner not found" });
    return res.json({ success: true, message: "Learner removed" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

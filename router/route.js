// router/route.js
const express = require("express");
const router = express.Router();

const {
  createBlog,
  getBlogs,
  getBlogBySlug,
  getCloudBlogSignature,
  updateBlog,
  softDeleteBlog,
  permanentDeleteBlog,
  likeBlog,
  dislikeBlog,
  addComment,
  replyComment,
  getCommentsBySlug,
  getLikesBySlug,
  incrementBlogView,
  getBlogSlugs,
  verifyOTP,
  sendOTP,
} = require("../controller/blogCtrl");
const {
  createGallery,
  getGallery,
  updateGallery,
  softDeleteGallery,
  permanentDeleteGallery,
  getCloudGallerySignature,
  createGalleryWithUrl,
} = require("../controller/galleryCtrl");
const {
  generateInstructorId,
  verifyInstructorOtp,
  signupInstructor,
  loginInstructor,
  softDelInstruct,
  permaDelInstruct,
  getAllInstructors,
  getInstructorProfile,
  updateInstructorProfile,
  logoutInstructor,
  resendInstructorOtp,
  editInstructor,
  getPublicInstructors,
} = require("../controller/instructorCtrl");
const {
  signupStudent,
  loginStudent,
  resendStudentOtp,
  verifyStudentOtp,
  getStudentProfile,
  updateStudentProfile,
  deleteStudent, // Admin only
  getAllStudents, // Admin only
  getOutsideStudents, // Admin only
  getStudentsByInstructor, // Admin only
  searchAllStudentsByName, // Admin only
  searchMyStudents, // Instructor
  getMyStudents, // Instructor
  deleteMyStudent,
  adminUpdateStudent, // Instructor
} = require("../controller/studentCtrl");
const {
  getCloudKataSignature,
  createKataUpload,
  getMyKataUploads,
  updateKataUpload,
  deleteKataUpload,
  getInstructorKataSheet,
  getAdminKataSheet,
} = require("../controller/katasheetCtrl");
const {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getAllQuestions,
  getQnA,
  deleteAll,
} = require("../controller/questionCtrl");
const {
  createExam,
  createExamSet,
  updateExam,
  deleteExam,
  getUpcomingExams,
  startExam,
  startExamPublic,
  submitExamPublic,
  getAllExams,
  getInsUpcomingExams,
  getStuUpcomingExams,
  viewAnswerSheets,
} = require("../controller/examCtrl");
const {
  submitExam,
  getResultsByInstructor,
  getResultsByStudent,
  viewAnswerSheet,
  getQuestionPaper,
  getMyResults,
  getAllResults,
  getResultsSummary,
  getThisStudentResult,
} = require("../controller/resultCtrl");
const {
  createDojo,
  fetchAllDojo,
  updateDojo,
  deleteDojo,
  getCloudDojoSignature,
} = require("../controller/dojoCtrl");
const {
  createRegistration,
  getAllRegistrations,
  getRegistration,
  updateRegistration,
  deleteRegistration,
} = require("../controller/registrationCtrl");
// const {
//   createMarksheet,
//   getAMarksheet,
//   getMarksheetSignature,
//   deleteMarksheet,
// } = require("../controller/marksheetCtrl");
const {
  createAdmin,
  adminLogin,
  adminValidate,
  refreshTokenController,
  adminLogout,
} = require("../controller/adminCtrl");
const {
  signupGuardian,
  verifyGuardianOtp,
  resendGuardianOtp,
  loginGuardian,
  getGuardianProfile,
  updateGuardianProfile,
} = require("../controller/guardianCtrl");
const { getDojoInstructorDirectory } = require("../controller/directoryCtrl");
const { addLearner, getMyLearners, deleteLearner } = require("../controller/learnerCtrl");
const {
  createEvaluationWindow,
  getAllEvaluationWindows,
  closeEvaluationWindowEarly,
  getActiveWindowsForGuardian,
  saveDraftForm,
  finalizeForm,
  getMyForms,
  getAllSubmittedForms,
  getMyInstructorForms,
  getFormById,
  downloadFormPdf,
} = require("../controller/evaluationCtrl");
const { authMiddleware } = require("../middleware/authMiddleware");
const { emailAuth } = require("../middleware/emailAuth");
const { instructorAuth } = require("../middleware/instructorAuth");
const { studentAuth } = require("../middleware/studentAuth");
const { guardianAuth } = require("../middleware/guardianAuth");

// Admin APIs ---
router.post("/admin/login", adminLogin);
router.post("/admin/refresh", refreshTokenController);
router.post("/admin/logout", authMiddleware, adminLogout);
router.post("/admin/validate", authMiddleware, adminValidate);
// router.post("/admin/create", createAdmin); // one-time use

// Public Instructor APIs
router.get("/instructors", getPublicInstructors);
router.post("/instructor/login", loginInstructor);
router.post("/instructor/signup", signupInstructor);
router.post("/instructor/resend-otp", resendInstructorOtp);
router.post("/instructor/verify-otp", verifyInstructorOtp);
// Instructor APIs
router.post("/instructor/logout", instructorAuth, logoutInstructor);
router.get("/instructor/profile", instructorAuth, getInstructorProfile);
router.put("/instructor/profile", instructorAuth, updateInstructorProfile);
// Admin Instructor APIs
router.get("/admin/instructors", authMiddleware, getAllInstructors);
router.put("/admin/instructor/edit/:iid", authMiddleware, editInstructor);
router.post("/admin/instructor/generate", authMiddleware, generateInstructorId);
router.delete("/admin/instructor/soft/:iid", authMiddleware, softDelInstruct);
router.delete("/admin/instructor/perma/:iid", authMiddleware, permaDelInstruct);

// Student APIs
router.post("/student/login", loginStudent);
router.post("/student/signup", signupStudent);
router.post("/student/resend-otp", resendStudentOtp);
router.post("/student/verify-otp", verifyStudentOtp);
router.get("/student/profile", studentAuth, getStudentProfile);
router.put("/student/profile", studentAuth, updateStudentProfile);
// Instructor only see/manage their own students
router.get("/instructor/students", instructorAuth, getMyStudents);
router.delete("/instructor/student/:sid", instructorAuth, deleteMyStudent);
router.get("/instructor/student/search", instructorAuth, searchMyStudents);
// Admin Student APIs
router.get("/admin/students", authMiddleware, getAllStudents);
router.get("/admin/student/search", authMiddleware, searchAllStudentsByName);
router.get("/admin/student/:iid", authMiddleware, getStudentsByInstructor);
router.get("/admin/students/outside", authMiddleware, getOutsideStudents);
router.delete("/admin/student/:sid", authMiddleware, deleteStudent);
router.put("/admin/student/:sid", authMiddleware, adminUpdateStudent);

// Student APIs (studentAuth required)
router.post("/kata/signature", getCloudKataSignature)
router.post("/kata", studentAuth, createKataUpload); // body: { imageUrl, publicId?, caption? }
router.get("/kata", studentAuth, getMyKataUploads);
router.put("/kata/:id", studentAuth, updateKataUpload);
router.delete("/kata/:id", studentAuth, deleteKataUpload);
// Instructor
router.get("/instructor/:sid/kata", instructorAuth, getInstructorKataSheet);
// Admin
router.get("/admin/:sid/kata", authMiddleware, getAdminKataSheet);

// QUESTION routes
router.get("/admin/questions", authMiddleware, getAllQuestions);
router.get("/admin/qna", authMiddleware, getQnA);
router.post("/admin/question", authMiddleware, createQuestion); // admin create
router.put("/admin/question/:id", authMiddleware, updateQuestion); // admin update
router.delete("/admin/question/:id", authMiddleware, deleteQuestion); // admin delete
// router.delete("/admin/delete/all", authMiddleware, deleteAll); // admin delete
router.get("/instructor/answers", instructorAuth, viewAnswerSheets);
// EXAM routes
router.get("/admin/exams", authMiddleware, getAllExams);
router.post("/admin/exam", authMiddleware, createExam); // admin create exam
router.post("/admin/exam/:examID/set", authMiddleware, createExamSet); // admin create another set for examID
router.put("/admin/exam/:id", authMiddleware, updateExam); // admin edit upcoming exam
router.delete("/admin/exam/:id", authMiddleware, deleteExam); // admin delete upcoming exam
// fetch upcoming exams (public)
router.get("/exams/upcoming", getUpcomingExams);
// Upcoming exams for students
router.get("/student/exams/upcoming", studentAuth, getStuUpcomingExams);
// Upcoming exams for instructors
router.get("/instructor/exams/upcoming", instructorAuth, getInsUpcomingExams);

// public start (no auth)
router.post("/exam/start", startExamPublic);
router.post("/exam/:examId/submit", submitExamPublic);

// STUDENT routes to start and submit
router.post("/student/exam/start", studentAuth, startExam); // body: { examID, examSet, password? }
router.post("/student/exam/:examId/submit", studentAuth, submitExam);

router.get("/student/results", studentAuth, getMyResults);
// Admin view result
// router.get("/admin/results", authMiddleware, getAllResults);
router.get("/admin/results", authMiddleware, getAllResults);
router.get("/admin/results/summary", authMiddleware, getResultsSummary);

// INSTRUCTOR routes
// router.get("/instructor/results", instructorAuth, getResultsByInstructor); // optional ?date=YYYY-MM-DD
router.get("/instructor/results", instructorAuth, getThisStudentResult); // optional ?date=YYYY-MM-DD
router.get("/instructor/result/search", instructorAuth, getResultsByStudent); // ?name=...
router.get("/instructor/result/:resultId", instructorAuth, viewAnswerSheet);
router.get("/instructor/question-papers", instructorAuth, getQuestionPaper); // ?kyu=&fromDate=&toDate=

// Public Blog APIs
router.get("/blogs", getBlogs);
router.get("/slugs", getBlogSlugs);
router.get("/blog/:slug", getBlogBySlug);
router.post("/blog/:slug/view", incrementBlogView);
// Likes/Dislikes/Comments
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.get("/blog/like/:slug", getLikesBySlug);
router.post("/blog/like/:slug", emailAuth, likeBlog);
router.post("/blog/dislike/:slug", emailAuth, dislikeBlog);
router.get("/blog/comment/:slug", getCommentsBySlug);
router.post("/blog/comment/:slug", emailAuth, addComment);
router.post("/blog/comment/reply/:slug/:commentId", emailAuth, replyComment);

// Admin Blog APIs
router.post("/blog/signature", authMiddleware, getCloudBlogSignature);
router.post("/blog", authMiddleware, createBlog);
router.put("/blog/:id", authMiddleware, updateBlog);
router.delete("/blog/soft/:id", authMiddleware, softDeleteBlog);
router.delete("/blog/perma/:id", authMiddleware, permanentDeleteBlog);

// Gallery APIs ---
router.post("/gallery/signature", authMiddleware, getCloudGallerySignature);
router.post("/gallery", authMiddleware, createGalleryWithUrl);
router.put("/gallery/:id", authMiddleware, updateGallery);
router.get("/gallery", getGallery);
router.delete("/gallery/soft/:id", authMiddleware, softDeleteGallery);
router.delete("/gallery/perma/:id", authMiddleware, permanentDeleteGallery);

// Dojo APIs ---
router.post("/dojo/signature", authMiddleware, getCloudDojoSignature);
router.get("/dojo", fetchAllDojo);
router.post("/dojo", authMiddleware, createDojo);
router.put("/dojo/:id", authMiddleware, updateDojo);
router.delete("/dojo/:id", authMiddleware, deleteDojo);

// Marksheet APIs ---
// router.post("/marksheet/signature", authMiddleware, getMarksheetSignature);
// router.post("/marksheet", authMiddleware, createMarksheet);
// router.put("/marksheet", authMiddleware, createMarksheet);
// router.get("/marksheet", getAMarksheet);
// router.delete("/marksheet/:id", authMiddleware, deleteMarksheet);

// Registration APIs ---
router.route("/registration").post(createRegistration).get(getAllRegistrations);

router
  .route("/registration/:id")
  .get(getRegistration)
  .put(authMiddleware, updateRegistration)
  .delete(authMiddleware, deleteRegistration);

// Guardian auth APIs ---
router.post("/guardian/signup", signupGuardian);
router.post("/guardian/verify-otp", verifyGuardianOtp);
router.post("/guardian/resend-otp", resendGuardianOtp);
router.post("/guardian/login", loginGuardian);
router.get("/guardian/profile", guardianAuth, getGuardianProfile);
router.put("/guardian/profile", guardianAuth, updateGuardianProfile);
router.get("/guardian/dojo-instructor-directory", guardianAuth, getDojoInstructorDirectory);

// Learner APIs (guardian-owned) ---
router.post("/guardian/learner", guardianAuth, addLearner);
router.get("/guardian/learner", guardianAuth, getMyLearners);
router.delete("/guardian/learner/:id", guardianAuth, deleteLearner);

// Evaluation Window APIs (admin schedules the portal) ---
router.post("/admin/evaluation-window", authMiddleware, createEvaluationWindow);
router.get("/admin/evaluation-window", authMiddleware, getAllEvaluationWindows);
router.patch("/admin/evaluation-window/:id/close", authMiddleware, closeEvaluationWindowEarly);

// Guardian: fill the Evaluation Form ---
router.get("/guardian/evaluation-window/active", guardianAuth, getActiveWindowsForGuardian);
router.put("/guardian/evaluation-form/:learnerId/:windowId", guardianAuth, saveDraftForm);
router.post("/guardian/evaluation-form/:learnerId/:windowId/finalize", guardianAuth, finalizeForm);
router.get("/guardian/evaluation-form", guardianAuth, getMyForms);

// Evaluation Form viewing / downloading (role-based) ---
router.get("/admin/evaluation-form", authMiddleware, getAllSubmittedForms);
router.get("/admin/evaluation-form/:id", authMiddleware, getFormById);
router.get("/admin/evaluation-form/:id/pdf", authMiddleware, downloadFormPdf);

router.get("/instructor/evaluation-form", instructorAuth, getMyInstructorForms);
router.get("/instructor/evaluation-form/:id", instructorAuth, getFormById);
router.get("/instructor/evaluation-form/:id/pdf", instructorAuth, downloadFormPdf);

router.get("/guardian/evaluation-form/:id", guardianAuth, getFormById);
router.get("/guardian/evaluation-form/:id/pdf", guardianAuth, downloadFormPdf);

// Debug API
router.get("/debug", (_, res) => {
  let data = "😍 V3";
  return res.send({ data: data });
});

module.exports = router;

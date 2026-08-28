// util/evaluationFormLabels.js
// English question/section text for the generated Guardian Evaluation Form
// PDF. Mirrors components/GuardianEvaluationForm/i18n/labels.js on the
// frontend. English-only by design — the site offers a "Translate" button
// (Google Translate) wherever a guardian reads this content in the app, so a
// hardcoded second language isn't maintained here or baked into the PDF.

const L = {
  formTitle: "Guardian Evaluation Marksheet",
  studentSectionTitle: "For Students",
  yesNoInstruction: "If there is yes or no, please choose the option.",

  studentName: "Student Name",
  age: "Age",
  dob: "Date of Birth",
  currentRank: "Student's Current Rank",
  instructor: "Instructor",
  dojo: "Dojo",

  classOf: "1i. Class",
  board: "1ii. Board",
  q2: "2. Study Time (School + Self-study + Tuition)",
  q3: "3. Karate Practice time (Self-study)",
  q4: "4. Karate notes/theory studies",
  q5: "5. Other Arts Practice (names)",
  q6: "6. Physical exercise time",
  q7: "7. Using any screen device (TV, mobile etc.)",

  q8: "8. Sleep duration (total time)",
  bedTime: "Bed time",
  afternoonSleep: "Afternoon sleep",
  q9: "9. Food",
  q10: "10. Approx time of food intake",
  breakfast: "Breakfast",
  lunch: "Lunch",
  afternoonSnacks: "Afternoon snacks",
  dinner: "Dinner",
  q11: "11. Other tiffin time",
  remarksIfAny: "Remarks if any",

  q12height: "12. Height (cm)",
  q12weight: "Weight (kg)",
  q13: "13. Sport Performance",
  q14: "14. Hobby",
  hobbyRemarks: "Remarks",
  q15: "15. Remarks on karate learning (write in short)",

  teacherSectionTitle: "For the Teacher",
  t1: "1. Punctual",
  t2: "2. Provides attention to each student",
  t3: "3. Hard working in teaching",
  t4: "4. What he/she trains well",
  t5: "5. Is your teacher an honest person in teaching",
  t6: "6. Remarks about teacher",

  trainingSectionTitle: "About Training",
  tr1: "1. Which training you need",
  tr2i: "2i. Have you studied sport karate before",
  styleName: "Style Name",
  coachName: "Name of the Coach",
  yearsLearnt: "Years learnt",
  tr2ii: "2ii. New in Traditional Full Contact Karate",
  tr2iii: "2iii. Any other martial arts practiced",
  tr3: "3. You prefer scientific, effective lessons",
  suggestIfNo: "If no, please suggest",
  tr4: "4. Do you prefer only a fitness programme (not effective karate)",
  suggestIfYes: "If yes, please suggest what type of training you want",
  tr5: "5. You only need belt and certificate for your student",
  tr6: "6. Remarks and suggestion",

  guardianSignature: "Signature of Guardian",
  filledByName: "This form is filled by (Guardian's Name)",
  date: "Date",
  yes: "Yes",
  no: "No",
};

module.exports = { L };

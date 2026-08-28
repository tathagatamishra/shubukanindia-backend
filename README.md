# shubukanindia-backend

---

## Guardian Evaluation Form — PDF generation workflow

The evaluation form is never stored as a PDF — it lives in Mongo as plain
structured data (`model/evaluationFormModel.js`) and the PDF is generated
on-the-fly, on every request, from whatever that document currently holds.

**Generation** (`util/evaluationPdf.js`)
- Built with `pdfkit`. Content flows continuously top-to-bottom — a new page
  is only started once the current one actually runs out of room
  (`ensureSpace()`, which pre-measures each field's height with pdfkit's
  `heightOfString`/`widthOfString` before drawing it). This replaced an
  earlier version that always emitted a fixed 7 pages regardless of content,
  most of them mostly empty; a fully-filled form now runs ~4 pages. Since the
  final page count isn't known until everything has flowed, the small corner
  logo and the "Filled by / Page X of Y" footer are added in a second pass
  over every buffered page (`doc.bufferedPageRange()` + `switchToPage()`,
  requires `bufferPages: true`) right before `doc.end()` — see
  `finalizePages()`.
- English only (`util/evaluationFormLabels.js`) — no hardcoded second
  language baked into the PDF. Wherever a guardian reads this content on the
  site instead (see "View" below), the page's own "Translate" (Google
  Translate) button covers other languages on real, selectable text — which
  a rendered PDF can't offer, an earlier bilingual-PDF version was replaced
  because of that.
- Fixed-choice questions (yes/no, single-select like Sport Performance, and
  multi-select like Training Areas Trained Well / Training Needed) are drawn
  as a checkbox list — every possible option is shown, with the guardian's
  choice(s) checked (`optionsField()`/vector-drawn `drawCheckbox()`, not a
  Unicode checkbox glyph, since Helvetica/WinAnsi doesn't reliably have one).
  Options wrap left-to-right into as many rows as needed. Free-text and
  identity-ish fields (name, age, DOB, current rank, remarks, ...) stay plain
  text via `field()`.
- The Shubukan India logo (`assets/images/shubukanIndia-black.png`, copied
  from the frontend's `public/assets/`) appears large on the title page —
  with a deliberate gap (`doc.moveDown(5.2)`) before the title text below it
  — and small in the top-right corner of every later page. Each major
  section heading (`sectionHeading()`) also carries extra space below it
  before its first question, so sections read as visually distinct blocks.
- Exported as `generateEvaluationFormPdf(form)`, returning a raw `Buffer` —
  called fresh on every download request, not cached.

**Delivery** (`controller/evaluationCtrl.js` → `downloadFormPdf`)
- One shared handler serves all three roles:
  `GET /admin/evaluation-form/:id/pdf`, `/instructor/evaluation-form/:id/pdf`,
  `/guardian/evaluation-form/:id/pdf` (role-specific auth middleware, then
  `fetchFormForRole()` checks ownership: admin/instructor only ever see
  `status: "submitted"` forms — instructor further scoped to their own
  `instructorCode` — guardian can fetch their own form in any status).
- The response is JSON — `{ success, filename, base64 }` — **not** a raw
  `application/pdf` byte stream. This is deliberate: some browser
  download-manager extensions (e.g. IDM) intercept responses by sniffing
  Content-Type/MIME, which would hijack the request before our own frontend
  JS ever saw it. A JSON envelope is invisible to that, so it always reaches
  `components/GuardianEvaluation/UI/downloadPdf.js`, which decodes the
  base64 back into a real PDF `Blob` client-side.

**Frontend consumption** (`components/GuardianEvaluation/UI/downloadPdf.js`)
- `downloadFormPdfByRole(role, formId, headers, filename)` — decodes the
  blob and triggers a normal file download. This is the *only* place a
  guardian ever gets the actual PDF now.
- `getFormPdfBlobUrl(role, formId, headers)` — decodes the blob and returns
  an in-page `blob:` URL for embedding via `PdfViewerModal` (wraps the
  shared `react-pdf`-based `components/UIComponent/PdfViewer.jsx` inside a
  wide variant of the GEF `Modal`, `.gef-modal--wide` in `gef-theme.css`).
  Still used by `AdminSubmissions.jsx`/`InstructorSubmissions.jsx`'s "View".
  **Not** used by the guardian-facing "View" buttons (`ActiveWindowList.jsx`,
  `MySubmissions.jsx`) any more — see next.

**Guardian "View" shows the live form, not the PDF, on purpose**
- `ActiveWindowList.jsx` and `MySubmissions.jsx`'s "View" (for an already-
  submitted form) now just navigates to the same
  `/guardian-evaluation/form/[learnerId]/[windowId]` route "Edit"/"Continue"
  already use — no PDF fetch involved.
- `FullForm.jsx` decides for itself whether that route is editable or
  read-only: `readOnly = status === "submitted" && past the 5-minute edit
  window` (same `EDIT_WINDOW_MS` the backend enforces). When `readOnly`, the
  entire field area is wrapped in a single `<fieldset disabled>` — HTML's
  native disabled-cascade reaches every input/select/textarea/button inside
  without touching ~50 individual field call sites — and the Save/Submit
  bar is hidden. `.gef-fieldset-reset` in `gef-theme.css` strips the
  browser's default fieldset border/padding and un-dims the disabled
  controls, so it reads as a faithful, non-interactive copy of what was
  submitted rather than a grayed-out form.
- Loading that route no longer depends on the evaluation window still being
  open (`getMyForms`/`getMyLearners` instead of
  `/guardian/evaluation-window/active`) — the old version only checked
  currently-active windows, so viewing an old submission after its window
  had since closed (the common case) would fail with "window not open" even
  though viewing needs no write permission at all. Any actual write (draft
  save / finalize) is still fully guarded server-side regardless.
- Why: a PDF is opaque to the site's Translate button — this makes the
  submitted content real, selectable, translatable text again, while the
  PDF itself (via Download) is unchanged for guardians who want the actual
  file.

---

## Error: 

Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you're trying to access the database from an IP that isn't whitelisted. Make sure your current IP address is on your Atlas cluster's IP whitelist: https://www.mongodb.com/docs/atlas/security-whitelist/


---

db.registrations.dropIndex("email_1")

---

The best example of "How to perform arithmetic operations on Data datatype" :

```
// get a new date
const newDate = new Date();

// date stored in database in string format
const stringDate = "2026-01-11T07:12:54.242Z";

// convert to Date datatype
const realDate = new Date(stringDate);

// getTime() only apply to Date datatype
const time = realDate.getTime();

const minutes = 15;

// perform arithmetic operations on time
const finalTime = time + minutes * 60 * 1000;

// convert to Date datatype
const finalDate = new Date(finalTime);

console.log(finalDate);
```
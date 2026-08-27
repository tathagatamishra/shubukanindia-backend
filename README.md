# shubukanindia-backend

---

## Guardian Evaluation Form — PDF generation workflow

The evaluation form is never stored as a PDF — it lives in Mongo as plain
structured data (`model/evaluationFormModel.js`) and the PDF is generated
on-the-fly, on every request, from whatever that document currently holds.

**Generation** (`util/evaluationPdf.js`)
- Built with `pdfkit`, drawn page-by-page to mirror the original 7-page
  "Guardian Evaluation Marksheet" layout exactly.
- Every field prints its English label, then the Bengali translation on the
  next line (`util/evaluationFormLabels.js`). Bengali is rendered with a
  bundled Noto Sans Bengali font (`assets/fonts/NotoSansBengali-Regular.ttf`);
  since pdfkit has no HarfBuzz shaping, `drawBengaliLine()` catches any
  conjunct sequence that fails to draw and just skips that one line instead
  of disabling Bengali for the whole document.
- Exported as `generateEvaluationFormPdf(form)`, returning a raw `Buffer` —
  called fresh on every download/view request, not cached.

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
  blob and triggers a normal file download.
- `getFormPdfBlobUrl(role, formId, headers)` — decodes the blob and returns
  an in-page `blob:` URL for embedding. Every "View" button across the
  Guardian/Admin/Instructor submissions lists uses this — none open the PDF
  in a new tab — feeding the URL into `PdfViewerModal`, which wraps the
  shared `react-pdf`-based `components/UIComponent/PdfViewer.jsx` inside a
  wide variant of the GEF `Modal` (`wide` prop → `.gef-modal--wide` in
  `gef-theme.css`, since the default 460px form-modal width is too cramped
  to read a dense A4 page). The caller owns the blob URL and must
  `URL.revokeObjectURL()` it once done (on modal close) to avoid leaking
  memory.

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
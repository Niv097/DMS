# DMS — Frontend Project

A complete frontend for the Document Management System & Approval Platform.

---

## Project Structure

```
easyapproval/
│
├── index.html          ← Dashboard (All Notes)
├── submit.html         ← Submit Note (full form with recommenders, approver, uploads)
├── submit-memo.html    ← Submit Memo (simplified)
├── review.html         ← Recommender / Approver review action page
├── note-detail.html    ← Full note detail with audit log & doc preview
├── help.html           ← Help & user guide
│
├── css/
│   └── style.css       ← All styles (IBM Plex Sans, CSS variables, layout)
│
├── js/
│   └── app.js          ← All JS: search, add/remove recommenders, file handling
│
└── assets/
    └── nav.html        ← Shared nav snippet (reference only)
```

---

## Pages

| Page | File | Description |
|------|------|-------------|
| Dashboard | index.html | All notes table with filters, status badges, stat cards |
| Submit Note | submit.html | Full 5-step form: details → recommenders → approver → attachments → submit |
| Submit Memo | submit-memo.html | Simplified memo form |
| Review | review.html | Recommender/Approver action: comment, recommend, or return |
| Note Detail | note-detail.html | Full detail: referrer, recommenders, approver, attachments, audit log, doc preview |
| Help | help.html | Workflow guide, note types, FAQ |

---

## Workflow (from flowchart)

```
START
  ↓
Create Note
  ↓
Select Recommenders (multiple — Stage 1, 2, 3…N)
  ↓
Select Approver
  ↓
Submit
  ↓
Stage 1 — Check by Recommender 1
  ├── Changes needed? YES → Return to Uploader
  └── NO ↓
Stage 2 — Check by Recommender 2
  ├── YES → Return to Uploader / Recommender 1
  └── NO ↓
Stage N — ... (repeats)
  ↓
Submitted to Approver
  ├── YES → Return to Uploader / Recommenders
  └── NO ↓
APPROVED ✅
```

---

## How to Run

Just open `index.html` in any browser. No build step needed.

For live-reload dev:
```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## Tech Stack

- Pure HTML5 / CSS3 / Vanilla JS
- Google Fonts: IBM Plex Sans + IBM Plex Mono
- No frameworks, no dependencies
- Responsive (works on tablet/mobile)

---

## Key Features Implemented

- [x] Dashboard with stats cards + filterable notes table
- [x] Submit Note form with multi-recommender (add/remove/reorder)
- [x] Single approver selection
- [x] Note for Information type (disables approval chain)
- [x] File upload with drag-and-drop (Main Note + Annexures)
- [x] Review page with comment history + recommend/return actions
- [x] Return modal with "return to" selection
- [x] Note Detail with full audit log
- [x] Split-screen document preview
- [x] Audit Log with timestamped entries
- [x] Status badges (Approved, Pending, Returned, Rejected)
- [x] Breadcrumb navigation
- [x] Sidebar with pending count badges

---

## To Connect to a Real Backend

Replace the mock data in `js/app.js` with API calls:

```js
// Example: fetch notes
const notes = await fetch('/api/notes').then(r => r.json());

// Example: submit note
await fetch('/api/notes', {
  method: 'POST',
  body: JSON.stringify({ subject, recommenders, approver, ... })
});
```

---

Copyright © DMS — IT-Software Factory


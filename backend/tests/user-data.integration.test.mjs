import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { startBackend } from "./helpers/server.mjs";
import { register, registerAndLogin } from "./helpers/auth.mjs";

const prisma = new PrismaClient();

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".fixtures",
  "user-data"
);

const USER_FILES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
  "user-files"
);

async function ensureImage() {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const file = path.join(FIXTURES_DIR, "tiny.png");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
       <rect width="16" height="16" fill="#336699"/>
     </svg>`
  );
  await sharp(svg).png().toFile(file);
  return file;
}

function json(method, token, body) {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

async function fileExists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

// Upload a blob to an existing user-file record (multipart field "file").
function fileForm(token, bytes, filename, type = "application/pdf") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), filename);
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  };
}

async function pollStatus(baseUrl, token, jobId) {
  const deadline = Date.now() + 60000;
  let status = null;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/api/media/jobs/${jobId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) return { httpStatus: res.status };
    status = await res.json();
    if (status.status !== "processing") return status;
    await new Promise((r) => setTimeout(r, 300));
  }
  return status;
}

describe("Account-scoped user data APIs", () => {
  let server;
  const createdUsers = [];

  before(async () => {
    server = await startBackend();
  });

  after(async () => {
    if (server) await server.stop();
    for (const id of createdUsers) {
      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        /* already gone */
      }
    }
    await prisma.$disconnect().catch(() => {});
    await rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  async function newUser(role) {
    const user = await register(server.baseUrl, role);
    createdUsers.push(user.id);
    return user;
  }

  // ------------------------------------------------------------------
  // Authentication gate (401) for every new endpoint
  // ------------------------------------------------------------------
  it("requires authentication on every account-scoped endpoint", async () => {
    const anonCases = [
      ["GET", "/api/tasks"],
      ["POST", "/api/tasks"],
      ["PATCH", "/api/tasks/x"],
      ["DELETE", "/api/tasks/x"],
      ["GET", "/api/exams"],
      ["POST", "/api/exams"],
      ["GET", "/api/flashcards"],
      ["POST", "/api/flashcards"],
      ["GET", "/api/notes"],
      ["POST", "/api/notes"],
      ["GET", "/api/user-files"],
      ["POST", "/api/user-files"],
      ["POST", "/api/user-files/x/upload"],
      ["GET", "/api/user-files/x/download"],
      ["GET", "/api/pomodoro/me/stats"],
      ["POST", "/api/pomodoro/me/stats"],
      ["POST", "/api/pomodoro/me/stats/merge"],
      ["GET", "/api/adhkar/progress/2026-01-01"],
      ["PUT", "/api/adhkar/progress/2026-01-01"],
      ["GET", "/api/preferences"],
      ["PATCH", "/api/preferences"],
      ["GET", "/api/media/jobs/whatever/status"],
      ["POST", "/api/media/image/resize"],
    ];
    for (const [method, url] of anonCases) {
      const res = await fetch(`${server.baseUrl}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(res.status, 401, `${method} ${url} must require auth`);
    }
  });

  // ------------------------------------------------------------------
  // Tasks
  // ------------------------------------------------------------------
  it("tasks: CRUD lifecycle + validation + ownership isolation", async () => {
    const a = await newUser("task-a");
    const b = await newUser("task-b");

    // Validation: empty title
    const bad = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("POST", a.accessToken, { title: "   " })
    );
    assert.equal(bad.status, 400);

    // Mass-assignment: a forged userId is ignored (zod strips unknown keys).
    const created = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("POST", a.accessToken, {
        title: "مراجعة الفيزياء",
        userId: b.id,
        priority: "high",
        dueDate: "2026-09-20",
      })
    );
    assert.equal(created.status, 201);
    const { task } = await created.json();
    assert.equal(task.title, "مراجعة الفيزياء");
    assert.equal(task.priority, "high");

    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(stored.userId, a.id, "userId always comes from the session");

    // List is owned + newest first
    const listA = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("GET", a.accessToken)
    );
    const { tasks: tasksA } = await listA.json();
    assert.ok(tasksA.some((t) => t.id === task.id));
    assert.equal(typeof task.createdAt, "number", "createdAt is epoch-ms");

    // B neither sees nor can touch A's task
    const listB = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("GET", b.accessToken)
    );
    const { tasks: tasksB } = await listB.json();
    assert.ok(!tasksB.some((t) => t.id === task.id));

    const patchB = await fetch(
      `${server.baseUrl}/api/tasks/${task.id}`,
      json("PATCH", b.accessToken, { title: "اختراق" })
    );
    assert.equal(patchB.status, 404, "foreign update must be 404");

    const deleteB = await fetch(
      `${server.baseUrl}/api/tasks/${task.id}`,
      json("DELETE", b.accessToken)
    );
    assert.equal(deleteB.status, 404, "foreign delete must be 404");

    // Owner updates
    const patchA = await fetch(
      `${server.baseUrl}/api/tasks/${task.id}`,
      json("PATCH", a.accessToken, { completed: true })
    );
    assert.equal(patchA.status, 200);
    assert.equal((await patchA.json()).task.completed, true);

    // Empty update is rejected
    const empty = await fetch(
      `${server.baseUrl}/api/tasks/${task.id}`,
      json("PATCH", a.accessToken, {})
    );
    assert.equal(empty.status, 400);

    // Owner deletes; then id is gone everywhere
    const del = await fetch(
      `${server.baseUrl}/api/tasks/${task.id}`,
      json("DELETE", a.accessToken)
    );
    assert.equal(del.status, 200);
    assert.equal(await prisma.task.findUnique({ where: { id: task.id } }), null);
  });

  // ------------------------------------------------------------------
  // ClientId idempotency (guest → account migration safety)
  // ------------------------------------------------------------------
  it("clientId: duplicate create returns the same row (migration retries dedupe)", async () => {
    const a = await newUser("idem-a");

    const payload = {
      title: "ترحيل المهمة",
      description: "من وضع الضيف",
      priority: "high",
      clientId: "local-task-1",
    };
    const r1 = await fetch(`${server.baseUrl}/api/tasks`, json("POST", a.accessToken, payload));
    const r2 = await fetch(`${server.baseUrl}/api/tasks`, json("POST", a.accessToken, payload));
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);

    const t1 = (await r1.json()).task;
    const t2 = (await r2.json()).task;
    assert.equal(t1.id, t2.id, "same clientId must map to the same row");

    const rows = await prisma.task.count({
      where: { userId: a.id, clientId: "local-task-1" },
    });
    assert.equal(rows, 1, "exactly one row exists after duplicate create");

    // A different record using a *different* clientId creates a new row.
    const r3 = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("POST", a.accessToken, { title: "ثاني", clientId: "local-task-2" })
    );
    assert.equal(r3.status, 201);
    assert.notEqual((await r3.json()).task.id, t1.id);
  });

  it("clientId: scoping is per-user (same id under two accounts never collides)", async () => {
    const a = await newUser("idem-b");
    const b = await newUser("idem-c");
    const payload = { title: "فردية", clientId: "shared-local-id" };

    const ra = await fetch(`${server.baseUrl}/api/tasks`, json("POST", a.accessToken, payload));
    const rb = await fetch(`${server.baseUrl}/api/tasks`, json("POST", b.accessToken, payload));
    assert.equal(ra.status, 201);
    assert.equal(rb.status, 201);
    const ta = (await ra.json()).task;
    const tb = (await rb.json()).task;
    assert.notEqual(ta.id, tb.id);
    assert.ok(await prisma.task.findUnique({ where: { id: ta.id } }));
  });

  it("clientId: wired into exams, flashcards, notes and user files too", async () => {
    const a = await newUser("idem-d");

    const cases = [
      {
        url: "/api/exams",
        body: { name: "اختبار", date: "2026-12-01", color: "#123456", clientId: "x1" },
        pick: (j) => j.exam,
      },
      {
        url: "/api/flashcards",
        body: { front: "س", back: "ج", deck: "حزمة", clientId: "x2" },
        pick: (j) => j.flashcard,
      },
      {
        url: "/api/notes",
        body: { title: "ملاحظة", content: "نص", clientId: "x3" },
        pick: (j) => j.note,
      },
      {
        url: "/api/user-files",
        body: { name: "ملف.pdf", type: "application/pdf", size: 100, clientId: "x4" },
        pick: (j) => j.file,
      },
    ];

    for (const { url, body, pick } of cases) {
      const r1 = await fetch(`${server.baseUrl}${url}`, json("POST", a.accessToken, body));
      assert.equal(r1.status, 201, `first ${url} create`);
      const r2 = await fetch(`${server.baseUrl}${url}`, json("POST", a.accessToken, body));
      assert.equal(r2.status, 201, `duplicate ${url} create`);
      const id1 = pick(await r1.json()).id;
      const id2 = pick(await r2.json()).id;
      assert.equal(id1, id2, `${url} must be idempotent by clientId`);
    }

    // Over-length / blank clientIds are rejected outright.
    const badLong = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("POST", a.accessToken, { title: "س", clientId: "x".repeat(65) })
    );
    assert.equal(badLong.status, 400);
    const badBlank = await fetch(
      `${server.baseUrl}/api/tasks`,
      json("POST", a.accessToken, { title: "س", clientId: "   " })
    );
    assert.equal(badBlank.status, 400);
  });

  // ------------------------------------------------------------------
  // Exams
  // ------------------------------------------------------------------
  it("exams: CRUD + ownership isolation + date validation", async () => {
    const a = await newUser("exam-a");
    const b = await newUser("exam-b");

    const badDate = await fetch(
      `${server.baseUrl}/api/exams`,
      json("POST", a.accessToken, { name: "اختبار", date: "20-09-2026", color: "#fff" })
    );
    assert.equal(badDate.status, 400, "non-YYYY-MM-DD date rejected");

    const created = await fetch(
      `${server.baseUrl}/api/exams`,
      json("POST", a.accessToken, { name: "اختبار الفيزياء", date: "2026-11-15", color: "#ff5555" })
    );
    assert.equal(created.status, 201);
    const { exam } = await created.json();
    assert.equal(exam.date, "2026-11-15");
    assert.equal(exam.color, "#ff5555");

    const patchB = await fetch(
      `${server.baseUrl}/api/exams/${exam.id}`,
      json("PATCH", b.accessToken, { name: "سوء استخدام" })
    );
    assert.equal(patchB.status, 404);

    const patchA = await fetch(
      `${server.baseUrl}/api/exams/${exam.id}`,
      json("PATCH", a.accessToken, { color: "#00aa00" })
    );
    assert.equal(patchA.status, 200);
    assert.equal((await patchA.json()).exam.color, "#00aa00");

    const del = await fetch(
      `${server.baseUrl}/api/exams/${exam.id}`,
      json("DELETE", a.accessToken)
    );
    assert.equal(del.status, 200);
  });

  // ------------------------------------------------------------------
  // Flashcards
  // ------------------------------------------------------------------
  it("flashcards: CRUD + type filter + nextReview ms serialisation", async () => {
    const a = await newUser("fc-a");

    const created = await fetch(
      `${server.baseUrl}/api/flashcards`,
      json("POST", a.accessToken, {
        front: "كيف؟",
        back: "هكذا",
        deck: "كيمياء",
        type: "medical",
        difficulty: "hard",
        nextReview: Date.now() + 86_400_000,
      })
    );
    assert.equal(created.status, 201);
    const { flashcard } = await created.json();
    assert.equal(flashcard.type, "medical");
    assert.equal(flashcard.difficulty, "hard");
    assert.equal(typeof flashcard.nextReview, "number");
    assert.equal(typeof flashcard.updatedAt, "number");

    // type filter works
    const general = {
      method: "GET",
      headers: { Authorization: `Bearer ${a.accessToken}` },
    };
    const { flashcards: all } = await (await fetch(
      `${server.baseUrl}/api/flashcards`,
      general
    )).json();
    assert.ok(all.some((f) => f.id === flashcard.id && f.type === "medical"));

    const medicalOnly = await fetch(
      `${server.baseUrl}/api/flashcards?type=medical`,
      { headers: { Authorization: `Bearer ${a.accessToken}` } }
    );
    const { flashcards: meds } = await medicalOnly.json();
    assert.ok(meds.every((f) => f.type === "medical"));
    assert.ok(meds.some((f) => f.id === flashcard.id));

    const badFilter = await fetch(
      `${server.baseUrl}/api/flashcards?type=bogus`,
      { headers: { Authorization: `Bearer ${a.accessToken}` } }
    );
    assert.equal(badFilter.status, 400);

    // nextReview: null/0 clears scheduling
    const patch = await fetch(
      `${server.baseUrl}/api/flashcards/${flashcard.id}`,
      json("PATCH", a.accessToken, { nextReview: 0 })
    );
    assert.equal(patch.status, 200);
    assert.equal((await patch.json()).flashcard.nextReview, 0);
  });

  it("flashcards: ownership isolation", async () => {
    const a = await newUser("fc-b");
    const b = await newUser("fc-c");
    const created = await fetch(
      `${server.baseUrl}/api/flashcards`,
      json("POST", a.accessToken, { front: "سؤال", back: "جواب", deck: "د" })
    );
    assert.equal(created.status, 201);
    const { flashcard } = await created.json();

    const del = await fetch(
      `${server.baseUrl}/api/flashcards/${flashcard.id}`,
      json("DELETE", b.accessToken)
    );
    assert.equal(del.status, 404);
    assert.ok(await prisma.flashcard.findUnique({ where: { id: flashcard.id } }));
  });

  // ------------------------------------------------------------------
  // Notes (general + medical)
  // ------------------------------------------------------------------
  it("notes: general + medical via type filter, medical requires category", async () => {
    const a = await newUser("note-a");

    // Medical note without category is rejected
    const noCat = await fetch(
      `${server.baseUrl}/api/notes`,
      json("POST", a.accessToken, { title: "طبي", content: "بدون فئة", type: "medical" })
    );
    assert.equal(noCat.status, 400);

    const medical = await fetch(
      `${server.baseUrl}/api/notes`,
      json("POST", a.accessToken, { title: "ملاحظة مؤتمر", content: "نص", type: "medical", category: "فارما" })
    );
    assert.equal(medical.status, 201);
    const medNote = (await medical.json()).note;
    assert.equal(medNote.type, "medical");
    assert.equal(medNote.category, "فارما");

    const general = await fetch(
      `${server.baseUrl}/api/notes`,
      json("POST", a.accessToken, { title: "فكرة", content: "سطر", pinned: true })
    );
    assert.equal(general.status, 201);
    const genNote = (await general.json()).note;
    assert.equal(genNote.type, "general");

    const filter = await fetch(`${server.baseUrl}/api/notes?type=general`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    const { notes } = await filter.json();
    assert.ok(notes.some((n) => n.id === genNote.id));
    assert.ok(!notes.some((n) => n.id === medNote.id), "medical excluded from general filter");

    const medFilter = await fetch(`${server.baseUrl}/api/notes?type=medical`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    const { notes: meds } = await medFilter.json();
    assert.ok(meds.some((n) => n.id === medNote.id));
  });

  it("notes: ownership isolation for delete", async () => {
    const a = await newUser("note-b");
    const b = await newUser("note-c");
    const created = await fetch(
      `${server.baseUrl}/api/notes`,
      json("POST", a.accessToken, { title: "سرية", content: "خاص" })
    );
    const { note } = await created.json();
    const del = await fetch(
      `${server.baseUrl}/api/notes/${note.id}`,
      json("DELETE", b.accessToken)
    );
    assert.equal(del.status, 404);
  });

  // ------------------------------------------------------------------
  // User files (metadata only)
  // ------------------------------------------------------------------
  it("user files: metadata CRUD + server-generated storageKey + isolation", async () => {
    const a = await newUser("file-a");
    const b = await newUser("file-b");

    const bad = await fetch(
      `${server.baseUrl}/api/user-files`,
      json("POST", a.accessToken, { name: "", type: "image/png", size: 100 })
    );
    assert.equal(bad.status, 400);

    const created = await fetch(
      `${server.baseUrl}/api/user-files`,
      json("POST", a.accessToken, {
        name: "مخطط.pdf",
        type: "application/pdf",
        size: 2048,
        toolUsed: "convert",
      })
    );
    assert.equal(created.status, 201);
    const { file } = await created.json();
    assert.equal(file.name, "مخطط.pdf");
    assert.equal(file.type, "application/pdf");
    assert.equal(file.toolUsed, "convert");

    const stored = await prisma.userFile.findUnique({ where: { id: file.id } });
    assert.equal(stored.storageKey.length > 0, true, "storageKey generated server-side");
    assert.equal(stored.userId, a.id);

    // No public/storageKey leak in the response.
    assert.equal(file.storageKey, undefined);

    const list = await fetch(`${server.baseUrl}/api/user-files`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    const { files } = await list.json();
    assert.ok(files.some((f) => f.id === file.id));

    const delB = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}`,
      json("DELETE", b.accessToken)
    );
    assert.equal(delB.status, 404);

    const del = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}`,
      json("DELETE", a.accessToken)
    );
    assert.equal(del.status, 200);
  });

  // ------------------------------------------------------------------
  // User files — byte upload / cross-device download (Phase 3.1)
  // ------------------------------------------------------------------
  it("user files: byte upload → download roundtrip preserves exact bytes", async () => {
    const a = await newUser("blob-a");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

    const created = await fetch(
      `${server.baseUrl}/api/user-files`,
      json("POST", a.accessToken, { name: "مخطط.pdf", type: "application/pdf", size: bytes.length })
    );
    assert.equal(created.status, 201);
    const { file } = await created.json();

    // Upload the real bytes for that record.
    const up = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/upload`,
      fileForm(a.accessToken, bytes, "مخطط.pdf")
    );
    assert.equal(up.status, 200);
    assert.equal((await up.json()).file.id, file.id);

    // Bytes are persisted on disk under the server-generated storageKey path.
    const stored = await prisma.userFile.findUnique({ where: { id: file.id } });
    assert.match(stored.storageKey, /\.pdf$/, "storageKey gains the real extension");
    assert.equal(stored.size, bytes.length, "DB size reflects the uploaded bytes");
    const blobPath = path.join(USER_FILES_DIR, path.basename(stored.storageKey));
    assert.equal(await fileExists(blobPath), true, "blob exists on disk");
    assert.deepEqual([...await readFile(blobPath)], [...bytes], "blob bytes match upload");

    // A second session (device B) downloads the exact bytes for the same record.
    const dl = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/download`,
      { headers: { Authorization: `Bearer ${a.accessToken}` } }
    );
    assert.equal(dl.status, 200);
    assert.equal(dl.headers.get("content-type"), "application/pdf");
    const dlBytes = new Uint8Array(await dl.arrayBuffer());
    assert.deepEqual([...dlBytes], [...bytes], "download returns the exact uploaded bytes");
  });

  it("user files: byte upload/download are ownership-scoped (foreign 404)", async () => {
    const a = await newUser("blob-b");
    const b = await newUser("blob-c");
    const bytes = new Uint8Array([72, 105]);

    const created = await fetch(
      `${server.baseUrl}/api/user-files`,
      json("POST", a.accessToken, { name: "note.txt", type: "text/plain", size: bytes.length })
    );
    const { file } = await created.json();

    // Owner uploads bytes.
    const up = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/upload`,
      fileForm(a.accessToken, bytes, "note.txt", "text/plain")
    );
    assert.equal(up.status, 200);

    // Foreign user: upload + download are indistinguishable from missing.
    const upB = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/upload`,
      fileForm(b.accessToken, bytes, "note.txt", "text/plain")
    );
    assert.equal(upB.status, 404, "foreign byte upload must be 404");

    const dlB = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/download`,
      { headers: { Authorization: `Bearer ${b.accessToken}` } }
    );
    assert.equal(dlB.status, 404, "foreign byte download must be 404");

    // Foreign upload did not attach bytes to the record.
    const stored = await prisma.userFile.findUnique({ where: { id: file.id } });
    assert.equal(stored.storageKey.endsWith(".txt"), true);

    // Owner can still download.
    const dlA = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/download`,
      { headers: { Authorization: `Bearer ${a.accessToken}` } }
    );
    assert.equal(dlA.status, 200);
  });

  it("user files: upload rejects unsafe types (422) and oversized blobs (413)", async () => {
    const a = await newUser("blob-d");

    const created = await fetch(
      `${server.baseUrl}/api/user-files`,
      json("POST", a.accessToken, { name: "evil.html", type: "text/html", size: 42 })
    );
    const { file } = await created.json();

    // HTML is blocked by the MIME/extension deny-list before any blob is stored.
    const bad = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/upload`,
      fileForm(a.accessToken, new Uint8Array([60, 115, 99, 114, 105, 112, 116, 62]), "evil.html", "text/html")
    );
    assert.equal(bad.status, 422);

    const stored = await prisma.userFile.findUnique({ where: { id: file.id } });
    assert.ok(!stored.storageKey.includes("."), "rejected upload records no blob name");

    // Uploading >50MB is rejected by the shared size limit.
    const big = new Uint8Array(50 * 1024 * 1024 + 1);
    const oversize = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/upload`,
      fileForm(a.accessToken, big, "huge.pdf")
    );
    assert.equal(oversize.status, 413);
  });

  it("user files: upload retry is idempotent — no duplicate rows or blobs", async () => {
    const a = await newUser("blob-e");
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    // Same clientId (a retried migration) always maps to the same server row.
    const body = { name: "data.bin.pdf", type: "application/pdf", size: bytes.length, clientId: "upload-retry-1" };
    const r1 = await fetch(`${server.baseUrl}/api/user-files`, json("POST", a.accessToken, body));
    const r2 = await fetch(`${server.baseUrl}/api/user-files`, json("POST", a.accessToken, body));
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    const id1 = (await r1.json()).file.id;
    const id2 = (await r2.json()).file.id;
    assert.equal(id1, id2, "same clientId must map to the same row");

    // Upload the bytes twice (retry) — same record, same blob path.
    const up1 = await fetch(
      `${server.baseUrl}/api/user-files/${id1}/upload`,
      fileForm(a.accessToken, bytes, "data.bin.pdf")
    );
    const up2 = await fetch(
      `${server.baseUrl}/api/user-files/${id1}/upload`,
      fileForm(a.accessToken, bytes, "data.bin.pdf")
    );
    assert.equal(up1.status, 200);
    assert.equal(up2.status, 200);

    const count = await prisma.userFile.count({
      where: { userId: a.id, clientId: "upload-retry-1" },
    });
    assert.equal(count, 1, "exactly one row after a retried upload");

    const stored = await prisma.userFile.findUnique({ where: { id: id1 } });
    const blobPath = path.join(USER_FILES_DIR, path.basename(stored.storageKey));
    assert.deepEqual([...await readFile(blobPath)], [...bytes], "retried upload overwrites the same blob");
  });

  it("user files: delete removes the metadata row and the on-disk blob", async () => {
    const a = await newUser("blob-f");
    const bytes = new Uint8Array([9, 9, 9]);
    const created = await fetch(
      `${server.baseUrl}/api/user-files`,
      json("POST", a.accessToken, { name: "temp.pdf", type: "application/pdf", size: bytes.length })
    );
    const { file } = await created.json();
    const up = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}/upload`,
      fileForm(a.accessToken, bytes, "temp.pdf")
    );
    assert.equal(up.status, 200);

    const stored = await prisma.userFile.findUnique({ where: { id: file.id } });
    const blobPath = path.join(USER_FILES_DIR, path.basename(stored.storageKey));
    assert.equal(await fileExists(blobPath), true);

    const del = await fetch(
      `${server.baseUrl}/api/user-files/${file.id}`,
      json("DELETE", a.accessToken)
    );
    assert.equal(del.status, 200);
    assert.equal(await prisma.userFile.findUnique({ where: { id: file.id } }), null);
    assert.equal(await fileExists(blobPath), false, "blob is removed from disk on delete");
  });
  // ------------------------------------------------------------------
  // Pomodoro personal stats (additive increments)
  // ------------------------------------------------------------------
  it("pomodoro stats: default row, additive increments survive repeated posts", async () => {
    const a = await newUser("pomo-a");

    const first = await fetch(`${server.baseUrl}/api/pomodoro/me/stats`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    assert.equal(first.status, 200);
    const initial = (await first.json()).stats;
    assert.equal(initial.completedSessions, 0);
    assert.equal(initial.totalFocusSeconds, 0);

    const post1 = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats`,
      json("POST", a.accessToken, { sessionSeconds: 1500 })
    );
    assert.equal(post1.status, 201);
    const s1 = (await post1.json()).stats;
    assert.equal(s1.completedSessions, 1);
    assert.equal(s1.totalFocusSeconds, 1500);
    assert.equal(s1.lastFocusSeconds, 1500);

    const post2 = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats`,
      json("POST", a.accessToken, { sessionSeconds: 1800 })
    );
    const s2 = (await post2.json()).stats;
    assert.equal(s2.completedSessions, 2, "additive, not overwrite");
    assert.equal(s2.totalFocusSeconds, 3300);
    assert.equal(s2.lastFocusSeconds, 1800);

    const bad = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats`,
      json("POST", a.accessToken, { sessionSeconds: -5 })
    );
    assert.equal(bad.status, 400);
  });

  it("pomodoro stats: merge is element-wise max, idempotent, never destructive", async () => {
    const a = await newUser("merge-a");

    // Seed the row through the live additive endpoint.
    const seed = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats`,
      json("POST", a.accessToken, { sessionSeconds: 1500 })
    );
    assert.equal(seed.status, 201);
    assert.equal((await seed.json()).stats.totalFocusSeconds, 1500);

    // Merging a smaller guest snapshot must not shrink existing counters.
    const smaller = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats/merge`,
      json("POST", a.accessToken, { completedSessions: 1, totalFocusSeconds: 900 })
    );
    assert.equal(smaller.status, 200);
    const sSmall = (await smaller.json()).stats;
    assert.equal(sSmall.completedSessions, 1);
    assert.equal(sSmall.totalFocusSeconds, 1500, "max keeps the larger value");
    assert.equal(sSmall.lastFocusSeconds, 1500, "lastFocusSeconds retains seed value");

    // Merging a richer guest snapshot raises every field (element-wise max).
    const bigger = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats/merge`,
      json("POST", a.accessToken, {
        completedSessions: 5,
        totalFocusSeconds: 10_000,
        lastFocusSeconds: 3600,
      })
    );
    assert.equal(bigger.status, 200);
    const sBig = (await bigger.json()).stats;
    assert.equal(sBig.completedSessions, 5);
    assert.equal(sBig.totalFocusSeconds, 10_000);
    assert.equal(sBig.lastFocusSeconds, 3600, "element-wise max raises the value");

    // Retrying the same snapshot converges (idempotent).
    const retry = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats/merge`,
      json("POST", a.accessToken, {
        completedSessions: 5,
        totalFocusSeconds: 10_000,
        lastFocusSeconds: 3600,
      })
    );
    const retried = (await retry.json()).stats;
    assert.equal(retried.completedSessions, sBig.completedSessions);
    assert.equal(retried.totalFocusSeconds, sBig.totalFocusSeconds);
    assert.equal(retried.lastFocusSeconds, sBig.lastFocusSeconds);

    // Partial merges only touch provided fields; never lower existing values.
    const partial = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats/merge`,
      json("POST", a.accessToken, { lastFocusSeconds: 30 })
    );
    const sPartial = (await partial.json()).stats;
    assert.equal(sPartial.completedSessions, 5);
    assert.equal(sPartial.totalFocusSeconds, 10_000);
    assert.equal(sPartial.lastFocusSeconds, 3600, "lower value must not shrink the counter");

    // Empty payload is rejected.
    const empty = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats/merge`,
      json("POST", a.accessToken, {})
    );
    assert.equal(empty.status, 400);

    // Negative counters are rejected.
    const neg = await fetch(
      `${server.baseUrl}/api/pomodoro/me/stats/merge`,
      json("POST", a.accessToken, { totalFocusSeconds: -1 })
    );
    assert.equal(neg.status, 400);
  });

  // ------------------------------------------------------------------
  // Adhkar progress
  // ------------------------------------------------------------------
  it("adhkar progress: PUT/GET roundtrip, validation, 404 before first write", async () => {
    const a = await newUser("dhkr-a");

    const missing = await fetch(`${server.baseUrl}/api/adhkar/progress/2026-09-16`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    assert.equal(missing.status, 404);

    const badDay = await fetch(
      `${server.baseUrl}/api/adhkar/progress/16-09-2026`,
      json("PUT", a.accessToken, { counts: {} })
    );
    assert.equal(badDay.status, 400);

    const badCounts = await fetch(
      `${server.baseUrl}/api/adhkar/progress/2026-09-16`,
      json("PUT", a.accessToken, { counts: { dhikr1: -1 } })
    );
    assert.equal(badCounts.status, 400);

    const put = await fetch(
      `${server.baseUrl}/api/adhkar/progress/2026-09-16`,
      json("PUT", a.accessToken, { counts: { morning1: 33, evening1: 33 } })
    );
    assert.equal(put.status, 200);
    assert.deepEqual((await put.json()).progress.counts, { morning1: 33, evening1: 33 });

    const again = await fetch(
      `${server.baseUrl}/api/adhkar/progress/2026-09-16`,
      json("PUT", a.accessToken, { counts: { morning1: 34, morning2: 11 } })
    );
    assert.deepEqual((await again.json()).progress.counts, { morning1: 34, morning2: 11 }, "upsert replaces counts");

    const get = await fetch(`${server.baseUrl}/api/adhkar/progress/2026-09-16`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    assert.equal(get.status, 200);
    assert.equal((await get.json()).progress.day, "2026-09-16");
  });

  // ------------------------------------------------------------------
  // Preferences
  // ------------------------------------------------------------------
  it("preferences: defaults, patch, enum mapping, ownership", async () => {
    const a = await newUser("pref-a");

    const get = await fetch(`${server.baseUrl}/api/preferences`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    assert.equal(get.status, 200);
    const prefs = (await get.json()).preferences;
    assert.equal(prefs.theme, "dark");
    assert.equal(prefs.pomodoroFocusMinutes, 25);

    const patch = await fetch(
      `${server.baseUrl}/api/preferences`,
      json("PATCH", a.accessToken, {
        theme: "light",
        pomodoroTheme: "digital",
        pomodoroTimerMode: "countup",
        recentTools: ["compress"],
      })
    );
    assert.equal(patch.status, 200);
    const updated = (await patch.json()).preferences;
    assert.equal(updated.theme, "light");
    assert.equal(updated.pomodoroTheme, "digital", "enum serialised lowercase");
    assert.equal(updated.pomodoroTimerMode, "countup");

    const stored = await prisma.userPreference.findUnique({ where: { userId: a.id } });
    assert.equal(stored.pomodoroTheme, "DIGITAL", "enum stored uppercase in DB");
    assert.deepEqual(stored.recentTools, ["compress"]);

    const badTheme = await fetch(
      `${server.baseUrl}/api/preferences`,
      json("PATCH", a.accessToken, { theme: "purple" })
    );
    assert.equal(badTheme.status, 400);

    const empty = await fetch(
      `${server.baseUrl}/api/preferences`,
      json("PATCH", a.accessToken, {})
    );
    assert.equal(empty.status, 400);
  });

  // ------------------------------------------------------------------
  // Achievements additive increment
  // ------------------------------------------------------------------
  it("achievements: additive increment endpoint sums rather than overwrites", async () => {
    const a = await newUser("ach-a");

    const post1 = await fetch(
      `${server.baseUrl}/api/profile/me/achievements/increment`,
      json("POST", a.accessToken, { completedTasks: 1, cardsReviewed: 3 })
    );
    assert.equal(post1.status, 200);
    const r1 = (await post1.json()).achievements;
    assert.equal(r1.completedTasks, 1);
    assert.equal(r1.cardsReviewed, 3);

    const post2 = await fetch(
      `${server.baseUrl}/api/profile/me/achievements/increment`,
      json("POST", a.accessToken, { completedTasks: 1 })
    );
    assert.equal(post2.status, 200);
    const r2 = (await post2.json()).achievements;
    assert.equal(r2.completedTasks, 2, "POST increments, never resets");
    assert.equal(r2.cardsReviewed, 3);

    const zero = await fetch(
      `${server.baseUrl}/api/profile/me/achievements/increment`,
      json("POST", a.accessToken, { completedTasks: 0 })
    );
    assert.equal(zero.status, 400, "all-zero increments rejected");

    const neg = await fetch(
      `${server.baseUrl}/api/profile/me/achievements/increment`,
      json("POST", a.accessToken, { completedTasks: -1 })
    );
    assert.equal(neg.status, 400, "negative increments rejected");
  });

  // ------------------------------------------------------------------
  // Media job ownership
  // ------------------------------------------------------------------
  it("media jobs: ownership isolation (owner ok, foreign denied, anonymous 401)", async () => {
    const image = await ensureImage();
    const a = await newUser("media-a");
    const b = await newUser("media-b");
    const bytes = await readFile(image);

    const form = new FormData();
    form.append("file", new Blob([bytes]), "tiny.png");
    form.append("width", "16");
    const started = await fetch(`${server.baseUrl}/api/media/image/resize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${a.accessToken}` },
      body: form,
    });
    assert.equal(started.status, 202);
    const { jobId } = await started.json();

    // Wait for completion (as the owner) so the download path is exercised.
    const status = await pollStatus(server.baseUrl, a.accessToken, jobId);
    assert.equal(status.status, "done", JSON.stringify(status));

    // Owner can poll + download.
    const ownerDl = await fetch(
      `${server.baseUrl}/api/media/jobs/${jobId}/download`,
      { headers: { Authorization: `Bearer ${a.accessToken}` } }
    );
    assert.equal(ownerDl.status, 200);
    await ownerDl.arrayBuffer().catch(() => {});

    // Create a second job so the foreign-404 checks below still have a live job.
    const form2 = new FormData();
    form2.append("file", new Blob([bytes]), "tiny.png");
    form2.append("width", "16");
    const started2 = await fetch(`${server.baseUrl}/api/media/image/resize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${a.accessToken}` },
      body: form2,
    });
    const { jobId: jobId2 } = await started2.json();

    // Foreign user: status/download/delete all indistinguishable from missing.
    const bStatus = await fetch(
      `${server.baseUrl}/api/media/jobs/${jobId2}/status`,
      { headers: { Authorization: `Bearer ${b.accessToken}` } }
    );
    assert.equal(bStatus.status, 404, "foreign status must be 404");

    const bDownload = await fetch(
      `${server.baseUrl}/api/media/jobs/${jobId2}/download`,
      { headers: { Authorization: `Bearer ${b.accessToken}` } }
    );
    assert.equal(bDownload.status, 404, "foreign download must be 404");

    const bDelete = await fetch(
      `${server.baseUrl}/api/media/jobs/${jobId2}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${b.accessToken}` } }
    );
    assert.equal(bDelete.status, 404, "foreign cancel must be 404");

    // Anonymous: 401 (middleware rejects before ownership is even checked).
    const anonStatus = await fetch(
      `${server.baseUrl}/api/media/jobs/${jobId2}/status`
    );
    assert.equal(anonStatus.status, 401);

    // Owner can still see their second job (payload not deleted by the 404s).
    const aStatus = await fetch(
      `${server.baseUrl}/api/media/jobs/${jobId2}/status`,
      { headers: { Authorization: `Bearer ${a.accessToken}` } }
    );
    assert.equal(aStatus.status, 200, "owner access unaffected by foreign attempts");
  });

  // ------------------------------------------------------------------
  // Media processing rate limit
  // ------------------------------------------------------------------
  it("media process endpoints are rate-limited independently of auth", async () => {
    const limiterServer = await startBackend({ MEDIA_RATE_LIMIT_MAX: "3" });
    try {
      const token = await registerAndLogin(limiterServer.baseUrl, "ratelimit");
      const image = await ensureImage();
      const bytes = await readFile(image);

      let last = null;
      for (let i = 0; i < 5; i++) {
        const form = new FormData();
        form.append("file", new Blob([bytes]), "tiny.png");
        form.append("width", "16");
        const res = await fetch(`${limiterServer.baseUrl}/api/media/image/resize`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        last = res.status;
        await res.arrayBuffer().catch(() => {});
      }
      assert.equal(last, 429, "5th rapid process request must be rate-limited");

      // Status polling is NOT rate-limited.
      const poll = await fetch(
        `${limiterServer.baseUrl}/api/media/jobs/does-not-matter/status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(poll.status, 404, "polling endpoint must not be throttled");
    } finally {
      await limiterServer.stop();
    }
  });
});
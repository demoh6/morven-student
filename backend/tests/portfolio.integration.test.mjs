import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./helpers/server.mjs";
import { config as loadDotEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadDotEnv();

const prisma = new PrismaClient();

const createdUserIds = [];
const createdUniversityIds = [];

function uniqueSuffix(tag) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${tag}${ts}${rnd}`;
}

async function register(baseUrl, suffix) {
  const safe = suffix.replace(/[^a-zA-Z0-9]/g, "_");
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `portfolio-${safe}@example.com`,
      username: `pf_${safe}`.slice(0, 30),
      password: "SecurePass123!",
      displayName: `Portfolio Test ${suffix}`,
    }),
  });
  const data = await res.json();
  assert.ok([200, 201].includes(res.status), `register failed: ${JSON.stringify(data)}`);
  if (data.user?.id) createdUserIds.push(data.user.id);
  return data;
}

async function login(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "SecurePass123!" }),
  });
  return res.json();
}

async function promote(userId, role) {
  await prisma.user.update({ where: { id: userId }, data: { role } });
}

async function api(baseUrl, token, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data };
}

const universityPayload = (suffix) => ({
  name: `جامعة اختبار ${suffix}`,
  nameEn: `Test University ${suffix}`,
  city: "نابلس",
  shortCode: "ت",
  color: "#123456",
  established: 2001,
  students: "5,000+",
});

describe("Portfolio Builder catalog management", () => {
  let server;
  let adminToken;
  let subAdminToken;
  let studentToken;

  let universityId;
  let cohortId;
  let courseId;

  const suffix = uniqueSuffix("pf");

  before(async () => {
    server = await startBackend();

    const admin = await register(server.baseUrl, uniqueSuffix("adm"));
    await promote(admin.user.id, "ADMIN");
    adminToken = (await login(server.baseUrl, admin.user.email)).accessToken;

    const sub = await register(server.baseUrl, uniqueSuffix("sub"));
    await promote(sub.user.id, "SUB_ADMIN");
    subAdminToken = (await login(server.baseUrl, sub.user.email)).accessToken;

    const student = await register(server.baseUrl, uniqueSuffix("stud"));
    studentToken = (await login(server.baseUrl, student.user.email)).accessToken;
  });

  after(async () => {
    // Deleting a university cascades its cohorts, courses, links and templates.
    for (const id of createdUniversityIds) {
      try { await prisma.university.delete({ where: { id } }); } catch { /* already gone */ }
    }
    for (const id of createdUserIds) {
      try { await prisma.user.delete({ where: { id } }); } catch { /* already gone */ }
    }
    await prisma.$disconnect();
    await server?.stop();
  });

  it("requires authentication for the catalog", async () => {
    const anon = await api(server.baseUrl, null, "/api/portfolio/catalog");
    assert.equal(anon.res.status, 401);
  });

  it("lets any authenticated user read the catalog but not modify it", async () => {
    const read = await api(server.baseUrl, studentToken, "/api/portfolio/catalog");
    assert.equal(read.res.status, 200);
    assert.ok(Array.isArray(read.data.universities));
    assert.ok(Array.isArray(read.data.cohorts));
    assert.ok(Array.isArray(read.data.courses));

    const write = await api(server.baseUrl, studentToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify(universityPayload(suffix)),
    });
    assert.equal(write.res.status, 403);
  });

  it("blocks SUB_ADMIN from catalog management (main admin only)", async () => {
    const res = await api(server.baseUrl, subAdminToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify(universityPayload(`${suffix}-sub`)),
    });
    assert.equal(res.res.status, 403);
  });

  it("creates a university and rejects a duplicate name", async () => {
    const created = await api(server.baseUrl, adminToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify(universityPayload(suffix)),
    });
    assert.equal(created.res.status, 201, `create failed: ${JSON.stringify(created.data)}`);
    assert.ok(created.data.university.id);
    universityId = created.data.university.id;
    createdUniversityIds.push(universityId);

    const dup = await api(server.baseUrl, adminToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify(universityPayload(suffix)),
    });
    assert.equal(dup.res.status, 409);
  });

  it("validates university input", async () => {
    const bad = await api(server.baseUrl, adminToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify({ name: "", city: "", shortCode: "", color: "", established: 1, students: "" }),
    });
    assert.equal(bad.res.status, 400);
  });

  it("creates a university from only its name (simplified form)", async () => {
    const created = await api(server.baseUrl, adminToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify({ name: `جامعة مبسطة ${suffix}` }),
    });
    assert.equal(created.res.status, 201, `name-only create failed: ${JSON.stringify(created.data)}`);
    assert.equal(created.data.university.name, `جامعة مبسطة ${suffix}`);
    assert.equal(typeof created.data.university.city, "string");
    createdUniversityIds.push(created.data.university.id);
  });

  it("creates cohorts, rejects duplicates and unknown universities", async () => {
    const created = await api(server.baseUrl, adminToken, "/api/admin/portfolio/cohorts", {
      method: "POST",
      body: JSON.stringify({
        universityId,
        label: "السنة الأولى",
        order: 1,
        academicYears: "2025/2026",
        description: "دفعة اختبار",
      }),
    });
    assert.equal(created.res.status, 201, `cohort create failed: ${JSON.stringify(created.data)}`);
    cohortId = created.data.cohort.id;

    const dup = await api(server.baseUrl, adminToken, "/api/admin/portfolio/cohorts", {
      method: "POST",
      body: JSON.stringify({ universityId, label: "السنة الأولى", order: 1, academicYears: "2025/2026" }),
    });
    assert.equal(dup.res.status, 409);

    const orphan = await api(server.baseUrl, adminToken, "/api/admin/portfolio/cohorts", {
      method: "POST",
      body: JSON.stringify({ universityId: "does-not-exist", label: "دفعة", order: 1, academicYears: "x" }),
    });
    assert.equal(orphan.res.status, 404);
  });

  it("creates courses and rejects cross-university cohort links", async () => {
    const created = await api(server.baseUrl, adminToken, "/api/admin/portfolio/courses", {
      method: "POST",
      body: JSON.stringify({
        universityId,
        name: "الطب البشري",
        code: "MED",
        description: "اختبار",
        portfolioKind: "ملف إنجاز",
        batchIds: [cohortId],
      }),
    });
    assert.equal(created.res.status, 201, `course create failed: ${JSON.stringify(created.data)}`);
    courseId = created.data.course.id;
    assert.deepEqual(created.data.course.batchIds, [cohortId]);

    // A cohort from a different university must be rejected.
    const otherUni = await api(server.baseUrl, adminToken, "/api/admin/portfolio/universities", {
      method: "POST",
      body: JSON.stringify(universityPayload(`${suffix}-other`)),
    });
    assert.equal(otherUni.res.status, 201);
    createdUniversityIds.push(otherUni.data.university.id);
    const otherCohort = await api(server.baseUrl, adminToken, "/api/admin/portfolio/cohorts", {
      method: "POST",
      body: JSON.stringify({
        universityId: otherUni.data.university.id,
        label: "السنة الأولى",
        order: 1,
        academicYears: "2025/2026",
      }),
    });
    assert.equal(otherCohort.res.status, 201);

    const invalidLink = await api(server.baseUrl, adminToken, "/api/admin/portfolio/courses", {
      method: "POST",
      body: JSON.stringify({
        universityId,
        name: "مقرر خاطئ",
        portfolioKind: "مقرر",
        batchIds: [otherCohort.data.cohort.id],
      }),
    });
    assert.equal(invalidLink.res.status, 400);
  });

  it("reflects the admin-configured catalog in the student-facing endpoints", async () => {
    const catalog = await api(server.baseUrl, studentToken, "/api/portfolio/catalog");
    assert.equal(catalog.res.status, 200);
    assert.ok(catalog.data.universities.some((u) => u.id === universityId));
    assert.ok(catalog.data.cohorts.some((c) => c.id === cohortId && c.universityId === universityId));
    const course = catalog.data.courses.find((c) => c.id === courseId);
    assert.ok(course, "created course must be visible to students");
    assert.deepEqual(course.batchIds, [cohortId]);

    const cohorts = await api(server.baseUrl, studentToken, `/api/portfolio/universities/${universityId}/cohorts`);
    assert.equal(cohorts.res.status, 200);
    assert.ok(cohorts.data.cohorts.some((c) => c.id === cohortId));

    const courses = await api(server.baseUrl, studentToken, `/api/portfolio/universities/${universityId}/courses`);
    assert.equal(courses.res.status, 200);
    assert.ok(courses.data.courses.some((c) => c.id === courseId));
  });

  it("edits universities, cohorts and courses", async () => {
    const uni = await api(server.baseUrl, adminToken, `/api/admin/portfolio/universities/${universityId}`, {
      method: "PATCH",
      body: JSON.stringify({ city: "رام الله" }),
    });
    assert.equal(uni.res.status, 200);
    assert.equal(uni.data.university.city, "رام الله");

    const cohort = await api(server.baseUrl, adminToken, `/api/admin/portfolio/cohorts/${cohortId}`, {
      method: "PATCH",
      body: JSON.stringify({ label: "السنة الثانية", order: 2 }),
    });
    assert.equal(cohort.res.status, 200);
    assert.equal(cohort.data.cohort.label, "السنة الثانية");

    const course = await api(server.baseUrl, adminToken, `/api/admin/portfolio/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "الطب والجراحة", batchIds: [] }),
    });
    assert.equal(course.res.status, 200);
    assert.equal(course.data.course.name, "الطب والجراحة");
    assert.deepEqual(course.data.course.batchIds, []);
  });

  it("protects dependent records on delete", async () => {
    // University still has a cohort + course.
    const uniDel = await api(server.baseUrl, adminToken, `/api/admin/portfolio/universities/${universityId}`, {
      method: "DELETE",
    });
    assert.equal(uniDel.res.status, 409);

    // Re-link the course to the cohort, then a cohort delete must be blocked.
    const relink = await api(server.baseUrl, adminToken, `/api/admin/portfolio/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify({ batchIds: [cohortId] }),
    });
    assert.equal(relink.res.status, 200);
    const cohortDel = await api(server.baseUrl, adminToken, `/api/admin/portfolio/cohorts/${cohortId}`, {
      method: "DELETE",
    });
    assert.equal(cohortDel.res.status, 409);

    // A course with a template must not be deletable.
    const template = await api(server.baseUrl, adminToken, "/api/admin/portfolio/templates", {
      method: "POST",
      body: JSON.stringify({
        name: "قالب اختبار",
        universityId,
        cohortId,
        courseId,
        kind: "ملف إنجاز",
        specialty: "طب الأطفال",
        pdfName: "",
        fields: [],
      }),
    });
    assert.equal(template.res.status, 201, `template create failed: ${JSON.stringify(template.data)}`);
    assert.equal(template.data.template.specialty, "طب الأطفال");

    // The specialty is editable and persisted.
    const patched = await api(
      server.baseUrl,
      adminToken,
      `/api/admin/portfolio/templates/${template.data.template.id}`,
      { method: "PATCH", body: JSON.stringify({ specialty: "الجراحة العامة" }) },
    );
    assert.equal(patched.res.status, 200, `template patch failed: ${JSON.stringify(patched.data)}`);
    assert.equal(patched.data.template.specialty, "الجراحة العامة");

    const courseDel = await api(server.baseUrl, adminToken, `/api/admin/portfolio/courses/${courseId}`, {
      method: "DELETE",
    });
    assert.equal(courseDel.res.status, 409);

    // Remove the template, then delete course → cohort → university in order.
    const templateDel = await api(
      server.baseUrl,
      adminToken,
      `/api/admin/portfolio/templates/${template.data.template.id}`,
      { method: "DELETE" },
    );
    assert.equal(templateDel.res.status, 200);

    const unlinkCourse = await api(server.baseUrl, adminToken, `/api/admin/portfolio/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify({ batchIds: [] }),
    });
    assert.equal(unlinkCourse.res.status, 200);

    const courseDel2 = await api(server.baseUrl, adminToken, `/api/admin/portfolio/courses/${courseId}`, {
      method: "DELETE",
    });
    assert.equal(courseDel2.res.status, 200);

    const cohortDel2 = await api(server.baseUrl, adminToken, `/api/admin/portfolio/cohorts/${cohortId}`, {
      method: "DELETE",
    });
    assert.equal(cohortDel2.res.status, 200);

    // The university is now empty, so it can be deleted.
    const uniDel2 = await api(server.baseUrl, adminToken, `/api/admin/portfolio/universities/${universityId}`, {
      method: "DELETE",
    });
    assert.equal(uniDel2.res.status, 200);
  });

  it("returns 404 for unknown catalog entries", async () => {
    const uni = await api(server.baseUrl, adminToken, "/api/admin/portfolio/universities/nope", {
      method: "PATCH",
      body: JSON.stringify({ city: "x" }),
    });
    assert.equal(uni.res.status, 404);

    const cohort = await api(server.baseUrl, adminToken, "/api/admin/portfolio/cohorts/nope", {
      method: "DELETE",
    });
    assert.equal(cohort.res.status, 404);

    const course = await api(server.baseUrl, adminToken, "/api/admin/portfolio/courses/nope", {
      method: "DELETE",
    });
    assert.equal(course.res.status, 404);
  });
});

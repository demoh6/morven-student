import multer from "multer";
import path from "path";
import fs from "fs";

// Resource files are stored in a DEDICATED, non-public sub-directory
// (`uploads/resources`). They are NOT served by the public `/uploads` static
// mount (see app.ts, which returns 404 for `/uploads/resources/*`). Resource
// files are only reachable through the authenticated
// `/api/resources/:resourceId/files/:fileId/download` endpoint, which forces a
// download (Content-Disposition: attachment) and never executes inline.
const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads", "resources");
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* ignore */ }

const MAX_RESOURCE_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (app-wide upload limit)
const MAX_RESOURCE_FILES = 10;

// Only safe, non-executable file types may be stored. This blocks HTML/SVG/JS
// and other content that browsers could execute inline (stored-XSS prevention),
// even though resources are also served as forced downloads. The uploaded MIME
// type is client-supplied, so we additionally reject dangerous extensions.
const ALLOWED_MIMES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "application/epub+zip",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "text/plain",
  "text/markdown",
  "text/csv",
  // Images (safe preview types)
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
  // Video
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

// Deny-list of extensions that could be interpreted/executed by a browser or
// carry executable content, regardless of the (spoofable) MIME type.
const BLOCKED_EXTENSIONS =
  /\.(html?|htm|svg|js|mjs|cjs|php|phtml|jsp|jspx|asp|aspx|exe|msi|bat|cmd|sh|bash|py|pl|rb|jar|war|swf|xsl|xslt|wsh|vbs)$/i;

function resourceFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const blockedExt = BLOCKED_EXTENSIONS.test(file.originalname);
  if (ALLOWED_MIMES.has(file.mimetype) && !blockedExt) {
    cb(null, true);
    return;
  }
  const err = new Error("نوع الملف غير مدعوم") as Error & { status?: number };
  err.status = 422;
  cb(err);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
    cb(null, `${unique}${ext}`);
  },
});

// Intersection augments @types/multer (written for multer 1.x) with the
// `defParamCharset` option that the installed multer 2.x runtime supports
// and documents in its README.
const uploadOptions: multer.Options & { defParamCharset?: string } = {
  // Decode multipart filenames as UTF-8 (browsers send raw UTF-8 bytes in
  // filename=). Without this, multer defaults to latin1 and Arabic names
  // arrive mojibaked, so the stored/displayed name is not the original.
  defParamCharset: "utf8",
  storage,
  limits: { fileSize: MAX_RESOURCE_FILE_SIZE, files: MAX_RESOURCE_FILES },
  fileFilter: resourceFilter,
};

export const uploadResource = multer(uploadOptions);

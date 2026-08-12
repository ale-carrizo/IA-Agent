// Servicio de almacenamiento público para PDFs/materiales.
// Sube archivos y los sirve en una URL pública (alcanzable por n8n y Botmaker).
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const DIR = process.env.STORAGE_DIR || "/data";
const TOKEN = process.env.UPLOAD_TOKEN || ""; // si está seteado, se exige en header x-token para subir
fs.mkdirSync(DIR, { recursive: true });

const upload = multer({ dest: DIR, limits: { fileSize: 50 * 1024 * 1024 } });

function safeName(orig) {
  const base = (orig || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return Date.now() + "-" + base;
}

// POST /upload  (multipart, campo "file")  -> { url, filename }
app.post("/upload", upload.single("file"), (req, res) => {
  if (TOKEN && req.headers["x-token"] !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "falta archivo (campo 'file')" });
  const name = safeName(req.file.originalname);
  fs.renameSync(req.file.path, path.join(DIR, name));
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const url = `${proto}://${req.get("host")}/f/${encodeURIComponent(name)}`;
  res.json({ url, filename: name });
});

// servir archivos públicamente
app.use("/f", express.static(DIR, { maxAge: "7d" }));

app.get("/", (_req, res) => res.json({ ok: true, service: "sales-ai-storage" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("storage on " + PORT + " dir=" + DIR));

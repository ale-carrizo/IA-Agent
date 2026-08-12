// Genera un PDF de solo texto (Helvetica, WinAnsi) sin dependencias externas.
// Se usa para KB que llega en formatos no-PDF (imágenes transcriptas, texto pegado):
// el pipeline de ingesta (n8n) solo sabe extraer texto de PDFs.
export function textoAPdf(texto: string): Buffer {
  // WinAnsi (CP1252) cubre acentos/ñ; lo que no, se aproxima
  const sanitize = (s: string) =>
    s
      .replace(/[—–]/g, "-")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/…/g, "...")
      .replace(/[•▪◦]/g, "-")
      .replace(/[^\x00-\xFF]/g, "?");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // wrap a ~95 caracteres por línea
  const lines: string[] = [];
  for (const raw of sanitize(texto).split(/\r?\n/)) {
    let rest = raw;
    if (!rest) {
      lines.push("");
      continue;
    }
    while (rest.length > 95) {
      let cut = rest.lastIndexOf(" ", 95);
      if (cut < 40) cut = 95;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
  }

  const porPagina = 48;
  const paginas: string[][] = [];
  for (let i = 0; i < lines.length; i += porPagina) paginas.push(lines.slice(i, i + porPagina));
  if (!paginas.length) paginas.push([""]);

  const nPag = paginas.length;
  const objs: string[] = [];
  const kids = paginas.map((_, i) => `${4 + i} 0 R`).join(" ");
  objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${nPag} >>`);
  objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  paginas.forEach((_, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${4 + nPag + i} 0 R >>`
    );
  });
  paginas.forEach((pg) => {
    const cont =
      "BT /F1 11 Tf 50 760 Td 14 TL\n" + pg.map((l) => `(${esc(l)}) Tj T*`).join("\n") + "\nET";
    objs.push(`<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

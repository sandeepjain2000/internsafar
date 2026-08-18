import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'public', 'sample-docs');
const cvs = path.join(root, 'public', 'sample-cvs');
fs.mkdirSync(docs, { recursive: true });
fs.mkdirSync(cvs, { recursive: true });

const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 70 >>stream
BT /F1 18 Tf 72 720 Td (ISM Seed Document - Company Registration) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000389 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
468
%%EOF
`;

for (const n of ['novatech-company-registration.pdf', 'pulse-company-registration.pdf']) {
  fs.writeFileSync(path.join(docs, n), pdf);
}

const tmp = path.join(os.tmpdir(), `ism-docx-${Date.now()}`);
fs.mkdirSync(path.join(tmp, 'word'), { recursive: true });
fs.mkdirSync(path.join(tmp, '_rels'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, '[Content_Types].xml'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
fs.writeFileSync(
  path.join(tmp, '_rels', '.rels'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
fs.writeFileSync(
  path.join(tmp, 'word', 'document.xml'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ISM Seed Shop Act Document (demo)</w:t></w:r></w:p></w:body></w:document>',
);

const zip = path.join(docs, 'tmp-shop.zip');
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${tmp.replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -Force"`,
);
const buf = fs.readFileSync(zip);
for (const n of ['novatech-shop-act.docx', 'pulse-shop-act.docx']) {
  fs.writeFileSync(path.join(docs, n), buf);
}
fs.writeFileSync(path.join(cvs, 'cv-demo.docx'), buf);
fs.writeFileSync(path.join(cvs, 'cv-aisha.docx'), buf);
fs.unlinkSync(zip);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('sample-docs:', fs.readdirSync(docs).join(', '));

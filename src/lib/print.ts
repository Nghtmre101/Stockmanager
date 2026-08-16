/**
 * Printing engine — thermal receipt (58/80mm), A4 invoice ("facture"),
 * barcode labels and end-of-day (Z) report. Uses a hidden iframe so the
 * app itself never disappears behind the print dialog, which also works
 * inside the Capacitor Android WebView.
 */
import type { DB, Purchase, Sale, Settings } from "./db";
import { round2, saleDue } from "./db";
import type { Lang } from "./app-context";
import { barcodeSVG } from "./barcode";

/* ---------------- amount in words (required on Algerian invoices) --------- */

const AR_ONES = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر",
  "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = [
  "", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة",
];

function arBelow1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(AR_HUNDREDS[h]);
  if (r < 20) {
    if (r) parts.push(AR_ONES[r]);
  } else {
    const o = r % 10;
    const t = Math.floor(r / 10);
    parts.push(o ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t]);
  }
  return parts.join(" و");
}

function arWords(n: number): string {
  if (n === 0) return "صفر";
  const groups: { div: number; one: string; two: string; many: string }[] = [
    { div: 1e9, one: "مليار", two: "ملياران", many: "مليار" },
    { div: 1e6, one: "مليون", two: "مليونان", many: "ملايين" },
    { div: 1e3, one: "ألف", two: "ألفان", many: "آلاف" },
  ];
  const out: string[] = [];
  let rest = n;
  for (const g of groups) {
    const c = Math.floor(rest / g.div);
    rest %= g.div;
    if (!c) continue;
    if (c === 1) out.push(g.one);
    else if (c === 2) out.push(g.two);
    else if (c <= 10) out.push(`${arBelow1000(c)} ${g.many}`);
    else out.push(`${arBelow1000(c)} ${g.one}`);
  }
  if (rest) out.push(arBelow1000(rest));
  return out.join(" و");
}

const FR_ONES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const FR_TENS = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt",
];

function frBelow100(n: number): string {
  if (n < 20) return FR_ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (t === 7 || t === 9) return `${FR_TENS[t]}-${FR_ONES[10 + o]}`;
  if (o === 1 && t !== 8) return `${FR_TENS[t]} et un`;
  return o ? `${FR_TENS[t]}-${FR_ONES[o]}` : FR_TENS[t] + (t === 8 ? "s" : "");
}

function frBelow1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = h === 0 ? "" : h === 1 ? "cent" : `${FR_ONES[h]} cent${r === 0 ? "s" : ""}`;
  return [head, r ? frBelow100(r) : ""].filter(Boolean).join(" ");
}

function frWords(n: number): string {
  if (n === 0) return "zéro";
  const out: string[] = [];
  const g = [
    { div: 1e9, label: "milliard" },
    { div: 1e6, label: "million" },
    { div: 1e3, label: "mille" },
  ];
  let rest = n;
  for (const { div, label } of g) {
    const c = Math.floor(rest / div);
    rest %= div;
    if (!c) continue;
    if (label === "mille") out.push(c === 1 ? "mille" : `${frBelow1000(c)} mille`);
    else out.push(`${frBelow1000(c)} ${label}${c > 1 ? "s" : ""}`);
  }
  if (rest) out.push(frBelow1000(rest));
  return out.join(" ");
}

export function amountInWords(amount: number, lang: Lang): string {
  const dinars = Math.floor(Math.abs(amount));
  const centimes = Math.round((Math.abs(amount) - dinars) * 100);
  if (lang === "ar") {
    const head = `${arWords(dinars)} دينار جزائري`;
    return centimes ? `${head} و ${arWords(centimes)} سنتيم` : head;
  }
  const head = `${frWords(dinars)} dinars algériens`;
  return centimes ? `${head} et ${frWords(centimes)} centimes` : head;
}

/* ------------------------------- printing -------------------------------- */

export function printHTML(html: string) {
  if (typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;inset:0;width:0;height:0;border:0;opacity:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const done = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1000);
    }
  };
  if (doc.readyState === "complete") window.setTimeout(done, 60);
  else frame.onload = () => window.setTimeout(done, 60);
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const nf = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function qrHTML(content: string) {
  return `<div class="corner-qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(content)}" alt="QR code"/></div>`;
}

function qrPayload(parts: string[]) {
  return parts.filter(Boolean).join(" | ");
}

function qrSale(sale: Sale, db: DB, lang: Lang) {
  const customer = db.customers.find((c) => c.id === sale.customerId);
  return qrPayload([
    `SaleId:${sale.id}`,
    `Sale:${sale.no}`,
    `Date:${new Date(sale.date).toLocaleString(lang === "ar" ? "ar-DZ" : "fr-FR")}`,
    `Total:${nf(sale.total)} DA`,
    customer ? `Client:${customer.name}` : "",
    `Items:${sale.lines.length}`,
  ]);
}

function qrPurchase(p: Purchase, db: DB, lang: Lang) {
  const supplier = db.suppliers.find((x) => x.id === p.supplierId);
  return qrPayload([
    `PurchaseId:${p.id}`,
    `Purchase:${p.no}`,
    `Date:${new Date(p.date).toLocaleString(lang === "ar" ? "ar-DZ" : "fr-FR")}`,
    `Total:${nf(p.total)} DA`,
    supplier ? `Supplier:${supplier.name}` : "",
    `Items:${p.lines.length}`,
  ]);
}

/**
 * Printable-area geometry.
 * Thermal rolls: the paper is 58/80mm wide but printers cannot reach the
 * edges, so the content column is narrower than the roll. A4 keeps a 10mm
 * margin all around, leaving a 190mm content column.
 */
const GEOMETRY = {
  A4: { page: "A4", margin: "10mm", content: "190mm", font: "12px", grand: "16px" },
  "58mm": { page: "58mm auto", margin: "2mm", content: "50mm", font: "10px", grand: "13px" },
  "80mm": { page: "80mm auto", margin: "3mm", content: "72mm", font: "11px", grand: "14px" },
} as const;

type Paper = keyof typeof GEOMETRY;

function shell(body: string, lang: Lang, paper: Paper, title: string) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const g = GEOMETRY[paper];
  const a4 = paper === "A4";
  return `<!doctype html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: ${g.page}; margin: ${g.margin}; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    position: relative;
    min-height: 100%;
    font-family: "Cairo", "Segoe UI", Tahoma, sans-serif;
    color:#000; font-size:${g.font};
    width:${g.content}; max-width:${g.content};
    margin:0 auto;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .corner-qr {
    position:absolute;
    top:4px;
    right:4px;
    width:60px;
    height:60px;
  }
  .corner-qr img {
    width:100%;
    height:100%;
    display:block;
    object-fit:contain;
  }
  h1,h2,h3 { margin:0 0 4px; }
  .c { text-align:center; }
  .b { font-weight:800; }
  .muted { color:#555; }
  /* fixed layout keeps long item names from pushing columns off the paper */
  table { width:100%; max-width:100%; border-collapse:collapse; table-layout:fixed; }
  th,td { padding:3px 4px; text-align:start; overflow-wrap:anywhere; word-break:break-word; }
  thead { display:table-header-group; }
  tfoot { display:table-footer-group; }
  tr, .tot, .box, .sign { break-inside:avoid; page-break-inside:avoid; }
  .lines th { border-bottom:1px solid #000; font-size:${a4 ? "11px" : "10px"}; }
  .lines td { border-bottom:1px dashed #bbb; }
  .num { text-align:end; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .hr { border-top:1px dashed #000; margin:6px 0; }
  .tot { display:flex; justify-content:space-between; gap:8px; padding:2px 0; }
  .grand { font-size:${g.grand}; font-weight:900; border-top:2px solid #000; padding-top:4px; margin-top:4px; }
  .box { border:1px solid #000; padding:6px; border-radius:4px; }
  .grid2 { display:flex; gap:8px; }
  .grid2 > * { flex:1; min-width:0; }
  .words { font-style:italic; margin-top:8px; }
  .sign { margin-top:28px; display:flex; justify-content:space-between; font-size:11px; }
  /* logo slot — reserved space so the layout never shifts */
  .logo-slot { display:flex; align-items:center; justify-content:center;
    height:${a4 ? "22mm" : "14mm"}; margin-bottom:4px; }
  .logo-slot img { max-height:100%; max-width:${a4 ? "60mm" : "36mm"}; object-fit:contain; }
  .logo-slot.empty { border:1px dashed #bbb; border-radius:4px; color:#aaa; font-size:9px; }
  @media print { .logo-slot.empty { border:0; color:transparent; } }
</style></head><body>${body}</body></html>`;
}

const paperSize = (s: Settings): Paper =>
  s.printWidth === "a4" ? "A4" : s.printWidth === "58" ? "58mm" : "80mm";

/** Logo (or the reserved space for one) at the top of a document. */
function logoSlot(s: Settings, paper: Paper, lang: Lang) {
  const show = paper === "A4" || s.logoOnReceipt !== false;
  if (!show) return "";
  if (s.logo) return `<div class="logo-slot"><img src="${esc(s.logo)}" alt=""></div>`;
  return `<div class="logo-slot empty">${lang === "ar" ? "مكان الشعار" : "Logo"}</div>`;
}

function header(s: Settings, lang: Lang, paper: Paper = "80mm") {
  const L = lang === "ar";
  return `${logoSlot(s, paper, lang)}<div class="c">
    <h2 class="b">${esc(s.storeName || (L ? "المحل" : "Magasin"))}</h2>
    ${s.address || s.wilaya ? `<div class="muted">${esc([s.address, s.wilaya].filter(Boolean).join(" - "))}</div>` : ""}
    ${s.phone ? `<div class="muted">${L ? "الهاتف" : "Tél"}: ${esc(s.phone)}</div>` : ""}
    ${s.rc ? `<div class="muted">RC: ${esc(s.rc)}${s.nif ? " · NIF: " + esc(s.nif) : ""}</div>` : ""}
    ${s.nis || s.ai ? `<div class="muted">${s.nis ? "NIS: " + esc(s.nis) : ""}${s.ai ? " · AI: " + esc(s.ai) : ""}</div>` : ""}
  </div><div class="hr"></div>`;
}


export function receiptHTML(sale: Sale, db: DB, lang: Lang): string {
  const s = db.settings;
  const L = lang === "ar";
  const customer = db.customers.find((c) => c.id === sale.customerId);
  const due = saleDue(sale);
  const paper = paperSize(s);
  const body = `
  ${qrHTML(qrSale(sale, db, lang))}
  ${header(s, lang, paper)}
  <div style="display:flex;justify-content:space-between">
    <span class="b">${L ? "وصل" : "Ticket"} #${sale.no}</span>
    <span class="muted">${new Date(sale.date).toLocaleString(L ? "ar-DZ" : "fr-FR")}</span>
  </div>
  ${customer ? `<div>${L ? "الزبون" : "Client"}: ${esc(customer.name)}</div>` : ""}
  <div class="hr"></div>
  <table class="lines">
  <colgroup><col style="width:46%"><col style="width:12%"><col style="width:20%"><col style="width:22%"></colgroup>
  <thead><tr>
    <th>${L ? "المادة" : "Article"}</th><th class="num">${L ? "كمية" : "Qté"}</th>
    <th class="num">${L ? "السعر" : "PU"}</th><th class="num">${L ? "المبلغ" : "Total"}</th>
  </tr></thead><tbody>
  ${sale.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${nf(l.price)}</td><td class="num">${nf(round2(l.qty * l.price - l.discount))}</td></tr>`,
    )
    .join("")}
  </tbody></table>
  <div class="hr"></div>
  <div class="tot"><span>${L ? "المجموع" : "Sous-total"}</span><span>${nf(sale.subtotal)}</span></div>
  ${sale.discount ? `<div class="tot"><span>${L ? "تخفيض" : "Remise"}</span><span>-${nf(sale.discount)}</span></div>` : ""}
  ${sale.tva ? `<div class="tot"><span>TVA ${s.tvaRate}%</span><span>${nf(sale.tva)}</span></div>` : ""}
  ${sale.stamp ? `<div class="tot"><span>${L ? "طابع جبائي" : "Timbre"}</span><span>${nf(sale.stamp)}</span></div>` : ""}
  <div class="tot grand"><span>${L ? "الإجمالي" : "Net à payer"}</span><span>${nf(sale.total)} DA</span></div>
  <div class="tot"><span>${L ? "المدفوع" : "Payé"}</span><span>${nf(sale.paid)}</span></div>
  ${due > 0 ? `<div class="tot b"><span>${L ? "الباقي (كريدي)" : "Reste (crédit)"}</span><span>${nf(due)}</span></div>` : `<div class="tot"><span>${L ? "الصرف" : "Rendu"}</span><span>${nf(round2(sale.paid - sale.total))}</span></div>`}
  <div class="hr"></div>
  <div class="c muted">${esc(s.receiptFooter || (L ? "شكرًا على زيارتكم" : "Merci de votre visite"))}</div>`;
  return shell(body, lang, paper, `Ticket ${sale.no}`);
}

export function invoiceHTML(sale: Sale, db: DB, lang: Lang): string {
  const s = db.settings;
  const L = lang === "ar";
  const customer = db.customers.find((c) => c.id === sale.customerId);
  const body = `
  ${qrHTML(qrSale(sale, db, lang))}
  ${header(s, lang, "A4")}
  <h1 class="c">${L ? "فاتورة" : "FACTURE"} N° ${sale.no}/${new Date(sale.date).getFullYear()}</h1>
  <div class="grid2" style="margin:10px 0">
    <div class="box"><div class="b">${L ? "المورّد / البائع" : "Vendeur"}</div>
      <div>${esc(s.storeName)}</div><div class="muted">${esc(s.address)} ${esc(s.wilaya)}</div>
      <div class="muted">RC ${esc(s.rc)} · NIF ${esc(s.nif)} · AI ${esc(s.ai)}</div></div>
    <div class="box"><div class="b">${L ? "الزبون" : "Client"}</div>
      <div>${esc(customer?.name || (L ? "زبون عابر" : "Client de passage"))}</div>
      <div class="muted">${esc(customer?.phone || "")}</div>
      <div class="muted">${new Date(sale.date).toLocaleDateString(L ? "ar-DZ" : "fr-FR")}</div></div>
  </div>
  <table class="lines">
  <colgroup><col style="width:6%"><col style="width:42%"><col style="width:12%"><col style="width:20%"><col style="width:20%"></colgroup>
  <thead><tr>
    <th>#</th><th>${L ? "التعيين" : "Désignation"}</th><th class="num">${L ? "الكمية" : "Qté"}</th>
    <th class="num">${L ? "سعر الوحدة" : "P.U HT"}</th><th class="num">${L ? "المبلغ" : "Montant"}</th>
  </tr></thead><tbody>
  ${sale.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${nf(l.price)}</td><td class="num">${nf(round2(l.qty * l.price - l.discount))}</td></tr>`,
    )
    .join("")}
  </tbody></table>
  <div style="margin-top:10px;margin-inline-start:auto;width:60%">
    <div class="tot"><span>${L ? "المجموع قبل الرسم" : "Total HT"}</span><span>${nf(round2(sale.subtotal - sale.discount))}</span></div>
    ${sale.tva ? `<div class="tot"><span>TVA ${s.tvaRate}%</span><span>${nf(sale.tva)}</span></div>` : ""}
    ${sale.stamp ? `<div class="tot"><span>${L ? "الطابع الجبائي 1%" : "Timbre fiscal 1%"}</span><span>${nf(sale.stamp)}</span></div>` : ""}
    <div class="tot grand"><span>${L ? "المبلغ الإجمالي" : "Total TTC"}</span><span>${nf(sale.total)} DA</span></div>
  </div>
  <div class="words">${L ? "أوقفت هذه الفاتورة على مبلغ" : "Arrêtée la présente facture à la somme de"}: <span class="b">${esc(amountInWords(sale.total, lang))}</span></div>
  <div class="muted" style="margin-top:6px">${L ? "طريقة الدفع" : "Mode de paiement"}: ${esc(sale.method)}</div>
  <div class="sign"><span>${L ? "توقيع الزبون" : "Signature client"}</span><span>${L ? "توقيع وختم المحل" : "Cachet et signature"}</span></div>`;
  return shell(body, lang, "A4", `Facture ${sale.no}`);
}

export function purchaseHTML(p: Purchase, db: DB, lang: Lang): string {
  const L = lang === "ar";
  const supplier = db.suppliers.find((x) => x.id === p.supplierId);
  const body = `
  ${qrHTML(qrPurchase(p, db, lang))}
  ${header(db.settings, lang, "A4")}
  <h1 class="c">${L ? "فاتورة شراء" : "Bon d'achat"} N° ${p.no}</h1>
  <div>${L ? "الممون" : "Fournisseur"}: <span class="b">${esc(supplier?.name || "-")}</span> · ${new Date(p.date).toLocaleDateString(L ? "ar-DZ" : "fr-FR")}</div>
  <table class="lines" style="margin-top:8px">
  <colgroup><col style="width:6%"><col style="width:44%"><col style="width:12%"><col style="width:19%"><col style="width:19%"></colgroup>
  <thead><tr>
    <th>#</th><th>${L ? "المادة" : "Article"}</th><th class="num">${L ? "الكمية" : "Qté"}</th>
    <th class="num">${L ? "سعر الشراء" : "P.A"}</th><th class="num">${L ? "المجموع" : "Total"}</th>
  </tr></thead><tbody>
  ${p.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${nf(l.buy)}</td><td class="num">${nf(round2(l.qty * l.buy))}</td></tr>`,
    )
    .join("")}
  </tbody></table>
  <div class="tot grand"><span>${L ? "الإجمالي" : "Total"}</span><span>${nf(p.total)} DA</span></div>
  <div class="tot"><span>${L ? "المدفوع" : "Payé"}</span><span>${nf(p.paid)}</span></div>
  <div class="tot b"><span>${L ? "الباقي" : "Reste"}</span><span>${nf(round2(p.total - p.paid))}</span></div>`;
  return shell(body, lang, "A4", `Achat ${p.no}`);
}

export function zReportHTML(
  db: DB,
  lang: Lang,
  data: {
    from: string;
    to: string;
    sales: number;
    cash: number;
    credit: number;
    expenses: number;
    profit: number;
    count: number;
    opening: number;
    counted?: number;
  },
): string {
  const L = lang === "ar";
  const rows: [string, number][] = [
    [L ? "عدد الوصولات" : "Nombre de tickets", data.count],
    [L ? "رصيد البداية" : "Fond de caisse", data.opening],
    [L ? "المبيعات" : "Ventes", data.sales],
    [L ? "نقدًا" : "Espèces", data.cash],
    [L ? "كريدي" : "Crédit", data.credit],
    [L ? "المصاريف" : "Dépenses", data.expenses],
    [L ? "الربح الصافي" : "Bénéfice net", data.profit],
  ];
  const expected = round2(data.opening + data.cash - data.expenses);
  const body = `${header(db.settings, lang, paperSize(db.settings))}
  <h2 class="c">${L ? "تقرير غلق الصندوق" : "Rapport de caisse (Z)"}</h2>
  <div class="c muted">${data.from} → ${data.to}</div><div class="hr"></div>
  ${rows.map(([k, v]) => `<div class="tot"><span>${esc(k)}</span><span>${nf(v)}</span></div>`).join("")}
  <div class="tot grand"><span>${L ? "المتوقع في الصندوق" : "Espèces attendues"}</span><span>${nf(expected)} DA</span></div>
  ${data.counted !== undefined ? `<div class="tot"><span>${L ? "المحصى" : "Compté"}</span><span>${nf(data.counted)}</span></div>
  <div class="tot b"><span>${L ? "الفارق" : "Écart"}</span><span>${nf(round2(data.counted - expected))}</span></div>` : ""}
  <div class="sign"><span>${L ? "توقيع المسؤول" : "Signature"}</span><span></span></div>`;
  return shell(body, lang, paperSize(db.settings), "Z report");
}

/** Simple Code128-free barcode label sheet (text + human-readable code). */
export function labelsHTML(
  items: { name: string; barcode: string; price: number; ref?: string }[],
  db: DB,
  lang: Lang,
): string {
  const body = `<div style="display:flex;flex-wrap:wrap;gap:4mm">
  ${items
    .map(
      (i) => `<div class="box c" style="width:45mm">
      <div class="b" style="font-size:11px">${esc(db.settings.storeName)}</div>
      <div style="font-size:12px">${esc(i.name)}</div>
      ${i.ref ? `<div style="font-family:monospace;font-size:9px;color:#444">${esc(i.ref)}</div>` : ""}
      <div class="b" style="font-size:15px">${nf(i.price)} DA</div>
      <div style="margin-top:1mm">${barcodeSVG(i.barcode, { module: 0.24, height: 8 })}</div>
    </div>`,
    )
    .join("")}
  </div>`;
  return shell(body, lang, "A4", "Labels");
}

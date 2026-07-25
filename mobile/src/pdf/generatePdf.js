import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { companyFor } from './companyProfiles';
import { ticketNo } from '../lib/requests';
import { serviceName } from '../data/services';

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}
function today() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function letterheadHtml(co) {
  if (co.logo) {
    return `<img src="${co.logo}" style="max-height:74px;max-width:280px;object-fit:contain" />`;
  }
  // Text fallback until the real logo image is supplied.
  return `
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:52px;height:52px;border-radius:10px;background:${co.accent};color:#fff;
                  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:24px">DE</div>
      <div>
        <div style="font-size:19px;font-weight:800;color:${co.accent};line-height:1.1">${esc(co.name)}</div>
        <div style="font-size:11px;color:#5C6B82;margin-top:2px">${esc(co.tagline)}</div>
      </div>
    </div>`;
}

function buildHtml({ req, docType }) {
  const co = companyFor(req.letterhead);
  const quote = req.quote || {};
  const items = quote.items || [];
  const isInvoice = docType === 'invoice';
  const title = isInvoice ? 'TAX INVOICE' : 'QUOTATION';
  const numberLabel = isInvoice ? 'Invoice No.' : 'Quotation No.';

  const rows = items.map((it, i) => {
    const amount = it.amount != null ? it.amount : (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(it.description || '')}</td>
        <td class="c">${esc(it.unit || '-')}</td>
        <td class="c">${esc(it.duration || '-')}</td>
        <td class="c">${esc(it.qty != null ? it.qty : '')}</td>
        <td class="r">${fmt(it.unitPrice)}</td>
        <td class="r">${fmt(amount)}</td>
      </tr>`;
  }).join('');

  const validity = quote.validity || '30';
  const payment = quote.paymentTerms || '30 DAYS';
  const delivery = quote.deliveryTerms || '2-3 Days after confirmation';
  const remarks = quote.remarks || 'Job will commence only after receiving LPO/Approval.';

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    * { box-sizing:border-box; }
    body { font-family:-apple-system, 'Helvetica Neue', Arial, sans-serif; color:#122142; margin:0; padding:28px 30px; font-size:12px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${co.accent}; padding-bottom:14px; }
    .title { text-align:right; }
    .title h1 { margin:0; font-size:24px; letter-spacing:1px; color:${co.accent}; }
    .meta { margin-top:6px; font-size:11px; color:#5C6B82; }
    .contact { font-size:10.5px; color:#5C6B82; margin-top:8px; }
    .parties { display:flex; justify-content:space-between; margin:18px 0 8px; gap:20px; }
    .parties .box { flex:1; background:#F5F8FC; border:1px solid #D8E3F0; border-radius:8px; padding:10px 12px; }
    .parties .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#7C8798; margin-bottom:4px; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th { background:${co.accent}; color:#fff; font-size:10.5px; text-transform:uppercase; letter-spacing:.3px; padding:8px 8px; text-align:left; }
    td { border-bottom:1px solid #E4DDCB; padding:8px 8px; font-size:11.5px; vertical-align:top; }
    td.c, th.c { text-align:center; } td.r, th.r { text-align:right; }
    .totals { width:260px; margin-left:auto; margin-top:12px; }
    .totals div { display:flex; justify-content:space-between; padding:5px 0; }
    .totals .net { border-top:2px solid ${co.accent}; margin-top:4px; padding-top:8px; font-weight:800; font-size:14px; color:${co.accent}; }
    .terms { margin-top:22px; border-top:1px solid #D8E3F0; padding-top:12px; }
    .terms h3 { font-size:12px; margin:0 0 6px; color:${co.accent}; }
    .terms div { font-size:11px; margin:3px 0; }
    .foot { margin-top:26px; border-top:1px solid #D8E3F0; padding-top:10px; font-size:10px; color:#7C8798; text-align:center; }
  </style></head><body>
    <div class="top">
      <div>${letterheadHtml(co)}</div>
      <div class="title">
        <h1>${title}</h1>
        <div class="meta">${numberLabel} <b>${esc(ticketNo(req))}</b></div>
        <div class="meta">Date: ${today()}</div>
      </div>
    </div>
    <div class="contact">${esc(co.address)} &nbsp;•&nbsp; ${esc(co.phone)} &nbsp;•&nbsp; ${esc(co.email)} &nbsp;•&nbsp; ${esc(co.web)}</div>

    <div class="parties">
      <div class="box">
        <div class="lbl">Bill To</div>
        <div>${esc(req.userEmail || '—')}</div>
        <div>${esc(req.contactPhone || req.userPhone || '')}</div>
        ${req.siteLocation ? `<div>${esc(req.siteLocation)}</div>` : ''}
      </div>
      <div class="box">
        <div class="lbl">Service</div>
        <div><b>${esc(serviceName(req.service))}</b></div>
        ${req.equipmentType ? `<div>${esc(req.equipmentType)}${req.model ? ' — ' + esc(req.model) : ''}</div>` : ''}
      </div>
    </div>

    <table>
      <thead><tr>
        <th class="c">#</th><th>Description</th><th class="c">Unit</th><th class="c">Duration</th>
        <th class="c">Qty</th><th class="r">Rate (AED)</th><th class="r">Amount (AED)</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#7C8798">No line items</td></tr>'}</tbody>
    </table>

    <div class="totals">
      <div><span>Gross</span><span>AED ${fmt(quote.subtotal)}</span></div>
      <div><span>VAT ${Math.round((quote.vatRate ?? 0.05) * 100)}%</span><span>AED ${fmt(quote.vat)}</span></div>
      <div class="net"><span>Net Total</span><span>AED ${fmt(quote.total)}</span></div>
    </div>

    <div class="terms">
      <h3>Terms &amp; Conditions</h3>
      <div><b>Validity:</b> ${esc(validity)} Days</div>
      <div><b>Payment Terms:</b> ${esc(payment)}</div>
      <div><b>Delivery:</b> ${esc(delivery)}</div>
      <div><b>Remarks:</b> ${esc(remarks)}</div>
    </div>

    <div class="foot">${esc(co.name)} &nbsp;•&nbsp; ${esc(co.phone)} &nbsp;•&nbsp; ${esc(co.email)}<br/>This is a computer-generated document.</div>
  </body></html>`;
}

// Generates the PDF and opens the share/save sheet. docType: 'quote' | 'invoice'.
export async function generateQuotePdf(req, docType = 'quote') {
  const html = buildHtml({ req, docType });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: docType === 'invoice' ? 'Invoice' : 'Quotation',
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

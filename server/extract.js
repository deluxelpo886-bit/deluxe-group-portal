'use strict';

// PDF field extraction using the Anthropic API.
//
// The PDF is sent to Claude natively as a base64 `document` block (Claude reads
// text and scanned/image PDFs directly - no server-side PDF text library
// needed). A single forced tool call returns the structured fields so we get
// reliable, schema-shaped output instead of free-form text.
//
// The API key comes from the ANTHROPIC_API_KEY environment variable (read
// automatically by the SDK) - never hardcoded. If the key is missing, or the
// API call fails, extraction degrades gracefully: the caller receives empty
// fields and the user fills the form manually.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';

const LPO_TOOL = {
  name: 'record_lpo_fields',
  description: 'Record the structured fields extracted from a Local Purchase Order (LPO) document.',
  input_schema: {
    type: 'object',
    properties: {
      lpo_number: { type: ['string', 'null'], description: 'The LPO / purchase order number' },
      client_name: { type: ['string', 'null'], description: 'The client or company the LPO is issued to' },
      site: { type: ['string', 'null'], description: 'Site or project name' },
      issue_date: { type: ['string', 'null'], description: 'Issue date in YYYY-MM-DD format' },
      expiry_date: { type: ['string', 'null'], description: 'Expiry / valid-until date in YYYY-MM-DD format' },
      amount: { type: ['number', 'null'], description: 'Total amount as a plain number, no currency symbol or separators' }
    }
  }
};

const INVOICE_TOOL = {
  name: 'record_invoice_fields',
  description: 'Record the structured fields extracted from an invoice document.',
  input_schema: {
    type: 'object',
    properties: {
      invoice_number: { type: ['string', 'null'], description: 'The invoice number' },
      date: { type: ['string', 'null'], description: 'Invoice date in YYYY-MM-DD format' },
      lpo_reference: { type: ['string', 'null'], description: 'The referenced LPO / purchase order number, if any' },
      amount: { type: ['number', 'null'], description: 'Total amount as a plain number, no currency symbol or separators' }
    }
  }
};

const SERVICE_CARD_TOOL = {
  name: 'record_service_card',
  description: 'Record the structured fields read from a photographed generator SERVICE CARD (Deluxe Heavy Equipment / Deluxe Energy). The card has handwritten values.',
  input_schema: {
    type: 'object',
    properties: {
      dg: { type: ['string', 'null'], description: 'The equipment / generator number, e.g. "DG-520". Normalise to the form DG-<number> in uppercase.' },
      date: { type: ['string', 'null'], description: 'The maintenance/service date in YYYY-MM-DD format. Cards often write it as D.M.YY or D/M/26 - interpret 2-digit years in the 2020s.' },
      hours: { type: ['number', 'null'], description: 'The current running-hours reading at service, as a plain number (the big handwritten hours figure, not the "+350").' },
      technician: { type: ['string', 'null'], description: 'The name(s) written after "Maintained by", e.g. "IK & JAYARAJ".' },
      oil: { type: ['boolean', 'null'], description: 'true if the Oil box is ticked/checked, false if crossed (X) or blank.' },
      oilFilter: { type: ['boolean', 'null'], description: 'true if the Oil Filter box is ticked, false if crossed (X) or blank.' },
      fuelFilter: { type: ['boolean', 'null'], description: 'true if the Fuel Filter box is ticked, false if crossed (X) or blank.' },
      airFilter: { type: ['boolean', 'null'], description: 'true if the Air Filter box is ticked, false if crossed (X) or blank.' },
      nextService: { type: ['number', 'null'], description: 'The "Next Service due on" hours figure if written, as a plain number.' }
    }
  }
};

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
}

// Read a photographed service card (JPEG/PNG image buffer) and return the
// structured fields for the frontend to pre-fill. Same graceful-degradation
// contract as extractFields: { ok, fields, message? }. A tick vs an X on the
// four filters is exactly what the office otherwise re-types by hand.
async function extractServiceCard(imageBuffer, mediaType) {
  const client = getClient();
  if (!client) {
    return { ok: false, fields: {}, message: 'AI extraction not configured (ANTHROPIC_API_KEY is not set)' };
  }
  const mt = (mediaType === 'image/png' || mediaType === 'image/webp' || mediaType === 'image/gif')
    ? mediaType : 'image/jpeg';
  const b64 = imageBuffer.toString('base64');

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [SERVICE_CARD_TOOL],
    tool_choice: { type: 'tool', name: SERVICE_CARD_TOOL.name },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } },
        {
          type: 'text',
          text: 'This is a photo of a generator service card with handwritten entries. Read it and record the fields with the ' +
            SERVICE_CARD_TOOL.name + ' tool. Pay careful attention to the four filter boxes (Oil, Oil Filter, Fuel Filter, ' +
            'Air Filter): a tick/check means true, a cross (X) or blank means false. For any field you cannot confidently ' +
            'read, set it to null - do not guess. The date must be YYYY-MM-DD.'
        }
      ]
    }]
  });

  const block = (resp.content || []).find(function (b) { return b.type === 'tool_use'; });
  const raw = (block && block.input) || {};
  const fields = {};
  Object.keys(raw).forEach(function (k) {
    const v = raw[k];
    // Keep booleans (including false) and real values; drop only null/undefined/''.
    if (v !== null && v !== undefined && v !== '') fields[k] = v;
  });
  return { ok: true, fields: fields };
}

// Returns { ok: boolean, fields: {...}, message?: string }.
// Only fields Claude could actually find are included; missing ones are omitted
// so the frontend leaves them blank.
async function extractFields(type, pdfBuffer) {
  const client = getClient();
  if (!client) {
    return { ok: false, fields: {}, message: 'AI extraction not configured (ANTHROPIC_API_KEY is not set)' };
  }

  const tool = type === 'lpo' ? LPO_TOOL : INVOICE_TOOL;
  const wanted = type === 'lpo'
    ? 'the LPO number, client/company name, site or project name, issue date, expiry date, and total amount'
    : 'the invoice number, invoice date, referenced LPO number, and total amount';

  const b64 = pdfBuffer.toString('base64');

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        {
          type: 'text',
          text: 'Extract ' + wanted + ' from this document and record it with the ' + tool.name +
            ' tool. For any field you cannot confidently find, set it to null - do not guess. ' +
            'Dates must be formatted as YYYY-MM-DD. Amounts must be a plain number with no currency symbol or thousands separators.'
        }
      ]
    }]
  });

  const block = (resp.content || []).find(function (b) { return b.type === 'tool_use'; });
  const raw = (block && block.input) || {};

  const fields = {};
  Object.keys(raw).forEach(function (k) {
    const v = raw[k];
    if (v !== null && v !== undefined && v !== '') fields[k] = v;
  });

  return { ok: true, fields: fields };
}

module.exports = { extractFields, extractServiceCard };

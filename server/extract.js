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

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
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

module.exports = { extractFields };

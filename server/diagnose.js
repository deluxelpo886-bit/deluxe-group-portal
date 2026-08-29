'use strict';

// Control-panel photo diagnosis using the Anthropic API (vision).
//
// A photo of a generator controller (DeepSea, ComAp, PowerWizard, SmartGen,
// Datakom, etc.) is sent to Claude as a base64 image block. A single forced
// tool call returns a structured diagnosis: what the panel shows, the likely
// fault and causes, how serious it is, what the team should check/bring, and a
// plain-English message the office can forward straight to the customer.
//
// The API key comes from the ANTHROPIC_API_KEY environment variable (read
// automatically by the SDK) - never hardcoded. If the key is missing or the API
// call fails, the caller degrades gracefully so the user can still log the
// breakdown manually.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';

const DIAGNOSIS_TOOL = {
  name: 'record_diagnosis',
  description: 'Record a structured diagnosis of a generator control panel from its photo.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'True if the panel/display is clear enough to read something useful.' },
      controller: { type: ['string', 'null'], description: 'The controller make/model if identifiable (e.g. "DeepSea 7320", "ComAp InteliLite", "SmartGen HGM6120"), else null.' },
      panel_reading: { type: ['string', 'null'], description: 'Exactly what is shown on the screen - alarm text, fault code, warning lamp, and any numbers (volts, Hz, oil pressure, temp, battery). Quote the on-screen words verbatim where possible.' },
      severity: { type: 'string', enum: ['shutdown', 'warning', 'info', 'unknown'], description: 'shutdown = engine tripped/locked out, warning = running but flagged, info = normal/status only, unknown = cannot tell.' },
      safe_to_run: { type: 'string', enum: ['no', 'caution', 'yes', 'unknown'], description: 'Whether the set should keep running before a technician checks it.' },
      fault_summary: { type: 'string', description: 'One or two plain sentences naming the most likely problem.' },
      likely_causes: {
        type: 'array',
        description: 'Ranked most-likely first. Keep to 2-4 items.',
        items: {
          type: 'object',
          properties: {
            cause: { type: 'string', description: 'The suspected cause.' },
            check: { type: 'string', description: 'How the technician confirms or rules it out on site.' }
          },
          required: ['cause', 'check']
        }
      },
      technician_actions: { type: 'array', items: { type: 'string' }, description: 'Concrete first steps / parts or tools to bring.' },
      customer_message: { type: 'string', description: 'A short, polite, non-technical message the office can send the customer explaining what is wrong and the next step. No jargon, no fault codes unless helpful. Do not promise a specific time.' }
    },
    required: ['readable', 'severity', 'safe_to_run', 'fault_summary', 'likely_causes', 'technician_actions', 'customer_message']
  }
};

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
}

// mediaType: e.g. 'image/jpeg' | 'image/png'. context: optional { dg, location }.
// Returns { ok, diagnosis } or { ok:false, message }.
async function diagnosePanel(imageBuffer, mediaType, context) {
  const client = getClient();
  if (!client) {
    return { ok: false, message: 'AI diagnosis not configured (ANTHROPIC_API_KEY is not set)' };
  }
  const mt = (mediaType && /^image\/(jpeg|png|webp|gif)$/.test(mediaType)) ? mediaType : 'image/jpeg';
  const ctx = context || {};
  const ctxLine = [ctx.dg ? ('Generator: ' + ctx.dg) : '', ctx.location ? ('Site: ' + ctx.location) : '']
    .filter(Boolean).join(' · ');

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    tools: [DIAGNOSIS_TOOL],
    tool_choice: { type: 'tool', name: DIAGNOSIS_TOOL.name },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mt, data: imageBuffer.toString('base64') } },
        {
          type: 'text',
          text: 'You are a senior diesel-generator service engineer for a rental fleet in Abu Dhabi. '
            + 'This photo is of a generator control panel that a customer or driver reported as a breakdown. '
            + (ctxLine ? ('Context: ' + ctxLine + '. ') : '')
            + 'Read the display carefully - identify the controller if you can, quote the exact alarm/fault text and any '
            + 'readings (voltage, frequency, oil pressure, coolant temp, battery, hours), and work out the most likely '
            + 'problem and how the team confirms it on site. Common shutdowns on these sets are low oil pressure, high '
            + 'coolant temperature, overspeed, under/over voltage or frequency, fail to start, low fuel, charge alternator '
            + 'failure and emergency stop. If the picture is blurry or the screen is off/unreadable, set readable=false and '
            + 'say what a clearer photo should capture. Never invent a fault code you cannot actually see. '
            + 'Record everything with the ' + DIAGNOSIS_TOOL.name + ' tool. The customer_message must be plain and reassuring, '
            + 'with no jargon and no invented timings.'
        }
      ]
    }]
  });

  const block = (resp.content || []).find(function (b) { return b.type === 'tool_use'; });
  if (!block || !block.input) {
    return { ok: false, message: 'Could not read the panel - please try a clearer photo.' };
  }
  return { ok: true, diagnosis: block.input };
}

module.exports = { diagnosePanel };

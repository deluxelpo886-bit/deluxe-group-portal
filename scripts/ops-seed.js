#!/usr/bin/env node
'use strict';

// Seed Deluxe Ops with demo data so the app is populated on first open.
//
//   npm run ops-seed           # seed only if empty (safe to run once)
//   npm run ops-seed -- --reset  # wipe demo data + demo users, then reseed
//
// Creates demo logins (admin / ops head / technicians), a mixed fleet across
// both companies, jobs covering all four pipelines at various stages, and a
// daily service feed tuned to show every countdown-ring colour.

const { db, findUser } = require('../server/db');
const ops = require('../server/ops-db');

const RESET = process.argv.includes('--reset');

const DEMO_USERS = [
  { username: 'opsadmin', password: 'Deluxe@123', role: 'admin', displayName: 'Operations Admin' },
  { username: 'sara', password: 'demo1234', role: 'ops_head', displayName: 'Sara (Ops Head)' },
  { username: 'rahul', password: 'demo1234', role: 'technician', displayName: 'Rahul Kumar' },
  { username: 'imran', password: 'demo1234', role: 'technician', displayName: 'Imran Q.' },
  { username: 'joseph', password: 'demo1234', role: 'technician', displayName: 'Joseph M.' }
];

const DEMO_GENERATORS = [
  { dg_number: 'DG-114', kva: 500, company: 'heavy', status: 'on_rent', client: 'ADNOC', location: 'Al Reem Island' },
  { dg_number: 'DG-220', kva: 250, company: 'energy', status: 'breakdown', client: 'Emirates Steel', location: 'Musaffah' },
  { dg_number: 'DG-330', kva: 1000, company: 'heavy', status: 'workshop', client: '', location: 'Deluxe Workshop' },
  { dg_number: 'DG-410', kva: 400, company: 'energy', status: 'on_rent', client: 'Aldar', location: 'Yas Island' },
  { dg_number: 'DG-512', kva: 750, company: 'heavy', status: 'outside', client: 'NPCC', location: 'Al Habtoor Motors' },
  { dg_number: 'DG-088', kva: 150, company: 'energy', status: 'on_rent', client: 'Etihad', location: 'Khalifa City' }
];

// [type, dg, tech, targetStage, extra]
const DEMO_JOBS = [
  ['scheduled', 'DG-114', 'rahul', 'En Route', { title: 'Monthly 250h service' }],
  ['breakdown', 'DG-220', 'rahul', 'Reported', { title: 'Generator will not start' }],
  ['breakdown', 'DG-088', 'imran', 'On Site', { title: 'Overheating alarm' }],
  ['workshop', 'DG-330', 'joseph', 'Diagnosis', { title: 'Alternator noise investigation' }],
  ['outside', 'DG-512', 'joseph', 'With Vendor', { title: 'Control panel rebuild', vendor: 'Al Habtoor Motors' }],
  ['scheduled', 'DG-410', 'imran', 'On Site', { title: 'Quarterly inspection' }]
];

// dg -> days remaining (chosen to exercise every ring colour)
const DEMO_SERVICE_DUE = {
  'DG-114': 1,   // red + pulsing (due tomorrow)
  'DG-088': 3,   // red
  'DG-410': 6,   // gold
  'DG-330': 12,  // green
  'DG-220': 0    // due today
};

function reset() {
  db.exec('DELETE FROM ops_job_events; DELETE FROM ops_jobs; DELETE FROM ops_generators; DELETE FROM ops_service_due;');
  const names = DEMO_USERS.map((u) => u.username);
  const placeholders = names.map(() => '?').join(',');
  db.prepare('DELETE FROM users WHERE username IN (' + placeholders + ')').run(...names);
  console.log('Demo data reset.');
}

function main() {
  if (RESET) reset();

  const already = ops.listGenerators().length;
  if (already && !RESET) {
    console.log('Fleet already has ' + already + ' generator(s); nothing seeded. Use `npm run ops-seed -- --reset` to reseed.');
    return;
  }

  DEMO_USERS.forEach((u) => {
    if (findUser(u.username)) { ops.setUserRole(u.username, u.role, u.displayName); }
    else ops.createOpsUser(u.username, u.password, u.role, u.displayName);
  });

  const genByDg = {};
  DEMO_GENERATORS.forEach((g) => {
    const existing = ops.getGeneratorByDg(g.dg_number);
    genByDg[g.dg_number] = existing || ops.createGenerator(g);
  });

  DEMO_JOBS.forEach(([type, dg, tech, stage, extra]) => {
    const gen = genByDg[dg];
    const job = ops.createJob(Object.assign({
      type, company: gen.company, generator_id: gen.id, assigned_tech: tech,
      client: gen.client, location: gen.location
    }, extra), 'opsadmin');
    if (stage && stage !== job.stage) ops.setJobStage(job.id, stage, 'opsadmin');
  });

  Object.keys(DEMO_SERVICE_DUE).forEach((dg) => {
    const gen = genByDg[dg];
    ops.upsertServiceDue(dg, DEMO_SERVICE_DUE[dg], gen && gen.company, 'sara');
  });

  console.log('\nDeluxe Ops demo data seeded:');
  console.log('  ' + DEMO_GENERATORS.length + ' generators, ' + DEMO_JOBS.length + ' jobs, ' +
    Object.keys(DEMO_SERVICE_DUE).length + ' service-due entries.');
  console.log('\nDemo logins (open /ops):');
  DEMO_USERS.forEach((u) => console.log('  ' + u.role.padEnd(10) + u.username + ' / ' + u.password + '   (' + u.displayName + ')'));
  console.log('\nTip: sign in as "rahul" to see the technician alarm-clock view with a ringing breakdown and a due-tomorrow countdown.');
}

main();

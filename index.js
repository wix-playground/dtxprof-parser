#!/usr/bin/env node

const sqlite = require('sqlite3');
const {ArgumentParser} = require('argparse');
const package = require('./package.json');
const fs = require('fs');
const path = require('path');

var parser = new ArgumentParser({
  version: package.version,
  addHelp:true,
  description: 'dtxprof-parser -p MyProfile.dtxprof',
});

parser.addArgument(
  [ '-p', '--profile' ],
  {
    required: true,
    help: 'Detox instruments profile file'
  }
);

parser.addArgument(
  [ '-s', '--startEvent' ],
  {
    action: 'append',
    help: 'Find first event and output it\'s start time'
  }
);

parser.addArgument(
  [ '-d', '--durationEvent' ],
  {
    action: 'append',
    help: 'Find first event and output it\'s duration'
  }
);

parser.addArgument(
  [ '-o', '--output' ],
  {
    help: 'Output to file (json, append)'
  }
);


const args = parser.parseArgs();
const dbPath = path.join(args.profile, '_dtx_recording.sqlite');

if (!fs.existsSync(args.profile)) {
  throw new Error(`${args.profile} does not exists`);
}

if (!fs.existsSync(dbPath)) {
  throw new Error(`${dbPath} does not exists`);
}

var db = new sqlite.Database(dbPath);

db.serialize(async () => {

  const [DTXRoot, DTXRootMore] = await toAsync(
    db.all.bind(db),
    "select ZTIMESTAMP, ZDURATION1 from ZSAMPLE where ZNAME1 = 'DTXRoot'"
  );

  if (DTXRootMore) {
    throw new Error('DTXRoot must be uniq');
  }

  const result = {};

  await Promise.all((args.startEvent || []).map(eventName => (async () => {
    const event = await getFirst(eventName);
    result[`${eventName}Start`] = event.ZTIMESTAMP - DTXRoot.ZTIMESTAMP;
  })()));

  await Promise.all((args.durationEvent || []).map(eventName => (async () => {
    const event = await getFirst(eventName);
    result[`${eventName}Duration`] = event.ZDURATION1;
  })()));

  console.log(result)

  if (args.output) {
    let content = [];
    try {
      content = JSON.parse(fs.readFileSync(args.output));
    } catch(err) {
      console.log(err)
    }
    content.push(result);
    fs.writeFileSync(args.output, JSON.stringify(content, undefined, '  '));
  }

  db.close();
});

async function getFirst(eventName) {
  const [first] = await toAsync(
    db.all.bind(db),
    `select ZTIMESTAMP, ZDURATION1 from ZSAMPLE where ZNAME = '${eventName}' ORDER BY ZTIMESTAMP LIMIT 2;`
  );
  return first;
}

function toAsync (fn, cmnd) {
  return new Promise((resolve, reject) => {
    fn(cmnd, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    })
  });
}


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

  const [firstJSEval] = await toAsync(
    db.all.bind(db),
    "select ZTIMESTAMP, ZDURATION1 from ZSAMPLE where ZNAME = 'JSEvaluateScript' ORDER BY ZTIMESTAMP LIMIT 5;"
  );

  const [requreEvent, requreEventMore] = await toAsync(
    db.all.bind(db),
    "select ZTIMESTAMP, ZDURATION1 from ZSAMPLE where ZNAME = 'RequireInitialModules' ORDER BY ZTIMESTAMP LIMIT 5;"
  );

  if (requreEventMore) {
    throw new Error('RequireInitialModules must be uniq');
  }

  console.log({
    firstJSEval: firstJSEval.ZTIMESTAMP - DTXRoot.ZTIMESTAMP,
    indexJs: requreEvent.ZTIMESTAMP - DTXRoot.ZTIMESTAMP,
    requireDuration: requreEvent.ZDURATION1,
    totalJS: requreEvent.ZTIMESTAMP + requreEvent.ZDURATION1 - DTXRoot.ZTIMESTAMP,
  })

  db.close();
});


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

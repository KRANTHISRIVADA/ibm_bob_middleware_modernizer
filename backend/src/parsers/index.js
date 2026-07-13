'use strict';
const path = require('path');
const apicParser = require('./apicParser');
const datapowerParser = require('./datapowerParser');
const iibAceParser = require('./iibAceParser');

async function parseSource(jobId, sourcePlatform, filePath) {
  switch (sourcePlatform) {
    case 'APIC': return apicParser.parse(filePath);
    case 'DATAPOWER': return await datapowerParser.parse(filePath);
    case 'IIB_ACE': return await iibAceParser.parse(filePath);
    default: throw new Error(`Unknown source platform: ${sourcePlatform}`);
  }
}

module.exports = { parseSource };

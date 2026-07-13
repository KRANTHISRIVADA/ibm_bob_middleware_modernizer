'use strict';
/**
 * IIB/ACE Parser — extracts metadata from IBM Integration Bus / App Connect Enterprise project ZIPs.
 * Parses .msgflow, .esql, .xsd, .wsdl, .map, .properties files.
 */
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const path = require('path');

async function parse(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  const result = {
    sourcePlatform: 'IIB_ACE',
    messageFlows: [],
    esqlModules: [],
    schemas: [],
    mappings: [],
    wsdlServices: [],
    properties: {},
    endpoints: [],
  };

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.toLowerCase();
    const ext = path.extname(name);
    const content = entry.getData().toString('utf8');

    if (ext === '.msgflow') {
      try {
        const parsed = await xml2js.parseStringPromise(content, { explicitArray: false });
        result.messageFlows.push(parseMessageFlow(entry.entryName, parsed));
      } catch (_) {}
    } else if (ext === '.esql') {
      result.esqlModules.push({ file: entry.entryName, content, modules: extractESQLModules(content) });
    } else if (ext === '.xsd') {
      result.schemas.push({ file: entry.entryName, content });
    } else if (ext === '.wsdl') {
      try {
        const parsed = await xml2js.parseStringPromise(content, { explicitArray: false });
        result.wsdlServices.push(parseWSDL(entry.entryName, parsed));
      } catch (_) {}
    } else if (ext === '.map' || name.includes('.graphical_mapping')) {
      result.mappings.push({ file: entry.entryName, content });
    } else if (ext === '.properties' || name.endsWith('overrides.properties') || name.endsWith('project.properties')) {
      parseProperties(content, result.properties);
      extractEndpointsFromProperties(content, result.endpoints);
    }
  }

  return result;
}

function parseMessageFlow(filename, doc) {
  const flow = { file: filename, nodes: [], connections: [] };
  try {
    const mf = doc['PseudoBrokerApplication'] || doc['MessageFlow'] || doc;
    // Nodes
    const nodes = getFlat(mf, 'ComIbmMQInputNode')
      .concat(getFlat(mf, 'ComIbmHTTPInputNode'))
      .concat(getFlat(mf, 'ComIbmHTTPReplyNode'))
      .concat(getFlat(mf, 'ComIbmMQOutputNode'))
      .concat(getFlat(mf, 'ComIbmComputeNode'))
      .concat(getFlat(mf, 'ComIbmXSLTransformNode'))
      .concat(getFlat(mf, 'ComIbmMapping_NodeNode'))
      .concat(getFlat(mf, 'ComIbmSOAPInputNode'))
      .concat(getFlat(mf, 'ComIbmSOAPRequestNode'));

    flow.nodes = nodes.map(n => ({
      type: n['$']?.['xsi:type'] || 'Unknown',
      name: n['$']?.name || '',
      queueName: n['$']?.queueName || null,
      endpointURL: n['$']?.endpointURL || null,
    }));
  } catch (_) {}
  return flow;
}

function getFlat(obj, key) {
  if (!obj) return [];
  const found = [];
  function recurse(o) {
    if (Array.isArray(o)) { o.forEach(recurse); return; }
    if (typeof o === 'object' && o !== null) {
      if (key in o) { const v = o[key]; Array.isArray(v) ? v.forEach(i => found.push(i)) : found.push(v); }
      Object.values(o).forEach(recurse);
    }
  }
  recurse(obj);
  return found;
}

function extractESQLModules(content) {
  const modulePattern = /CREATE\s+(COMPUTE|FILTER|DATABASE|PROCEDURE|FUNCTION)\s+MODULE\s+(\w+)/gi;
  const modules = [];
  let m;
  while ((m = modulePattern.exec(content)) !== null) {
    modules.push({ type: m[1], name: m[2] });
  }
  return modules;
}

function parseWSDL(filename, doc) {
  const wsdl = doc['wsdl:definitions'] || doc['definitions'] || {};
  return {
    file: filename,
    targetNamespace: wsdl['$']?.targetNamespace || '',
    services: Object.keys(wsdl['wsdl:service'] || wsdl['service'] || {}),
    portTypes: Object.keys(wsdl['wsdl:portType'] || wsdl['portType'] || {}),
  };
}

function parseProperties(content, target) {
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const sep = line.indexOf('=');
      if (sep > 0) {
        const k = line.substring(0, sep).trim();
        const v = line.substring(sep + 1).trim();
        target[k] = v;
      }
    }
  });
}

function extractEndpointsFromProperties(content, endpoints) {
  const urlPattern = /https?:\/\/[^\s'"]+/gi;
  let m;
  while ((m = urlPattern.exec(content)) !== null) {
    if (!endpoints.includes(m[0])) endpoints.push(m[0]);
  }
}

module.exports = { parse };

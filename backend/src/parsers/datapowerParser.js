'use strict';
/**
 * DataPower Parser — extracts metadata from IBM DataPower ZIP exports.
 * Handles MPGW, WSP, XSLT, GatewayScript, crypto, and routing policies.
 */
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const path = require('path');

async function parse(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  const result = {
    sourcePlatform: 'DATAPOWER',
    services: [],
    xsltFiles: [],
    gatewayScriptFiles: [],
    cryptoReferences: [],
    backendUrls: [],
    matchingRules: [],
    processingPolicies: [],
    variables: [],
  };

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.toLowerCase();
    const content = entry.getData().toString('utf8');

    if (name.endsWith('.xsl') || name.endsWith('.xslt')) {
      result.xsltFiles.push({ file: entry.entryName, content });
    } else if (name.endsWith('.js') || name.endsWith('.gws')) {
      result.gatewayScriptFiles.push({ file: entry.entryName, content });
    } else if (name.endsWith('.xml') || name.endsWith('.xcfg')) {
      try {
        const parsed = await xml2js.parseStringPromise(content, { explicitArray: false });
        extractDataPowerConfig(parsed, result, entry.entryName);
      } catch (_) {}
    }
  }

  return result;
}

function extractDataPowerConfig(doc, result, filename) {
  const dp = doc.datapower || doc.DatapowerConfig || doc;

  // Extract MPGW services
  const mpgw = getDeep(dp, ['configuration', 'MultiProtocolGateway']) ||
               getDeep(dp, ['MultiProtocolGateway']) || [];
  const mpgwList = Array.isArray(mpgw) ? mpgw : [mpgw];
  for (const svc of mpgwList) {
    if (!svc || !svc.$) continue;
    result.services.push({
      type: 'MPGW',
      name: svc.$.name,
      localEndpoint: svc.LocalAddress || svc.LocalEndpoint || null,
      backendUrl: svc.BackendURL || svc.DefaultBackendURL || null,
      requestType: svc.RequestType || null,
      responseType: svc.ResponseType || null,
      policy: svc.PolicyName || null,
    });
    if (svc.BackendURL) result.backendUrls.push(svc.BackendURL);
  }

  // Extract WSP
  const wsp = getDeep(dp, ['configuration', 'WebServicesProxy']) ||
              getDeep(dp, ['WebServicesProxy']) || [];
  const wspList = Array.isArray(wsp) ? wsp : [wsp];
  for (const svc of wspList) {
    if (!svc || !svc.$) continue;
    result.services.push({ type: 'WSP', name: svc.$.name });
  }

  // Crypto
  const crypto = getDeep(dp, ['configuration', 'CryptoIdentCred']) || [];
  const cryptoList = Array.isArray(crypto) ? crypto : [crypto];
  for (const c of cryptoList) {
    if (c && c.$) result.cryptoReferences.push({ name: c.$.name, type: 'IdentCred' });
  }

  // Variables
  const vars = getDeep(dp, ['configuration', 'StylesheetVariable']) || [];
  const varList = Array.isArray(vars) ? vars : [vars];
  for (const v of varList) {
    if (v && v.$) result.variables.push({ name: v.$.name, value: v.Value || '' });
  }
}

function getDeep(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur) return null;
    cur = cur[k];
  }
  return cur;
}

module.exports = { parse };

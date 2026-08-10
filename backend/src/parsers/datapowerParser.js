'use strict';
/**
 * DataPower Parser — extracts metadata from IBM DataPower ZIP exports.
 *
 * Handles the real DataPower export.xml format (datapower-configuration v3):
 *   - export-details (device info, firmware, domain)
 *   - interface-data (network interfaces)
 *   - configuration/MultiProtocolGateway  — MPGW services
 *   - configuration/WebServicesProxy      — WSP services
 *   - configuration/HTTPSourceProtocolHandler — Front Side Handlers
 *   - configuration/StylePolicy           — named policies with PolicyMaps
 *   - configuration/StylePolicyRule       — request/response/error rules
 *   - configuration/StylePolicyAction     — pipeline actions (xform, convert-http, results, etc.)
 *   - configuration/Matching             — URL/header matching rules
 *   - configuration/HTTPInputConversionMap — JSON/XML input encoding
 *   - configuration/CryptoIdentCred       — crypto identity credentials
 *   - configuration/StylesheetVariable    — policy variables
 *   - files section                       — referenced XSL/GWS file manifest
 *   - Inline .xsl / .xslt / .js / .gws files in the ZIP
 */
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const path   = require('path');

async function parse(filePath) {
  const zip     = new AdmZip(filePath);
  const entries = zip.getEntries();

  const result = {
    sourcePlatform:        'DATAPOWER',
    exportDetails:         {},      // device / firmware metadata
    networkInterfaces:     [],      // eth0…ethN with IPs
    services:              [],      // MPGW + WSP descriptors
    frontSideHandlers:     [],      // HTTPSourceProtocolHandler objects
    stylePolicies:         [],      // StylePolicy with their PolicyMaps
    policyRules:           [],      // StylePolicyRule with direction + ordered actions
    policyActions:         [],      // StylePolicyAction (xform, convert-http, results, etc.)
    matchingRules:         [],      // Matching objects
    httpConversionMaps:    [],      // HTTPInputConversionMap
    xsltFiles:             [],      // embedded .xsl / .xslt content
    gatewayScriptFiles:    [],      // embedded .js / .gws content
    referencedFiles:       [],      // file manifest from <files> section
    cryptoReferences:      [],      // CryptoIdentCred / CryptoValCred
    backendUrls:           [],      // flat list of all backend URLs found
    processingPolicies:    [],      // alias kept for backward compat (populated from stylePolicies)
    variables:             [],      // StylesheetVariable
    xsltMappings:          [],      // field mappings extracted directly from XSL file content
  };

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name    = entry.entryName.toLowerCase();
    const content = entry.getData().toString('utf8');

    if (name.endsWith('.xsl') || name.endsWith('.xslt')) {
      result.xsltFiles.push({ file: entry.entryName, content });
      // Extract field mappings directly from the XSL source —
      // this means even when the LLM RE step is skipped, the gen
      // prompt still gets real field names from the ZIP.
      extractXsltMappings(entry.entryName, content, result.xsltMappings);
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

// ─── Main config extractor ────────────────────────────────────────────────────

function extractDataPowerConfig(doc, result, filename) {
  // Real export root is <datapower-configuration>; xml2js maps hyphens to the key name.
  // Also support legacy <datapower> and <DatapowerConfig> roots.
  const root = doc['datapower-configuration'] || doc.datapower || doc.DatapowerConfig || doc;

  // 1. Export details (device / firmware metadata)
  if (root['export-details']) {
    const ed = root['export-details'];
    result.exportDetails = {
      description:             ed.description         || '',
      user:                    ed.user                || '',
      domain:                  ed.domain              || '',
      product:                 ed['display-product']  || ed.product || '',
      model:                   ed['display-model']    || ed.model   || '',
      deviceName:              ed['device-name']      || '',
      firmwareVersion:         ed['display-firmware-version'] || ed['firmware-version'] || '',
      exportDate:              ed['current-date']     || '',
      exportTime:              ed['current-time']     || '',
    };
  }

  // 2. Network interfaces
  if (root['interface-data']) {
    const ifaces = toArray(getDeep(root, ['interface-data', 'interface']));
    for (const iface of ifaces) {
      if (iface && iface.$) {
        result.networkInterfaces.push({
          name:   iface.$.name,
          ipAddr: iface.$['ip-addr'] || '',
        });
      }
    }
  }

  // configuration block — the real export wraps everything in <configuration domain="...">
  const cfg = getDeep(root, ['configuration']) || root;

  // 3. Front Side Handlers (HTTPSourceProtocolHandler)
  const fshList = toArray(getDeep(cfg, ['HTTPSourceProtocolHandler']));
  for (const fsh of fshList) {
    if (!fsh || !fsh.$) continue;
    const allowed = fsh.AllowedFeatures || {};
    result.frontSideHandlers.push({
      name:           fsh.$.name,
      adminState:     fsh.mAdminState    || 'enabled',
      localAddress:   fsh.LocalAddress   || '0.0.0.0',
      localPort:      fsh.LocalPort      || null,
      httpVersion:    fsh.HTTPVersion    || 'HTTP/1.1',
      allowedMethods: extractAllowedMethods(allowed),
      persistent:     fsh.PersistentConnections === 'on',
    });
  }

  // 4. HTTPInputConversionMap
  const convMaps = toArray(getDeep(cfg, ['HTTPInputConversionMap']));
  for (const cm of convMaps) {
    if (!cm || !cm.$) continue;
    result.httpConversionMaps.push({
      name:                 cm.$.name,
      defaultInputEncoding: cm.DefaultInputEncoding || '',
    });
  }

  // 5. Matching rules
  const matchings = toArray(getDeep(cfg, ['Matching']));
  for (const m of matchings) {
    if (!m || !m.$) continue;
    const rules = toArray(m.MatchRules);
    result.matchingRules.push({
      name:       m.$.name,
      summary:    m.UserSummary   || '',
      combineOr:  m.CombineWithOr === 'on',
      rules: rules.map(r => ({
        type:           r.Type        || '',
        url:            r.Url         || '',
        method:         r.Method      || '',
        httpTag:        r.HttpTag     || '',
        httpValue:      r.HttpValue   || '',
        xpathExpr:      r.XPATHExpression || '',
      })),
    });
  }

  // 6. StylePolicyAction — individual pipeline steps
  const actions = toArray(getDeep(cfg, ['StylePolicyAction']));
  for (const a of actions) {
    if (!a || !a.$) continue;
    result.policyActions.push({
      name:         a.$.name,
      type:         a.Type          || '',
      input:        a.Input         || '',
      output:       a.Output        || '',
      transform:    a.Transform     || '',          // XSL file reference
      inputConversion: refName(a.InputConversion),  // for convert-http actions
      adminState:   a.mAdminState   || 'enabled',
      timeout:      a.Timeout       || '0',
      methodType:   a.MethodType    || '',
      retryCount:   a.RetryCount    || '0',
    });
  }

  // 7. StylePolicyRule — ordered list of actions with direction
  const rules = toArray(getDeep(cfg, ['StylePolicyRule']));
  for (const r of rules) {
    if (!r || !r.$) continue;
    result.policyRules.push({
      name:        r.$.name,
      direction:   r.Direction      || '',   // request-rule | response-rule | error-rule
      inputFormat: r.InputFormat    || '',
      outputFormat:r.OutputFormat   || '',
      actions:     toArray(r.Actions).map(a =>
        typeof a === 'string' ? a : (a._ || a.$?.class && a.$?.class + '/' + a._ || String(a))
      ),
    });
  }

  // 8. StylePolicy — named policy with Match→Rule PolicyMaps
  const policies = toArray(getDeep(cfg, ['StylePolicy']));
  for (const p of policies) {
    if (!p || !p.$) continue;
    const maps = toArray(p.PolicyMaps).map(pm => ({
      match: refName(pm.Match),
      rule:  refName(pm.Rule),
    }));
    const spEntry = {
      name:         p.$.name,
      adminState:   p.mAdminState   || 'enabled',
      policyMaps:   maps,
    };
    result.stylePolicies.push(spEntry);
    result.processingPolicies.push(spEntry);  // backward compat alias
  }

  // 9. MPGW services
  const mpgwList = toArray(
    getDeep(cfg, ['MultiProtocolGateway']) || getDeep(root, ['MultiProtocolGateway'])
  );
  for (const svc of mpgwList) {
    if (!svc || !svc.$) continue;
    // Real export uses <BackendUrl> (capital U, lowercase l) — also try legacy spellings
    const backendUrl = svc.BackendUrl || svc.BackendURL || svc.DefaultBackendURL || null;
    const frontProto = refName(svc.FrontProtocol);
    const stylePolicy= refName(svc.StylePolicy);

    const svcEntry = {
      type:           'MPGW',
      name:           svc.$.name,
      adminState:     svc.mAdminState         || 'enabled',
      frontProtocol:  frontProto,             // name of the HTTPSourceProtocolHandler
      backendUrl:     backendUrl,
      requestType:    svc.RequestType         || null,
      responseType:   svc.ResponseType        || null,
      policy:         stylePolicy,            // name of the linked StylePolicy
      policyAttachments: refName(svc.PolicyAttachments),
      frontTimeout:   svc.FrontTimeout        || null,
      backTimeout:    svc.BackTimeout         || null,
      type_mode:      svc.Type                || null, // static-backend | dynamic-backend
      propagateUri:   svc.PropagateURI        === 'on',
      maxMessageSize: svc.MaxMessageSize      || '0',
    };
    result.services.push(svcEntry);
    if (backendUrl) result.backendUrls.push(backendUrl);
  }

  // 10. WSP services
  const wspList = toArray(
    getDeep(cfg, ['WebServicesProxy']) || getDeep(root, ['WebServicesProxy'])
  );
  for (const svc of wspList) {
    if (!svc || !svc.$) continue;
    result.services.push({
      type:       'WSP',
      name:       svc.$.name,
      adminState: svc.mAdminState || 'enabled',
      policy:     refName(svc.StylePolicy),
    });
  }

  // 11. Crypto
  const cryptoList = toArray(getDeep(cfg, ['CryptoIdentCred']));
  for (const c of cryptoList) {
    if (c && c.$) result.cryptoReferences.push({ name: c.$.name, type: 'IdentCred' });
  }
  const valCredList = toArray(getDeep(cfg, ['CryptoValCred']));
  for (const c of valCredList) {
    if (c && c.$) result.cryptoReferences.push({ name: c.$.name, type: 'ValCred' });
  }

  // 12. StylesheetVariables
  const varList = toArray(getDeep(cfg, ['StylesheetVariable']));
  for (const v of varList) {
    if (v && v.$) result.variables.push({ name: v.$.name, value: v.Value || '' });
  }

  // 13. Files manifest (<files> section lists XSL/GWS referenced in actions)
  if (root.files) {
    const fileList = toArray(root.files.file);
    for (const f of fileList) {
      if (!f || !f.$) continue;
      result.referencedFiles.push({
        name:     f.$.name,
        src:      f.$.src      || '',
        location: f.$.location || '',
        internal: f.$.internal === 'true',
        hash:     f.$.hash     || '',
      });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely navigate nested keys, returning null if any level is missing. */
function getDeep(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return cur;
}

/** Normalise a value that may be an array or a single item into an array. */
function toArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * xml2js represents an element like <StylePolicy class="StylePolicy">JSON_TEST</StylePolicy>
 * as { _: 'JSON_TEST', $: { class: 'StylePolicy' } }.
 * This helper extracts just the text value (the reference name).
 */
function refName(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val._) return val._;
  return null;
}

/** Extract which HTTP methods are allowed from AllowedFeatures block. */
function extractAllowedMethods(af) {
  const methods = [];
  if (af.POST === 'on')    methods.push('POST');
  if (af.GET  === 'on')    methods.push('GET');
  if (af.PUT  === 'on')    methods.push('PUT');
  if (af.DELETE === 'on')  methods.push('DELETE');
  if (af.HEAD === 'on')    methods.push('HEAD');
  if (af.OPTIONS === 'on') methods.push('OPTIONS');
  if (af.PATCH === 'on')   methods.push('PATCH');
  return methods;
}

/**
 * Extracts field-level mappings from an XSL stylesheet by scanning for
 * xsl:value-of select="..." expressions and the XML output elements that
 * surround them.
 *
 * For jsonxtoXML.xsl (JSON→XML request):
 *   select="json:object/json:object[@name='Login']/json:string[@name='username']"
 *   inside <username> element  →  sourceField: "Login.username", targetField: "Login.username" (XML)
 *
 * For XMLtoJSONX.xsl (XML→JSON response):
 *   select="LoginStatus/Message"
 *   inside <json:string name="Message">  →  sourceField: "LoginStatus.Message", targetField: "LoginStatus.Message"
 *
 * Determines direction from filename: jsonxtoXML → request, XMLtoJSONX/jsonx2json → response.
 */
function extractXsltMappings(filename, content, mappings) {
  // Determine direction from filename
  const lc = filename.toLowerCase();
  const direction = lc.includes('tojson') || lc.includes('xmltojsonx') || lc.includes('jsonx2json')
    ? 'response' : 'request';

  // --- Pattern 1: <json:string name="FIELD"><xsl:value-of select="PATH"/> (XML→JSONX response)
  const jsonStringRe = /<json:string[^>]+name="([^"]+)"[^>]*>[\s\S]*?xsl:value-of[^>]+select="([^"]+)"/g;
  let m;
  while ((m = jsonStringRe.exec(content)) !== null) {
    const targetField = m[1];
    const selectPath  = m[2].trim();
    const sourceField = xpathToFieldName(selectPath);
    if (sourceField && targetField) {
      mappings.push({
        file:         filename,
        direction,
        sourceField,
        targetField,
        transformation: `xsl:value-of select="${selectPath}"`,
      });
    }
  }

  // --- Pattern 2: <TargetElement><xsl:value-of select="PATH"/> (JSONX→XML request)
  // Matches any XML output element directly containing xsl:value-of (no nested elements in between)
  const xmlElemRe = /<([A-Za-z][A-Za-z0-9_]*)>[^<]*<xsl:value-of[^>]+select="([^"]+)"/g;
  while ((m = xmlElemRe.exec(content)) !== null) {
    const targetField = m[1];
    const selectPath  = m[2].trim();
    const sourceField = xpathToFieldName(selectPath);
    // Skip XSL built-in elements
    if (sourceField && targetField && !targetField.startsWith('xsl') && !targetField.startsWith('json')) {
      mappings.push({
        file:         filename,
        direction,
        sourceField,
        targetField,
        transformation: `xsl:value-of select="${selectPath}"`,
      });
    }
  }
}

/**
 * Converts an XPath select expression into a readable dot-notation field name.
 * Examples:
 *   "json:object/json:object[@name='Login']/json:string[@name='username']"
 *     → "Login.username"
 *   "LoginStatus/Message"
 *     → "LoginStatus.Message"
 */
function xpathToFieldName(xpath) {
  // Extract @name="..." values from JSONX-style XPath
  const nameParts = [];
  const nameRe = /@name='([^']+)'/g;
  let m;
  while ((m = nameRe.exec(xpath)) !== null) nameParts.push(m[1]);
  if (nameParts.length > 0) return nameParts.join('.');

  // Plain XPath like LoginStatus/Message → dot notation
  const plain = xpath
    .replace(/\[.*?\]/g, '')       // strip predicates
    .replace(/[a-z]+:/g, '')       // strip namespace prefixes
    .replace(/\//g, '.')           // slash → dot
    .replace(/^\.+|\.+$/g, '');    // trim leading/trailing dots
  return plain || null;
}

module.exports = { parse };

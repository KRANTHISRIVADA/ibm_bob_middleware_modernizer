'use strict';
/**
 * RAG Knowledge Base — IBM DataPower Gateway Patterns
 *
 * Each entry is a document chunk the retriever can return.
 * Fields:
 *   id       — unique stable key
 *   platform — which source platform this primarily applies to
 *   phase    — 're' | 'gen' | 'both'
 *   tags     — keywords used for BM25 retrieval
 *   title    — short human label
 *   content  — the actual knowledge text injected into the LLM prompt
 */
const docs = [

  {
    id: 'dp-export-structure',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['export', 'datapower-configuration', 'export-details', 'firmware', 'domain', 'device', 'XI50', 'XI52'],
    title: 'DataPower Export File Structure (datapower-configuration v3)',
    content: `A real IBM DataPower export.xml has the root element <datapower-configuration version="3">.
It contains four top-level sections:
1. <export-details>  — device metadata: device-name, domain, firmware-version (e.g. XI52.6.0.1.0),
   product (XI50/XI52/XG45/IDG), current-date/time of the export.
   Use these fields to populate executiveSummary with platform identity and version context.
2. <interface-data>  — one <interface name="ethN" ip-addr="..."/> per network interface.
   These reveal the IP topology: which IPs handle inbound traffic vs. backend traffic.
3. <configuration domain="DomainName"> — contains ALL service objects (MPGW, WSP, FSH, StylePolicy, etc.)
4. <files> — manifest of XSL and other local files referenced by StylePolicyAction Transform elements.
When reverse engineering, extract domain name from configuration/@domain as the service domain context.`,
  },

  {
    id: 'dp-fsh-pattern',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['HTTPSourceProtocolHandler', 'front side handler', 'FSH', 'LocalPort', 'LocalAddress', 'AllowedFeatures', 'HTTP methods'],
    title: 'DataPower Front Side Handler (HTTPSourceProtocolHandler)',
    content: `The HTTPSourceProtocolHandler (FSH) is the inbound listener for an MPGW service.
Key fields to extract for reverse engineering:
- LocalAddress + LocalPort → the socket the MPGW listens on (e.g., 0.0.0.0:2053)
- AllowedFeatures/POST, GET, PUT, DELETE → which HTTP methods are permitted
- HTTPVersion → HTTP/1.0 or HTTP/1.1 protocol level
- PersistentConnections → connection pooling behaviour
- MaxURLLen, MaxTotalHdrLen → input validation limits

Reverse engineering mapping:
- LocalPort → @RequestMapping port or server.port in application.yml
- AllowedMethods → @PostMapping/@GetMapping/@PutMapping/@DeleteMapping on the controller
- PersistentConnections=on → Spring Boot default (keep-alive) — document it
- MaxURLLen / MaxTotalHdrLen → document as NFR input validation constraint

A single MPGW may reference a FSH by name via <FrontProtocol class="HTTPSourceProtocolHandler">FSH_NAME</FrontProtocol>.`,
  },

  {
    id: 'dp-mpgw-pattern',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['MPGW', 'MultiProtocolGateway', 'service', 'front side handler', 'BackendUrl', 'BackendURL', 'routing', 'FrontTimeout', 'BackTimeout', 'static-backend'],
    title: 'DataPower MPGW Service Pattern',
    content: `IBM DataPower MultiProtocolGateway (MPGW) is a versatile service type.
Key fields in a real export.xml (datapower-configuration v3):
- <BackendUrl> — upstream target URL (note capital U, lowercase l — distinct from older BackendURL)
- <FrontProtocol class="HTTPSourceProtocolHandler"> — name of the inbound listener FSH
- <StylePolicy class="StylePolicy"> — name of the processing pipeline policy
- <PolicyAttachments class="PolicyAttachments"> — enforcement settings
- <RequestType> — json | xml | soap | binary | passthrough
- <ResponseType> — json | xml | soap | binary | passthrough
- <FrontTimeout> / <BackTimeout> — connection timeouts in seconds (e.g., 120)
- <BackPersistentTimeout> — persistent connection timeout to backend
- <Type> — static-backend | dynamic-backend | loopback
- <PropagateURI> on/off — whether URI is forwarded to the backend
- <MaxMessageSize> — 0 = unlimited

Migration to Spring Boot:
- BackendUrl → @Value("\${backend.url}") in application.yml, used in WebClient base URL
- FrontProtocol (port) → server.port in application.yml
- RequestType=json + ResponseType=xml → content negotiation: consumes=application/json, produces=application/xml
- FrontTimeout / BackTimeout → WebClient.timeout(Duration.ofSeconds(n)) and resilience4j TimeLimiter
- static-backend → fixed WebClient base URL; dynamic-backend → routing logic in service layer
- PropagateURI=on → pass through the request path using exchange() or path variable forwarding`,
  },

  {
    id: 'dp-wsp-pattern',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['WSP', 'WebServicesProxy', 'SOAP', 'WSDL', 'web service'],
    title: 'DataPower WSP (Web Services Proxy) Pattern',
    content: `IBM DataPower WebServicesProxy (WSP) mediates SOAP/WSDL services. It validates SOAP envelopes,
applies WS-Security, and forwards to a backend SOAP endpoint. When migrating to Spring Boot:
WSP maps to a @RestController that converts REST-to-SOAP or a SOAP endpoint using spring-ws.
WS-Security policies (UsernameToken, X509) map to Spring Security WS interceptors.
Backend WSDL → generate client stubs using wsimport or spring-ws WebServiceGatewaySupport.
SOAP action → @SoapAction annotation or request header routing in the service layer.`,
  },

  {
    id: 'dp-style-policy-pipeline',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['StylePolicy', 'StylePolicyRule', 'StylePolicyAction', 'PolicyMaps', 'request-rule', 'response-rule', 'error-rule', 'pipeline', 'direction'],
    title: 'DataPower StylePolicy / StylePolicyRule / StylePolicyAction Pipeline',
    content: `A DataPower StylePolicy defines the complete message processing pipeline for an MPGW or WSP service.

Structure hierarchy:
  StylePolicy
    └─ PolicyMaps[]  (each has a Match reference + a StylePolicyRule reference)
         └─ StylePolicyRule (direction: request-rule | response-rule | error-rule)
              └─ Actions[] → ordered list of StylePolicyAction names

StylePolicyRule directions:
- request-rule  → actions applied to the INBOUND request (before routing to backend)
- response-rule → actions applied to the OUTBOUND response (after backend reply)
- error-rule    → actions applied when an error occurs in request or response processing

StylePolicyAction types and their meaning:
- convert-http  → converts HTTP body encoding (e.g., JSON→JSONX internal format). References an HTTPInputConversionMap.
- xform         → applies an XSL stylesheet (Transform field = local:///path/to/file.xsl).
                  Input and Output fields name the intermediate context variables.
- results       → sends the named Input context to the output stream (final write).
- validate      → XML schema validation step.
- route-action  → dynamic routing to a backend URL.
- set-variable  → sets a DataPower context variable.
- gatewayscript → runs a JavaScript (.gws) file.
- slm           → service level monitoring / rate limiting step.
- filter        → drops messages matching a condition.

When reverse engineering, trace the data flow through the ordered actions to reconstruct
the transformation pipeline. For each xform action, the Transform field names the XSL stylesheet
(local:///stub/file.xsl means a user-uploaded local file; store:///file.xsl is a built-in).`,
  },

  {
    id: 'dp-json-xml-mediation',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['JSON', 'XML', 'JSONX', 'convert-http', 'jsonxtoXML', 'XMLtoJSONX', 'jsonx2json', 'mediation', 'content type', 'encoding conversion'],
    title: 'DataPower JSON↔XML Mediation Pattern',
    content: `DataPower has a built-in multi-step pipeline for JSON↔XML protocol mediation, commonly used in
MPGW services with RequestType=json and ResponseType=xml (or vice versa).

Typical request pipeline (JSON-in → XML to backend):
  Step 1: convert-http action — converts HTTP JSON body to JSONX (IBM internal XML representation of JSON)
          using an HTTPInputConversionMap with DefaultInputEncoding=json
          Context variable name after conversion: typically named JSONX or similar.
  Step 2: xform action — transforms JSONX to target XML using an XSL stylesheet
          (e.g., local:///stub/jsonxtoXML.xsl)
          Output context variable: e.g., LoginXML or processed XML name.
  Step 3: results action — writes the final XML to the output stream.

Typical response pipeline (XML-from-backend → JSON response):
  Step 1: xform action — transforms the XML response to JSONX
          (e.g., local:///stub/XMLtoJSONX.xsl)
          Output: FINAL_JSONX or similar.
  Step 2: xform action — converts JSONX to JSON using the built-in store:///jsonx2json.xsl stylesheet
          Output: JSON_RESPONSE.
  Step 3: results action — writes the JSON to the HTTP response.

Error pipeline:
  Typically a single results action that returns the error INPUT directly.

Spring Boot equivalent of this mediation:
- @RestController: consumes=application/json, produces=application/json (external) 
- Service method: receives JSON RequestBody → maps to domain model → calls backend with XML
- BackendClient: sends XML via WebClient (Content-Type: application/xml)
- Response: receives XML from backend → maps back to JSON response POJO via XmlMapper or custom mapper
- XmlMapper (Jackson): com.fasterxml.jackson.dataformat.jackson-dataformat-xml for XML↔Java mapping
- The jsonxtoXML.xsl and XMLtoJSONX.xsl field mappings should be reviewed to generate accurate Mapper classes.

JSONX format: IBM's XML representation of JSON where {"key":"value"} becomes
<json:object xmlns:json="http://www.ibm.com/xmlns/prod/2009/jsonx"><json:string name="key">value</json:string></json:object>.
When those XSL files are present in the ZIP, analyse them for field mapping to populate sourceMappings.`,
  },

  {
    id: 'dp-matching-rules',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['Matching', 'match rule', 'URL pattern', 'wildcard', 'default match', 'CombineWithOr', 'SOAPAction', 'XPATH'],
    title: 'DataPower Matching Object',
    content: `A DataPower Matching object defines conditions that determine which StylePolicyRule applies to a message.
Matching is referenced by StylePolicy.PolicyMaps[].Match.

MatchRules fields:
- Type: "url" | "header" | "errorcode" | "xpath" | "methodname" | "servicename"
- Url: URL pattern (e.g., "*" = match all, "/api/v1/*" = path prefix)
- Method: "GET"|"POST"|"default" — HTTP method to match
- HttpTag / HttpValue: match on a specific HTTP header name/value
- XPATHExpression: XPath predicate applied to the message body

Common patterns:
- __default-accept-service-providers__ with Url=* → "match all" default rule (always applies)
- CombineWithOr=off → all rules must match (AND semantics)
- CombineWithOr=on  → any rule matches (OR semantics)

Spring Boot equivalent:
- Url wildcard "*" → no path restriction on the @RequestMapping
- Specific URL pattern → @RequestMapping("/specific/path/**")
- Method matching → @GetMapping / @PostMapping etc.
- Header matching → @RequestMapping with headers attribute or @RequestHeader in method sig
- XPath matching → filter in service layer using javax.xml.xpath.XPath`,
  },

  {
    id: 'dp-xslt-migration',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['XSLT', 'XSL', 'transformation', 'stylesheet', 'XML', 'transform', 'xsl:template', 'xsl:apply-templates', 'local:', 'store:'],
    title: 'DataPower XSLT Transformation Migration',
    content: `DataPower XSLT stylesheets implement field mapping, protocol mediation, and data enrichment.
XSL file locations in the export:
- local:///path/to/file.xsl → user-uploaded local file (present in <files> section and potentially in ZIP)
- store:///file.xsl → built-in DataPower system stylesheet (e.g., store:///jsonx2json.xsl, store:///identity.xsl)

Common patterns and their Spring Boot equivalents:
1. xsl:value-of select → direct field mapping in a @Component Mapper class using getter/setter.
2. xsl:if / xsl:choose → conditional logic in service method (if/else or strategy pattern).
3. xsl:for-each → stream().map() in Java or a loop in the mapper.
4. dp:variable / dp:set-variable → @Value or a context object passed through the service.
5. APIM-specific dp:gatewayscript → migrate logic to a @Service method or filter.
6. date/time XSLT functions → java.time.LocalDateTime and DateTimeFormatter in the mapper.
When no XSLT file is available, infer transformation logic from field name patterns in source/target schemas.
Create a XmlTransformationService with one method per XSLT file, using javax.xml.transform.Transformer.`,
  },

  {
    id: 'dp-gatewayscript',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['GatewayScript', 'JavaScript', 'gws', 'session', 'context variable', 'service variable'],
    title: 'DataPower GatewayScript Migration',
    content: `DataPower GatewayScript (.gws) files are JavaScript snippets that manipulate the message context.
Common idioms and Spring Boot equivalents:
- session.input.readAsJSON() → read request body as @RequestBody in controller.
- session.output.write(obj) → return ResponseEntity<Object> from controller.
- apim.setvariable('name', value) → use a request-scoped @Component or MDC context.
- apim.getvariable('request.headers.X-Foo') → @RequestHeader("X-Foo") String foo in controller.
- require('local:///util.js') → extract shared logic to a @Component utility class.
- JSON.parse / JSON.stringify → Jackson ObjectMapper in the service layer.
When script files are not available, document what each script was configured to do (set headers,
validate tokens, route conditionally) based on configuration metadata, and implement equivalent
Spring Boot interceptors/filters.`,
  },

  {
    id: 'dp-processing-policy',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['processing policy', 'processing rule', 'action', 'match', 'result', 'gatewaytransaction', 'PolicyAttachments', 'EnforcementMode'],
    title: 'DataPower Processing Policy & Rule Structure',
    content: `A DataPower Processing Policy contains one or more Processing Rules via PolicyMaps. Each rule has:
- A Match object (URL pattern, header value, SOAPAction, or always-match).
- An ordered sequence of Actions: validate, transform, route, set-variable, slm, results, filter.

PolicyAttachments (type PolicyAttachments) controls how the policy is enforced on the MPGW:
- EnforcementMode: enforce | observe-with-audit | observe | bypass
- SLAEnforcementMode: allow-if-no-sla | fail-if-no-sla
These indicate whether the security/SLA policies are hard-enforced or in audit mode.

Reverse engineering a processing policy means identifying:
1. Which requests are matched (→ endpoint routing rules via Matching objects).
2. What transforms are applied in sequence (→ transformation mapping steps).
3. What backend URL is targeted (→ routing document backendUrl from MPGW.BackendUrl).
4. What security checks are applied (→ security analysis policies).
5. What error handling is configured (→ error handling document from error-rule actions).
If the ZIP does not contain full policy XML, reconstruct from service names and XSLT filenames
using naming conventions: <ServiceName>_policy_<verb>.xml is typical.`,
  },

  {
    id: 'dp-crypto-oauth',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['CryptoIdentCred', 'CryptoValCred', 'OAuth', 'TLS', 'SSL', 'certificate', 'mTLS', 'API key', 'JWT', 'token'],
    title: 'DataPower Security Patterns — Crypto, OAuth, mTLS',
    content: `DataPower security mechanisms and their Spring Boot equivalents:
1. CryptoIdentCred (certificate + key) → Spring Boot SSL/TLS: server.ssl.key-store in application.yml.
2. CryptoValCred (validation credential) → spring.ssl.bundle or custom TrustManagerFactory.
3. OAuth Token Validation action → Spring Security OAuth2 Resource Server (spring-security-oauth2-resource-server).
   Configure in SecurityConfig: http.oauth2ResourceServer(oauth2 -> oauth2.jwt(...)).
4. API Key header check → Spring Security OncePerRequestFilter reading X-IBM-Client-Id header.
5. Basic auth → Spring Security httpBasic() with UserDetailsService.
6. JWT validation → spring-security-oauth2-jose, configure JwtDecoder with the issuer URI.
7. mTLS (client certificate) → server.ssl.client-auth=need in application.yml, X509Certificate principal extraction.`,
  },

  {
    id: 'dp-slm-nfr',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['SLM', 'rate limit', 'throttle', 'quota', 'non-functional', 'timeout', 'retry', 'circuit breaker', 'FrontTimeout', 'BackTimeout'],
    title: 'DataPower SLM & Non-Functional Requirements',
    content: `DataPower SLM (Service Level Monitoring) policies define rate limits, throttles, and quotas.
NFR extraction from real export.xml:
- FrontTimeout on MPGW → inbound request timeout (e.g., 120 → timeout=120s)
- BackTimeout on MPGW → backend call timeout (e.g., 120 → backend.timeout=120s)
- BackPersistentTimeout → persistent connection timeout to backend
- SLM action with count interval → rateLimit value (e.g., "100 req/10s" → "600 req/min").
- Retry action in processing rule → retry NFR count.
When SLM config is not present in the ZIP, default to: timeout=30s, retry=3, rateLimit=unspecified.
Spring Boot equivalents:
- Rate limit → Bucket4j or resilience4j RateLimiter.
- Timeout → WebClient.timeout(Duration.ofSeconds(n)) and @TimeLimiter resilience4j.
- Retry → @Retry resilience4j annotation on service methods calling BackendClient.
- Circuit breaker → @CircuitBreaker resilience4j on BackendClient methods.`,
  },

  {
    id: 'dp-missing-config',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['missing', 'incomplete', 'partial', 'no config', 'gap', 'inference', 'reconstruct'],
    title: 'Handling Incomplete DataPower Artifacts',
    content: `When a DataPower ZIP export is incomplete or contains only partial configuration:
Inference rules for reverse engineering:
1. No XSLT files: assume pass-through or simple header manipulation based on service type.
2. No processing policy XML: infer policy from service name conventions. Services named *_proxy or *_passthru → pass-through. Services named *_transform or *_mediat* → transformation.
3. No backend URL: flag as GAP; suggest "backendUrl: TBD — obtain from DataPower admin console".
4. No security config: default to API Key or OAuth based on service name patterns (*_oauth, *_secure).
5. No SLM policy: NFR values marked as "Not specified — review DataPower admin for SLM policy <ServiceName>_slm".
6. XSL file referenced in StylePolicyAction.Transform but not present in ZIP: note as GAP with the filename.
   The <files> manifest in the export lists all referenced files with their hash — compare against actual ZIP contents.
Always populate the gaps[] and risks[] arrays in the RE output to surface these issues clearly.`,
  },

  {
    id: 'dp-spring-package-structure',
    platform: 'DATAPOWER',
    phase: 'gen',
    tags: ['Spring Boot', 'package', 'structure', 'controller', 'service', 'mapper', 'client', 'config', 'XmlMapper', 'jackson-dataformat-xml'],
    title: 'Spring Boot Package Structure for DataPower Migration',
    content: `Recommended Spring Boot package structure for a migrated DataPower service:
com.modernizer.<servicename>/
  controller/   — @RestController classes, one per MPGW service or route group
  service/      — @Service classes, one per MPGW; orchestrates mapper + client
  mapper/       — @Component classes translating request/response; replaces XSLT/JSONX logic
  client/       — @Component WebClient wrappers, one per backend host
  config/       — SecurityConfig, WebClientConfig, RetryConfig (Resilience4j)
  exception/    — GlobalExceptionHandler (@RestControllerAdvice), custom exceptions
  model/        — POJOs for request/response (use @JsonProperty for field renaming from XSLT)
  filter/       — Servlet filters for correlation ID, API key validation
src/main/resources/
  application.yml — server.port, backend URLs as @Value properties, resilience4j config

For JSON↔XML mediation (RequestType=json, ResponseType=xml):
- Add jackson-dataformat-xml to pom.xml
- Use JacksonXmlRootElement on XML model classes
- Configure a dedicated XmlMapper @Bean alongside the default ObjectMapper
- Mapper class converts between JSON model and XML model using field-level annotations`,
  },

];

module.exports = docs;

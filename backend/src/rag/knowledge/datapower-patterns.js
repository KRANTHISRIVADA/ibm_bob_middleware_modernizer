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
    id: 'dp-mpgw-pattern',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['MPGW', 'MultiProtocolGateway', 'service', 'front-side handler', 'backend URL', 'routing'],
    title: 'DataPower MPGW Service Pattern',
    content: `IBM DataPower MultiProtocolGateway (MPGW) is a versatile service type that accepts requests on a
front-side handler (HTTP, HTTPS, MQ, FTP, etc.) and routes them to a backend URL after applying a
processing policy. Each MPGW has exactly one request-type and one response-type (XML, JSON, binary, pass-through).
When migrating to Spring Boot: map LocalEndpoint → @RequestMapping path, BackendURL → WebClient base URL,
processing policy steps → service layer methods, RequestType/ResponseType → MediaType configuration.
MPGW with pass-through routing maps directly to a reverse proxy pattern in Spring Boot using WebClient.
MPGW with XSLT transform maps to a service method that calls XsltTransformer or a custom mapper class.`
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
SOAP action → @SoapAction annotation or request header routing in the service layer.`
  },

  {
    id: 'dp-xslt-migration',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['XSLT', 'XSL', 'transformation', 'stylesheet', 'XML', 'transform', 'xsl:template', 'xsl:apply-templates'],
    title: 'DataPower XSLT Transformation Migration',
    content: `DataPower XSLT stylesheets implement field mapping, protocol mediation, and data enrichment.
Common patterns and their Spring Boot equivalents:
1. xsl:value-of select → direct field mapping in a @Component Mapper class using getter/setter.
2. xsl:if / xsl:choose → conditional logic in service method (if/else or strategy pattern).
3. xsl:for-each → stream().map() in Java or a loop in the mapper.
4. dp:variable / dp:set-variable → @Value or a context object passed through the service.
5. APIM-specific dp:gatewayscript → migrate logic to a @Service method or filter.
6. date/time XSLT functions → java.time.LocalDateTime and DateTimeFormatter in the mapper.
When no XSLT file is available, infer transformation logic from field name patterns in source/target schemas.
Create a XmlTransformationService with one method per XSLT file, using javax.xml.transform.Transformer.`
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
Spring Boot interceptors/filters.`
  },

  {
    id: 'dp-processing-policy',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['processing policy', 'processing rule', 'action', 'match', 'result', 'gatewaytransaction'],
    title: 'DataPower Processing Policy & Rule Structure',
    content: `A DataPower Processing Policy contains one or more Processing Rules. Each rule has:
- A Match object (URL pattern, header value, SOAPAction, or always-match).
- An ordered sequence of Actions: validate, transform, route, set-variable, slm, results, filter.
Reverse engineering a processing policy means identifying:
1. Which requests are matched (→ endpoint routing rules).
2. What transforms are applied in sequence (→ transformation mapping steps).
3. What backend URL is targeted (→ routing document backendUrl).
4. What security checks are applied (→ security analysis policies).
5. What error handling is configured (→ error handling document).
If the ZIP does not contain full policy XML, reconstruct from service names and XSLT filenames
using naming conventions: <ServiceName>_policy_<verb>.xml is typical.`
  },

  {
    id: 'dp-crypto-oauth',
    platform: 'DATAPOWER',
    phase: 'both',
    tags: ['CryptoIdentCred', 'OAuth', 'TLS', 'SSL', 'certificate', 'mTLS', 'API key', 'JWT', 'token'],
    title: 'DataPower Security Patterns — Crypto, OAuth, mTLS',
    content: `DataPower security mechanisms and their Spring Boot equivalents:
1. CryptoIdentCred (certificate + key) → Spring Boot SSL/TLS: server.ssl.key-store in application.yml.
2. CryptoValCred (validation credential) → spring.ssl.bundle or custom TrustManagerFactory.
3. OAuth Token Validation action → Spring Security OAuth2 Resource Server (spring-security-oauth2-resource-server).
   Configure in SecurityConfig: http.oauth2ResourceServer(oauth2 -> oauth2.jwt(...)).
4. API Key header check → Spring Security OncePerRequestFilter reading X-IBM-Client-Id header.
5. Basic auth → Spring Security httpBasic() with UserDetailsService.
6. JWT validation → spring-security-oauth2-jose, configure JwtDecoder with the issuer URI.
7. mTLS (client certificate) → server.ssl.client-auth=need in application.yml, X509Certificate principal extraction.`
  },

  {
    id: 'dp-slm-nfr',
    platform: 'DATAPOWER',
    phase: 're',
    tags: ['SLM', 'rate limit', 'throttle', 'quota', 'non-functional', 'timeout', 'retry', 'circuit breaker'],
    title: 'DataPower SLM & Non-Functional Requirements',
    content: `DataPower SLM (Service Level Monitoring) policies define rate limits, throttles, and quotas.
Extraction rules:
- SLM action with count interval → rateLimit value (e.g., "100 req/10s" → "600 req/min").
- BackendTimeout attribute on service or route action → timeout NFR value.
- Retry action in processing rule → retry NFR count.
When SLM config is not present in the ZIP, default to: timeout=30s, retry=3, rateLimit=unspecified.
Spring Boot equivalents:
- Rate limit → Bucket4j or resilience4j RateLimiter.
- Timeout → WebClient.timeout(Duration.ofSeconds(n)) and @TimeLimiter resilience4j.
- Retry → @Retry resilience4j annotation on service methods calling BackendClient.
- Circuit breaker → @CircuitBreaker resilience4j on BackendClient methods.`
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
Always populate the gaps[] and risks[] arrays in the RE output to surface these issues clearly.`
  },

  {
    id: 'dp-spring-package-structure',
    platform: 'DATAPOWER',
    phase: 'gen',
    tags: ['Spring Boot', 'package', 'structure', 'controller', 'service', 'mapper', 'client', 'config'],
    title: 'Spring Boot Package Structure for DataPower Migration',
    content: `Recommended Spring Boot package structure for a migrated DataPower service:
com.modernizer.<servicename>/
  controller/   — @RestController classes, one per MPGW service or route group
  service/      — @Service classes, one per MPGW; orchestrates mapper + client
  mapper/       — @Component classes translating request/response; replaces XSLT logic
  client/       — @Component WebClient wrappers, one per backend host
  config/       — SecurityConfig, WebClientConfig, RetryConfig (Resilience4j)
  exception/    — GlobalExceptionHandler (@RestControllerAdvice), custom exceptions
  model/        — POJOs for request/response (use @JsonProperty for field renaming from XSLT)
  filter/       — Servlet filters for correlation ID, API key validation
src/main/resources/
  application.yml — server.port, backend URLs as @Value properties, resilience4j config`
  },

];

module.exports = docs;

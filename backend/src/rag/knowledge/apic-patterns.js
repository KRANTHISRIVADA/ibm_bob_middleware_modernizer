'use strict';
/**
 * RAG Knowledge Base — IBM API Connect Patterns
 */
const docs = [

  {
    id: 'apic-assembly-patterns',
    platform: 'APIC',
    phase: 'both',
    tags: ['x-ibm-configuration', 'assembly', 'execute', 'invoke', 'proxy', 'policy', 'operation switch', 'target-url'],
    title: 'API Connect Assembly Policy Patterns',
    content: `IBM API Connect uses x-ibm-configuration.assembly.execute[] to define policy steps.
Common policies and Spring Boot equivalents:
1. invoke (target-url) → WebClient call in BackendClient; URL from @Value property.
2. proxy → simple reverse proxy; Spring Cloud Gateway or WebClient passthrough.
3. operation-switch → RouteNode pattern; @RestController with separate methods per operationId.
4. gatewayscript → custom @Component logic or @Filter.
5. map (APIC mapping policy) → @Component Mapper class with one method per mapped field.
6. xslt → XmlTransformationService using javax.xml.transform.
7. set-variable → pass context via request-scoped bean or MDC.
8. validate → Jakarta Bean Validation on @RequestBody; @Validated controller.
9. activity-log → AuditLogger @Aspect or MDC-based structured logging.
10. rateLimit / throttle → Bucket4j filter or Resilience4j RateLimiter.`
  },

  {
    id: 'apic-security-defs',
    platform: 'APIC',
    phase: 'both',
    tags: ['securityDefinitions', 'securitySchemes', 'OAuth2', 'apiKey', 'JWT', 'clientId', 'clientSecret', 'scope', 'bearer'],
    title: 'API Connect Security Definitions Migration',
    content: `IBM API Connect security definitions map to Spring Security as follows:
1. type: apiKey, in: header, name: X-IBM-Client-Id → OncePerRequestFilter checking request.getHeader("X-IBM-Client-Id").
   Validate against an in-memory or DB store. Return 401 if missing, 403 if invalid.
2. type: oauth2, flow: application (client_credentials) → Spring Security OAuth2 Resource Server.
   application.yml: spring.security.oauth2.resourceserver.jwt.issuer-uri=<token endpoint>.
3. type: oauth2, flow: accessCode (authorization_code) → OAuth2 login with Spring Security.
4. type: http, scheme: bearer, bearerFormat: JWT → spring-security-oauth2-resource-server with JwtDecoder.
5. type: http, scheme: basic → httpBasic() in SecurityFilterChain.
In SecurityConfig.java: configure .securityMatcher() for protected paths, apply the correct filter.
Always map the APIC catalog/product tier to a Spring Security role or authority for RBAC.`
  },

  {
    id: 'apic-path-to-controller',
    platform: 'APIC',
    phase: 'gen',
    tags: ['path', 'operation', 'operationId', 'controller', 'REST', 'GET', 'POST', 'PUT', 'DELETE', 'parameter', 'requestBody'],
    title: 'API Connect Paths → Spring Boot Controller Generation',
    content: `Each OpenAPI path + method in the APIC spec becomes a controller method:
Path: /customers/{customerId}  Method: GET  operationId: getCustomerById
→ @GetMapping("/customers/{customerId}")
  public ResponseEntity<CustomerResponse> getCustomerById(@PathVariable String customerId)

Path parameters (in: path) → @PathVariable in the method signature.
Query parameters (in: query) → @RequestParam(required=false, defaultValue="...").
Header parameters (in: header) → @RequestHeader("X-Custom-Header").
requestBody (application/json) → @RequestBody @Valid RequestDto requestBody.
Response 200 schema → ResponseEntity<ResponseDto> where ResponseDto matches the schema.
Response 400/401/403/404/500 → documented via @Operation(responses={...}) Swagger annotation;
  thrown as ResponseStatusException from service layer.
Always generate a Swagger/OpenAPI annotation block (@Tag, @Operation, @ApiResponse) on each method.`
  },

  {
    id: 'apic-backend-integration',
    platform: 'APIC',
    phase: 'gen',
    tags: ['target-url', 'backend', 'invoke', 'upstream', 'proxy', 'WebClient', 'RestTemplate', 'HTTP'],
    title: 'API Connect Backend Integration — WebClient Pattern',
    content: `The APIC invoke policy target-url becomes a WebClient call in the BackendClient:
@Component
public class BackendClient {
  private final WebClient webClient;
  public BackendClient(@Value("\${backend.base-url}") String baseUrl, WebClient.Builder builder) {
    this.webClient = builder.baseUrl(baseUrl)
        .filter(ExchangeFilterFunctions.basicAuthentication(...))  // if basic auth
        .build();
  }
  public Mono<ResponseDto> callBackend(String path, RequestDto body) {
    return webClient.post().uri(path).bodyValue(body)
        .retrieve()
        .onStatus(HttpStatusCode::isError, r -> r.bodyToMono(String.class)
            .flatMap(err -> Mono.error(new BackendCallException(err))))
        .bodyToMono(ResponseDto.class);
  }
}
Set backend.base-url in application.yml. Use @Value to inject; never hardcode URLs.
Timeout: configure in WebClientConfig using .responseTimeout(Duration.ofSeconds(30)).`
  },

  {
    id: 'apic-openapi-spec',
    platform: 'APIC',
    phase: 're',
    tags: ['openapi', 'swagger', 'info', 'paths', 'components', 'schemas', 'servers', 'spec'],
    title: 'API Connect OpenAPI Spec Extraction',
    content: `IBM API Connect YAML files ARE OpenAPI/Swagger specs with IBM extensions (x-ibm-*).
For reverse engineering, extract:
- info.title → apiTitle
- info.version → apiVersion
- servers[0].url → primary base URL
- paths → endpointCatalog (one entry per path+method combination)
- components.schemas / definitions → requestResponseSchemas
- components.securitySchemes / securityDefinitions → securityAnalysis
- x-ibm-configuration.assembly.execute[] → transformationMapping steps
- x-ibm-configuration.assembly.execute[].invoke.target-url → routingDocument backendUrl
The generated target OpenAPI spec should mirror the paths but strip x-ibm-* extensions,
add standard OpenAPI 3.0 structure, and replace APIC-specific security with standard OAuth2/JWT schemes.`
  },

];

module.exports = docs;

'use strict';
/**
 * RAG Knowledge Base — Spring Boot 3 Code Generation Best Practices
 * These apply regardless of source platform.
 */
const docs = [

  {
    id: 'sb-pom-dependencies',
    platform: 'ALL',
    phase: 'gen',
    tags: ['pom.xml', 'Maven', 'dependencies', 'Spring Boot', 'parent', 'starter', 'resilience4j', 'actuator', 'security', 'webflux', 'lombok'],
    title: 'Spring Boot 3 pom.xml Dependency Reference',
    content: `Required Maven dependencies for a production Spring Boot 3 / Java 21 microservice:
<parent> spring-boot-starter-parent 3.2.x </parent>
Core: spring-boot-starter-web (REST), spring-boot-starter-webflux (WebClient reactive).
Security: spring-boot-starter-security, spring-security-oauth2-resource-server (JWT), spring-security-oauth2-jose.
Resilience: io.github.resilience4j:resilience4j-spring-boot3:2.x, io.github.resilience4j:resilience4j-reactor.
Observability: spring-boot-starter-actuator, micrometer-registry-prometheus (optional).
Validation: spring-boot-starter-validation (Jakarta Bean Validation).
JSON: spring-boot-starter-json (Jackson auto-configured; no extra dependency needed).
Lombok: org.projectlombok:lombok (scope provided).
Testing: spring-boot-starter-test (JUnit 5 + Mockito + MockMvc), reactor-test.
MQ (if needed): com.ibm.mq:mq-jms-spring-boot-starter or spring-boot-starter-activemq.
XML (if XSLT migration): spring-ws-core (for SOAP), or just javax.xml.transform from JDK.`
  },

  {
    id: 'sb-application-yml',
    platform: 'ALL',
    phase: 'gen',
    tags: ['application.yml', 'configuration', 'server.port', 'spring.application.name', 'resilience4j', 'logging', 'management'],
    title: 'Spring Boot application.yml Template',
    content: `Production-ready application.yml structure:
server:
  port: 8080
spring:
  application:
    name: <service-name>
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: \${JWT_ISSUER_URI:http://localhost:8180/realms/master}
backend:
  base-url: \${BACKEND_URL:http://localhost:9090}
  timeout-seconds: \${BACKEND_TIMEOUT:30}
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      show-details: when-authorized
resilience4j:
  retry:
    instances:
      backendClient:
        max-attempts: 3
        wait-duration: 1s
        retry-exceptions: java.io.IOException, org.springframework.web.reactive.function.client.WebClientResponseException
  circuitbreaker:
    instances:
      backendClient:
        failure-rate-threshold: 50
        wait-duration-in-open-state: 10s
  timelimiter:
    instances:
      backendClient:
        timeout-duration: \${backend.timeout-seconds:30}s
logging:
  level:
    root: INFO
    com.modernizer: DEBUG`
  },

  {
    id: 'sb-security-config',
    platform: 'ALL',
    phase: 'gen',
    tags: ['SecurityConfig', 'SecurityFilterChain', 'csrf', 'cors', 'permitAll', 'authenticated', 'oauth2ResourceServer', 'JWT'],
    title: 'Spring Boot SecurityConfig Patterns',
    content: `Standard SecurityConfig.java for Spring Boot 3:
@Configuration @EnableWebSecurity
public class SecurityConfig {
  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
      .csrf(AbstractHttpConfigurer::disable)          // REST API — no CSRF needed
      .cors(cors -> cors.configurationSource(corsSource()))
      .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
      .authorizeHttpRequests(auth -> auth
          .requestMatchers("/actuator/health", "/actuator/info").permitAll()
          .anyRequest().authenticated())
      // Choose ONE of the following based on securityAnalysis:
      // JWT/OAuth2: 
      .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
      // API Key: add a custom filter BEFORE UsernamePasswordAuthenticationFilter
      // .addFilterBefore(new ApiKeyFilter(validKeys), UsernamePasswordAuthenticationFilter.class)
      .build();
  }
}
For API Key filter: read X-IBM-Client-Id header; validate against allowed keys list from application.yml.
For mTLS: set server.ssl.client-auth=need and inject X509Certificate from Principal.`
  },

  {
    id: 'sb-webclient-config',
    platform: 'ALL',
    phase: 'gen',
    tags: ['WebClientConfig', 'WebClient', 'Builder', 'timeout', 'retry', 'filter', 'baseUrl', 'connectionTimeout'],
    title: 'Spring Boot WebClient Configuration',
    content: `WebClientConfig.java for resilient backend calls:
@Configuration
public class WebClientConfig {
  @Bean
  public WebClient.Builder webClientBuilder(
      @Value("\${backend.timeout-seconds:30}") int timeoutSeconds) {
    HttpClient httpClient = HttpClient.create()
        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5_000)
        .responseTimeout(Duration.ofSeconds(timeoutSeconds))
        .doOnConnected(conn -> conn
            .addHandlerLast(new ReadTimeoutHandler(timeoutSeconds))
            .addHandlerLast(new WriteTimeoutHandler(timeoutSeconds)));
    return WebClient.builder()
        .clientConnector(new ReactorClientHttpConnector(httpClient))
        .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
        .filter(correlationIdFilter());
  }
  private ExchangeFilterFunction correlationIdFilter() {
    return (req, next) -> {
      String correlationId = req.headers().getFirst("X-Correlation-Id");
      if (correlationId == null) correlationId = UUID.randomUUID().toString();
      return next.exchange(ClientRequest.from(req)
          .header("X-Correlation-Id", correlationId).build());
    };
  }
}
Import: io.netty.channel.ChannelOption, io.netty.handler.timeout.ReadTimeoutHandler.`
  },

  {
    id: 'sb-exception-handler',
    platform: 'ALL',
    phase: 'gen',
    tags: ['GlobalExceptionHandler', 'RestControllerAdvice', 'ExceptionHandler', 'ProblemDetail', 'error response', 'RFC 7807'],
    title: 'Spring Boot Global Exception Handler Pattern',
    content: `GlobalExceptionHandler.java using RFC 7807 ProblemDetail (Spring 6 / Boot 3):
@RestControllerAdvice
public class GlobalExceptionHandler {
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
    pd.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
        .map(e -> e.getField() + ": " + e.getDefaultMessage()).toList());
    return pd;
  }
  @ExceptionHandler(ResponseStatusException.class)
  public ProblemDetail handleStatus(ResponseStatusException ex) {
    return ProblemDetail.forStatusAndDetail(ex.getStatusCode(), ex.getReason());
  }
  @ExceptionHandler(WebClientResponseException.class)
  public ProblemDetail handleBackendError(WebClientResponseException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, "Backend call failed");
    pd.setProperty("upstreamStatus", ex.getStatusCode().value());
    return pd;
  }
  @ExceptionHandler(Exception.class)
  public ProblemDetail handleGeneral(Exception ex) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
  }
}
Add one @ExceptionHandler per errorCode/errorHandling entry from the RE output.`
  },

  {
    id: 'sb-test-pattern',
    platform: 'ALL',
    phase: 'gen',
    tags: ['test', 'JUnit', 'Mockito', 'MockMvc', 'SpringBootTest', 'WebMvcTest', 'mock', 'assert', 'verify'],
    title: 'Spring Boot Test Patterns',
    content: `Controller test using @WebMvcTest (fast, no full context):
@WebMvcTest(CustomerController.class)
class CustomerControllerTest {
  @Autowired MockMvc mockMvc;
  @MockBean CustomerService service;
  @Test void getCustomer_returns200() throws Exception {
    when(service.getCustomer("123")).thenReturn(new CustomerResponse("123", "John"));
    mockMvc.perform(get("/customers/123").header("Authorization","Bearer test"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("123"))
        .andExpect(jsonPath("$.name").value("John"));
  }
  @Test void getCustomer_notFound_returns404() throws Exception {
    when(service.getCustomer("999")).thenThrow(new ResponseStatusException(NOT_FOUND,"Not found"));
    mockMvc.perform(get("/customers/999")).andExpect(status().isNotFound());
  }
}
Use @SpringBootTest + TestRestTemplate for full integration tests.
Use WireMock (org.wiremock:wiremock-spring-boot) to mock backend HTTP calls.
Generate one @Test method per test scenario in the RE testScenarios[] array.`
  },

  {
    id: 'sb-dockerfile',
    platform: 'ALL',
    phase: 'gen',
    tags: ['Dockerfile', 'multi-stage', 'Maven', 'JRE', 'non-root', 'alpine', 'temurin', 'ENTRYPOINT'],
    title: 'Spring Boot Dockerfile — Multi-Stage, Non-Root',
    content: `Production Dockerfile for Spring Boot 3 / Java 21:
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
RUN chown appuser:appgroup app.jar
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java","-XX:+UseContainerSupport","-XX:MaxRAMPercentage=75.0","-jar","app.jar"]`
  },

  {
    id: 'sb-correlation-logging',
    platform: 'ALL',
    phase: 'gen',
    tags: ['correlation ID', 'MDC', 'logging', 'tracing', 'request ID', 'filter', 'OncePerRequestFilter', 'X-Correlation-Id'],
    title: 'Spring Boot Correlation ID & Structured Logging',
    content: `Correlation ID filter — ensures every log line includes a traceable request ID:
@Component
public class CorrelationIdFilter extends OncePerRequestFilter {
  private static final String HEADER = "X-Correlation-Id";
  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    String id = req.getHeader(HEADER);
    if (id == null || id.isBlank()) id = UUID.randomUUID().toString();
    MDC.put("correlationId", id);
    res.setHeader(HEADER, id);
    try { chain.doFilter(req, res); } finally { MDC.clear(); }
  }
}
Add to application.yml logging pattern: "%d %-5level [%X{correlationId}] %logger{36} - %msg%n"
In logback-spring.xml: <pattern>%d{ISO8601} %-5level [%X{correlationId:-NO_CORR}] %logger - %msg%n</pattern>`
  },

];

module.exports = docs;

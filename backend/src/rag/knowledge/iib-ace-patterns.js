'use strict';
/**
 * RAG Knowledge Base — IBM IIB / ACE Patterns
 */
const docs = [

  {
    id: 'iib-message-flow-anatomy',
    platform: 'IIB_ACE',
    phase: 'both',
    tags: ['message flow', 'msgflow', 'input node', 'output node', 'compute node', 'MQ', 'HTTP', 'SOAP'],
    title: 'IIB/ACE Message Flow Anatomy',
    content: `An IIB/ACE Message Flow is the primary processing unit. It consists of:
- Input node: receives messages (HTTPInputNode → REST/SOAP, MQInputNode → IBM MQ queue).
- Processing nodes: ComputeNode (ESQL), XSLTransformNode, MappingNode, FilterNode, RouteNode.
- Output node: HTTPReplyNode, MQOutputNode, SoapRequestNode, HTTPRequestNode.
Spring Boot migration mapping:
- HTTPInputNode → @RestController endpoint.
- MQInputNode → @JmsListener on a queue name (spring-boot-starter-activemq or IBM MQ starter).
- ComputeNode (ESQL) → @Service method implementing the ESQL logic.
- XSLTransformNode → Service method calling javax.xml.transform.Transformer.
- MappingNode → @Component Mapper class.
- RouteNode → Strategy pattern or if/else routing in the service layer.
- HTTPRequestNode → WebClient call in the BackendClient @Component.
- MQOutputNode → JmsTemplate.send() in the service layer.`
  },

  {
    id: 'iib-esql-patterns',
    platform: 'IIB_ACE',
    phase: 'both',
    tags: ['ESQL', 'Compute', 'DECLARE', 'SET', 'CALL', 'PROPAGATE', 'module', 'procedure', 'function', 'SQL'],
    title: 'IIB/ACE ESQL Common Patterns & Migration',
    content: `ESQL (Extended SQL) is the transformation and routing language in IIB/ACE. Key patterns:
1. DECLARE + SET → local variable declaration → Java local variable or field.
2. SET OutputRoot.JSON.Data.X = InputRoot.JSON.Data.Y → field mapping in mapper class.
3. SET OutputRoot.HTTPResponseHeader.X-Custom = 'value' → response header via ResponseEntity or HttpServletResponse.
4. IF ... THEN ... ELSEIF ... ELSE ... END IF → Java if/else in service method.
5. FOR path AS cursor DO ... END FOR → Java for-each loop over a collection.
6. CALL procedure() → Java method call on an injected @Service.
7. PROPAGATE TO TERMINAL 'out' → return the result from service method.
8. PROPAGATE TO LABEL 'failure' → throw a custom Exception caught by GlobalExceptionHandler.
9. PASSTHRU to backend → WebClient.get().uri(backendUrl).retrieve().bodyToMono().
10. CREATE LASTCHILD OF OutputRoot DOMAIN 'JSON' → Jackson ObjectNode building.
When ESQL files are NOT available in the ZIP: reconstruct logic from flow node names, 
message flow description, and project properties. Each ComputeNode named *_Transform or 
*_Enrich likely does field mapping. Document inferred logic in transformationMapping with 
type="INFERRED" and note the original ESQL module name.`
  },

  {
    id: 'iib-mq-integration',
    platform: 'IIB_ACE',
    phase: 'both',
    tags: ['MQ', 'queue', 'IBM MQ', 'JMS', 'message', 'async', 'queueName', 'topic', 'publish', 'subscribe'],
    title: 'IIB/ACE IBM MQ Integration Migration',
    content: `IIB/ACE flows frequently use IBM MQ for async messaging. Migration to Spring Boot:
1. MQInputNode (queueName="REQUEST.Q") → @JmsListener(destination="REQUEST.Q") on a @Service method.
   Add ibm-mq-spring-boot-starter or spring-boot-starter-activemq to pom.xml.
2. MQOutputNode (queueName="RESPONSE.Q") → inject JmsTemplate, call jmsTemplate.convertAndSend("RESPONSE.Q", payload).
3. MQ correlation ID → extract from JmsMessage.getJMSCorrelationID(); pass as X-Correlation-ID header.
4. Persistent messages → DeliveryMode.PERSISTENT in JmsTemplate config.
5. MQ connection factory → configure ibm.mq.* properties in application.yml when IBM MQ, 
   or spring.activemq.broker-url for ActiveMQ.
6. Dead letter queue → configure DefaultMessageListenerContainer with ErrorHandler.
When queue names are not found in the ZIP, mark as GAP and recommend: 
"Obtain queue names from IIB/ACE admin console or broker configuration XML".`
  },

  {
    id: 'iib-xsd-wsdl-mapping',
    platform: 'IIB_ACE',
    phase: 'both',
    tags: ['XSD', 'schema', 'WSDL', 'SOAP', 'portType', 'operation', 'namespace', 'element', 'type'],
    title: 'IIB/ACE XSD/WSDL Schema Migration',
    content: `IIB/ACE projects often include XSD schemas and WSDL definitions. Migration guidance:
XSD → Java POJO: each xs:complexType → a Java class with @JsonProperty fields.
WSDL portType operations → @PostMapping endpoints in a controller (SOAP-to-REST migration).
Namespace prefixes in WSDL → Java package name segments.
SOAP request/response message parts → Java request/response POJO fields.
XSD restrictions (minLength, maxLength, pattern) → Jakarta Bean Validation annotations 
  (@NotNull, @Size, @Pattern) on the POJO fields.
When XSD content is minimal or absent, infer model classes from ESQL field SET statements
(e.g., SET OutputRoot.JSON.Data.customerId = ... → String customerId field in Response POJO).`
  },

  {
    id: 'iib-missing-artifacts',
    platform: 'IIB_ACE',
    phase: 're',
    tags: ['missing', 'incomplete', 'no ESQL', 'no msgflow', 'partial', 'gap', 'inference', 'reconstruct'],
    title: 'Handling Incomplete IIB/ACE Artifacts',
    content: `When an IIB/ACE project ZIP is missing key files, apply these inference rules:
1. No .msgflow files: infer flows from project.properties (flow names listed), or from ESQL module names.
2. No ESQL files: infer compute node logic from node names. Nodes named *Filter* → filtering logic. 
   Nodes named *Enrich* → data enrichment/lookup. Nodes named *Route* → conditional routing.
3. No XSD/WSDL: infer model from project name and any available properties.
4. No endpoint URLs in properties: flag as GAP; suggest "Obtain HTTP listener port from broker.conf 
   and HTTP node hostName/port properties".
5. No .map files: assume mapping is implemented in ESQL. Review ESQL SET statements for field assignments.
Always enumerate gaps[] clearly: include the file type missing, the flow or node it belongs to, 
and what impact it has on the migration (CRITICAL/MAJOR/MINOR).`
  },

  {
    id: 'iib-flow-to-springboot',
    platform: 'IIB_ACE',
    phase: 'gen',
    tags: ['Spring Boot', 'flow', 'service', 'route', 'handler', 'correlation', 'header', 'propagate'],
    title: 'IIB/ACE Flow to Spring Boot Architecture Map',
    content: `Complete IIB/ACE message flow → Spring Boot component mapping:
Flow file (.msgflow) → one @RestController class per HTTP-facing flow.
ESQL Compute module → one @Service method per CREATE COMPUTE MODULE.
Graphical mapping (.map) → @Component Mapper class with one method per target field group.
Properties file endpoint URLs → @Value("\${backend.url}") in WebClient config.
Flow property overrides → application.yml properties under custom namespace.
Correlation ID pattern:
  - IIB: SET OutputRoot.HTTPResponseHeader.X-Correlation-Id = InputRoot.HTTPInputHeader.X-Correlation-Id
  - Spring Boot: @Component CorrelationFilter extends OncePerRequestFilter; reads X-Correlation-Id 
    from request, sets in MDC, copies to response.
Timeout property:
  - IIB: HTTP Request node connTimeout / socketTimeout → 
  - Spring Boot: WebClient builder .responseTimeout(Duration.ofMillis(n)).`
  },

  {
    id: 'iib-error-handling',
    platform: 'IIB_ACE',
    phase: 'both',
    tags: ['error', 'exception', 'failure', 'fault', 'catch', 'try', 'MQRC', 'throw', 'UserException'],
    title: 'IIB/ACE Error Handling Migration',
    content: `IIB/ACE error handling patterns and Spring Boot equivalents:
1. THROW USER EXCEPTION with msgCatalog → throw new CustomException(message, errorCode) in service.
   Map to @ExceptionHandler in @RestControllerAdvice returning RFC 7807 ProblemDetail.
2. Failure terminal → throw RuntimeException; handled by GlobalExceptionHandler.
3. Catch node → @ExceptionHandler on specific exception type in GlobalExceptionHandler.
4. MQMD_ReplyToQ (MQ reply-to) → async reply via JmsTemplate to the reply queue.
5. HTTP error codes in ESQL (SET OutputRoot.HTTPResponseHeader.X-Error-Code = '404') →
   throw ResponseStatusException(HttpStatus.NOT_FOUND, message) in service.
6. Retry via IIB Timeout node → @Retryable(maxAttempts=3, backoff=@Backoff(delay=1000)) on service method
   using spring-retry or resilience4j @Retry.`
  },

];

module.exports = docs;

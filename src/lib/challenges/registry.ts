export type ChallengeKey =
  | "idor"
  | "sqli"
  | "xss"
  | "csrf"
  | "api-idor"
  | "ssrf"
  | "file-inclusion"
  | "command-injection"
  | "xxe"
  | "template-injection"
  | "crypto-failure"
  | "security-misconfiguration"
  | "auth-failure"
  | "supply-chain"
  | "exception-handling"
  | "mass-assignment"
  | "open-redirect"
  | "cors-misconfiguration"
  | "jwt-confusion"
  | "nosql-injection"
  | "graphql-authorization"
  | "coupon-race"
  | "prototype-pollution"
  | "deserialization"
  | "request-smuggling"
  | "cache-poisoning"
  | "host-header-injection"
  | "oauth-failure"
  | "websocket-authorization"
  | "capstone";

export interface SolutionGuide {
  answer: string;
  explanation: string;
  remediation: string;
}

export interface ChallengeMeta {
  key: ChallengeKey;
  order: number;
  title: string;
  path: string;
  difficulty: "Easy" | "Medium" | "Hard" | "Very Hard";
  summary: string;
  hints: string[];
  solution: SolutionGuide;
}

/** Fixed sequential curriculum. Only one new challenge unlocks at a time. */
const CHALLENGE_DEFINITIONS: readonly Omit<ChallengeMeta, "solution">[] = [
  {
    key: "idor",
    order: 1,
    title: "Confidential Records (Broken Object-Level Authorization)",
    path: "/challenges/idor",
    difficulty: "Easy",
    summary:
      "Your generated company world has several HR records. Something you shouldn't be able to open is only one click away.",
    hints: [
      "The record viewer takes a record number from the URL. What happens if you change it?",
      "Not every record is meant for every clearance level — does the app actually check that?",
      "You only ever see your own world's records; try every small integer, not just the ones linked from the page.",
    ],
  },
  {
    key: "sqli",
    order: 2,
    title: "Directory Search (SQL Injection)",
    path: "/challenges/sqli",
    difficulty: "Easy",
    summary:
      "A search box queries a small, isolated challenge database. The visible columns never show a flag — but the query might return more than intended.",
    hints: [
      "The search term is inserted directly into the SQL text, not bound as a parameter.",
      "Try breaking out of the string with a single quote (') and see what error comes back.",
      "A UNION SELECT can add extra columns to the result set, including ones the app never intended to display.",
    ],
  },
  {
    key: "xss",
    order: 3,
    title: "Guestbook (Stored Cross-Site Scripting)",
    path: "/challenges/xss",
    difficulty: "Medium",
    summary:
      "Post a guestbook message. It is rendered back to you, unescaped, inside a sandboxed preview frame. Can you get it to call home?",
    hints: [
      "The preview frame runs your exact HTML/JS — the app does not sanitize it.",
      "The frame has no cookies and no access to the parent page (it's sandboxed), so you need another way to prove code ran.",
      "Look for a global flag value available inside the frame, and send it to /api/challenges/xss/callback yourself.",
    ],
  },
  {
    key: "csrf",
    order: 4,
    title: "Notification Settings (Cross-Site Request Forgery)",
    path: "/challenges/labs/csrf",
    difficulty: "Medium",
    summary:
      "A legacy settings endpoint changes state through a GET request and never checks a CSRF token.",
    hints: [
      "A link or image can make a browser send an authenticated GET request.",
      "Inspect the example endpoint and change its action parameter.",
      "Visit /api/challenges/labs/csrf?action=disable-alerts while logged in.",
    ],
  },
  {
    key: "api-idor",
    order: 5,
    title: "Invoice API (IDOR)",
    path: "/challenges/labs/api-idor",
    difficulty: "Medium",
    summary:
      "An API exposes sequential invoice identifiers but forgets object-level authorization.",
    hints: [
      "The visible invoice identifier ends in 4101.",
      "APIs need the same object authorization checks as HTML pages.",
      "Request invoice 4102.",
    ],
  },
  {
    key: "ssrf",
    order: 6,
    title: "URL Previewer (SSRF)",
    path: "/challenges/labs/ssrf",
    difficulty: "Hard",
    summary:
      "A simulated URL preview service can reach a synthetic metadata host that browsers cannot.",
    hints: [
      "Cloud-style metadata often lives on an internal-only hostname.",
      "This lab simulates requests; it never contacts the real network.",
      "Preview http://metadata.lab/latest/flag.",
    ],
  },
  {
    key: "file-inclusion",
    order: 7,
    title: "Theme Loader (LFI / RFI)",
    path: "/challenges/labs/file-inclusion",
    difficulty: "Hard",
    summary:
      "A simulated template loader joins an untrusted path to its theme directory.",
    hints: [
      "The normal file is themes/default.txt.",
      "Parent-directory segments can escape a naively joined directory.",
      "Load ../../etc/lab-secret.",
    ],
  },
  {
    key: "command-injection",
    order: 8,
    title: "Diagnostics Console (Command Injection)",
    path: "/challenges/labs/command-injection",
    difficulty: "Hard",
    summary:
      "A synthetic shell command concatenates a hostname into a diagnostics command.",
    hints: [
      "Shell separators allow a second command to run.",
      "No command is executed on your computer; this is a deterministic simulator.",
      "Try localhost; cat /opt/lab/flag.",
    ],
  },
  {
    key: "xxe",
    order: 9,
    title: "XML Importer (XXE)",
    path: "/challenges/labs/xxe",
    difficulty: "Hard",
    summary:
      "A simulated legacy XML parser expands external entities from a fictional filesystem.",
    hints: [
      "A DOCTYPE can define an external entity.",
      "Reference file:///opt/lab/flag, then use the entity in the document.",
      "The simulator recognizes the XXE structure without enabling real external entities.",
    ],
  },
  {
    key: "template-injection",
    order: 10,
    title: "Receipt Renderer (Template Injection)",
    path: "/challenges/labs/template-injection",
    difficulty: "Hard",
    summary:
      "User-controlled text is evaluated as a simulated server-side template.",
    hints: [
      "First test whether arithmetic expressions are evaluated.",
      "The fictional template context contains a config object.",
      "Render {{config.FLAG}}.",
    ],
  },
  {
    key: "crypto-failure",
    order: 11,
    title: "Legacy Token (Cryptographic Failure)",
    path: "/challenges/labs/crypto-failure",
    difficulty: "Hard",
    summary:
      "A secret was protected with repeating-key XOR and then encoded as hexadecimal.",
    hints: [
      "Encoding is not encryption, and repeating-key XOR is weak.",
      "The key is LAB; XOR each ciphertext byte with repeating key bytes.",
      "Submit the recovered FLAG value.",
    ],
  },
  {
    key: "security-misconfiguration",
    order: 12,
    title: "Backup Explorer (Security Misconfiguration)",
    path: "/challenges/labs/security-misconfiguration",
    difficulty: "Hard",
    summary:
      "A deployment accidentally exposes a sensitive backup file in its public directory.",
    hints: [
      "Developers often append extensions when making quick backups.",
      "Try common environment-file backup names.",
      "Request /.env.backup.",
    ],
  },
  {
    key: "auth-failure",
    order: 13,
    title: "Session Portal (Authentication Failure)",
    path: "/challenges/labs/auth-failure",
    difficulty: "Hard",
    summary:
      "A fictional portal accepts a predictable privileged session identifier.",
    hints: [
      "The sample user session is guest-session.",
      "Predictability makes session identifiers unsafe.",
      "Submit admin-session.",
    ],
  },
  {
    key: "supply-chain",
    order: 14,
    title: "Dependency Audit (Software Supply Chain Failure)",
    path: "/challenges/labs/supply-chain",
    difficulty: "Very Hard",
    summary:
      "Review a synthetic lockfile and identify the dependency fetched from an untrusted source.",
    hints: [
      "Official packages resolve from the configured registry.",
      "Look for a package resolved directly from an unexpected Git host.",
      "Submit telemetry-helper.",
    ],
  },
  {
    key: "exception-handling",
    order: 15,
    title: "Report Generator (Exceptional Condition Mishandling)",
    path: "/challenges/labs/exception-handling",
    difficulty: "Very Hard",
    summary:
      "A malformed report identifier leaks a verbose synthetic stack trace and an internal diagnostic value.",
    hints: [
      "Try an identifier that cannot be parsed as an integer.",
      "Read the simulated error carefully; no real stack or environment is exposed.",
      "Submit the leaked FLAG value to finish.",
    ],
  },
  {
    key: "mass-assignment",
    order: 16,
    title: "Profile Editor (Mass Assignment)",
    path: "/challenges/labs/mass-assignment",
    difficulty: "Hard",
    summary:
      "A fictional profile updater copies every submitted field, including a server-managed role.",
    hints: [
      "The visible form only needs displayName, but the update accepts JSON.",
      "Try adding a role property.",
      'Submit {"displayName":"analyst","role":"admin"}.',
    ],
  },
  {
    key: "open-redirect",
    order: 17,
    title: "Virtual Login Callback (Open Redirect)",
    path: "/challenges/labs/open-redirect",
    difficulty: "Hard",
    summary:
      "A virtual callback trusts an external return URL; it reports the destination but never redirects your browser.",
    hints: [
      "The callback should allow only local paths.",
      "Use an absolute URL on the fictional attacker.invalid host.",
      "No real Location header or navigation is produced by this simulator.",
    ],
  },
  {
    key: "cors-misconfiguration",
    order: 18,
    title: "Fictional Partner API (CORS Misconfiguration)",
    path: "/challenges/labs/cors-misconfiguration",
    difficulty: "Hard",
    summary:
      "A sandboxed API simulation reflects arbitrary origins while allowing credentials.",
    hints: [
      "Credentialed endpoints must not trust arbitrary Origin values.",
      "Try the fictional origin https://attacker.invalid.",
      "The displayed headers are text; the real response does not enable CORS.",
    ],
  },
  {
    key: "jwt-confusion",
    order: 19,
    title: "Fictional Token Verifier (JWT Algorithm Confusion)",
    path: "/challenges/labs/jwt-confusion",
    difficulty: "Very Hard",
    summary:
      "A synthetic verifier incorrectly accepts its public verification key as an HMAC secret.",
    hints: [
      "The expected algorithm is RS256.",
      "The vulnerable verifier also accepts HS256 with the published key.",
      "Tokens use a documented lab-only text format, never the app's real sessions.",
    ],
  },
  {
    key: "nosql-injection",
    order: 20,
    title: "Document Login (NoSQL Injection Simulator)",
    path: "/challenges/labs/nosql-injection",
    difficulty: "Very Hard",
    summary:
      "A virtual document lookup accepts query operators where credentials should be strings.",
    hints: [
      "The simulator accepts JSON but never connects to a document database.",
      "A not-equal operator can turn equality checks into broad matches.",
      "Use $ne operators for both username and password.",
    ],
  },
  {
    key: "graphql-authorization",
    order: 21,
    title: "Employee Graph (GraphQL Authorization)",
    path: "/challenges/labs/graphql-authorization",
    difficulty: "Very Hard",
    summary:
      "A narrow GraphQL simulator exposes a private field without field-level authorization.",
    hints: [
      "You are employee 1; another synthetic employee has id 2.",
      "Ask for privateNote, not just public fields.",
      'Query user(id:"2"){privateNote}.',
    ],
  },
  {
    key: "coupon-race",
    order: 22,
    title: "Coupon Checkout (Bounded Race)",
    path: "/challenges/labs/coupon-race",
    difficulty: "Very Hard",
    summary:
      "A deterministic two-request scheduler models a check-then-update coupon race, capped per player.",
    hints: [
      "A single-use coupon is checked before its redemption is recorded.",
      "Schedule two virtual requests against the same stale snapshot.",
      "Submit RACE 2; no real threads or unbounded requests are created.",
    ],
  },
  {
    key: "prototype-pollution",
    order: 23,
    title: "Settings Merge (Prototype Pollution Simulator)",
    path: "/challenges/labs/prototype-pollution",
    difficulty: "Very Hard",
    summary:
      "A virtual merge models a dangerous __proto__ key using inert records without changing JavaScript globals.",
    hints: [
      "The fictional authorization defaults to isAdmin=false.",
      "Try nesting isAdmin under __proto__.",
      "The simulator inspects parsed data directly and never assigns to a prototype.",
    ],
  },
  {
    key: "deserialization",
    order: 24,
    title: "Job Importer (Deserialization Simulator)",
    path: "/challenges/labs/deserialization",
    difficulty: "Very Hard",
    summary:
      "A fixed JSON model demonstrates unsafe type dispatch without constructing classes or executing code.",
    hints: [
      "The importer trusts a serialized type and action.",
      "Request the DiagnosticJob type with revealFlag action.",
      "Only a fixed pair of strings is interpreted.",
    ],
  },
  {
    key: "request-smuggling",
    order: 25,
    title: "Proxy Queue (Request Smuggling Parser)",
    path: "/challenges/labs/request-smuggling",
    difficulty: "Very Hard",
    summary:
      "Two bounded byte parsers disagree about Content-Length and Transfer-Encoding without opening a socket.",
    hints: [
      "Front end and back end disagree when both framing headers exist.",
      "Include Transfer-Encoding: chunked and Content-Length in the virtual bytes.",
      "Smuggle GET /admin/flag after a zero-length chunk.",
    ],
  },
  {
    key: "cache-poisoning",
    order: 26,
    title: "Reset Page Cache (Per-Player Cache Poisoning)",
    path: "/challenges/labs/cache-poisoning",
    difficulty: "Very Hard",
    summary:
      "A private virtual cache keys only by path and trusts an unkeyed host header.",
    hints: [
      "First prime the synthetic cache with attacker.invalid.",
      "Then request the victim view to observe the cached reset link.",
      "Use PRIME attacker.invalid, then GET.",
    ],
  },
  {
    key: "host-header-injection",
    order: 27,
    title: "Reset Link Preview (Host Header Injection)",
    path: "/challenges/labs/host-header-injection",
    difficulty: "Very Hard",
    summary:
      "A fictional reset-link generator trusts a supplied host but sends no email and creates no real token.",
    hints: [
      "Absolute links should use a configured origin, not the Host header.",
      "Supply attacker.invalid as the fictional host.",
      "The result exists only in a synthetic outbox string.",
    ],
  },
  {
    key: "oauth-failure",
    order: 28,
    title: "OAuth Return Handler (Simulated State Failure)",
    path: "/challenges/labs/oauth-failure",
    difficulty: "Very Hard",
    summary:
      "A simulated OAuth callback omits state validation and trusts an unregistered redirect URI.",
    hints: [
      "Both state binding and exact redirect URI validation matter.",
      "Use state=missing and redirect_uri=https://attacker.invalid/callback.",
      "No identity provider or real authorization code is involved.",
    ],
  },
  {
    key: "websocket-authorization",
    order: 29,
    title: "Audit Stream (WebSocket Authorization Protocol)",
    path: "/challenges/labs/websocket-authorization",
    difficulty: "Very Hard",
    summary:
      "A line-oriented protocol simulator authorizes connection setup but not channel subscriptions.",
    hints: [
      "Authenticate as guest, then subscribe to a privileged channel.",
      "Send AUTH guest followed by SUBSCRIBE admin.audit.",
      "No WebSocket server or general-purpose socket is opened.",
    ],
  },
  {
    key: "capstone",
    order: 30,
    title: "Incident Portal (Contained Capstone)",
    path: "/challenges/labs/capstone",
    difficulty: "Very Hard",
    summary:
      "A three-stage, per-player incident combines unsafe field binding, cache trust, and channel authorization.",
    hints: [
      "Stages must be completed in order and are stored only in your lab state.",
      "Start with ASSIGN role=admin, then PRIME attacker.invalid.",
      "Finish with SUBSCRIBE admin.audit.",
    ],
  },
];

const SOLUTION_GUIDES = {
  idor: {
    answer: "Open /challenges/idor?recordIndex=4.",
    explanation:
      "Record 4 is the generated confidential record. The lookup scopes records to your lab world but never enforces its clearance requirement.",
    remediation:
      "Authorize every object read on the server against the current user and object; never rely on hidden links or unpredictable identifiers.",
  },
  sqli: {
    answer: "Search for: ' UNION SELECT id,title,secret_flag FROM items --",
    explanation:
      "The quote closes the ILIKE value, UNION adds the secret column to the three-column result, and the comment removes the remaining query text.",
    remediation:
      "Use parameterized queries, a constrained database role, generic errors, and allowlisted query structure.",
  },
  xss: {
    answer:
      "<script>fetch(`/api/challenges/xss/callback?rt=${encodeURIComponent(window.__RENDER_TOKEN__)}&flag=${encodeURIComponent(window.__CHALLENGE_FLAG__)}`)</script>",
    explanation:
      "Stored content is inserted as HTML, so the script reads the frame's one-time values and reports them to the callback.",
    remediation:
      "Contextually encode untrusted output, sanitize allowed HTML, and enforce a restrictive CSP as defense in depth.",
  },
  csrf: {
    answer:
      "Visit /api/challenges/labs/csrf?action=disable-alerts while logged in.",
    explanation:
      "The endpoint changes state through an authenticated GET and requires no unpredictable CSRF proof.",
    remediation:
      "Use non-GET methods for mutations and validate a session-bound CSRF token plus Origin/SameSite protections.",
  },
  "api-idor": {
    answer: "Submit invoice ID 4102.",
    explanation:
      "The API returns any existing sequential invoice without checking that the caller owns it.",
    remediation:
      "Apply object-level authorization to every API lookup and scope database queries to the authenticated principal.",
  },
  ssrf: {
    answer: "Submit http://metadata.lab/latest/flag.",
    explanation:
      "The preview service can reach the lab's internal metadata host because it trusts the supplied destination.",
    remediation:
      "Allowlist destinations, resolve and validate every redirect/IP, block private and metadata ranges, and use egress controls.",
  },
  "file-inclusion": {
    answer: "Submit ../../etc/lab-secret.",
    explanation:
      "Parent-directory segments escape the intended theme directory and select the synthetic secret file.",
    remediation:
      "Map user choices to fixed files and verify the canonical resolved path remains beneath a non-public base directory.",
  },
  "command-injection": {
    answer: "Submit localhost; cat /opt/lab/flag.",
    explanation:
      "The shell separator ends the intended ping argument and starts a second command that reads the flag.",
    remediation:
      "Avoid shells, pass arguments directly to a fixed executable, strictly validate inputs, and run with least privilege.",
  },
  xxe: {
    answer:
      '<!DOCTYPE report [<!ENTITY x SYSTEM "file:///opt/lab/flag">]><report>&x;</report>',
    explanation:
      "The unsafe XML behavior resolves the external file entity and expands it into the document.",
    remediation:
      "Disable DTD and external-entity resolution, use a hardened parser, and restrict parser filesystem/network access.",
  },
  "template-injection": {
    answer: "Submit {{config.FLAG}}.",
    explanation:
      "Untrusted text is evaluated as a server template and can read the template context's config object.",
    remediation:
      "Treat user input as data, not template source; use logicless templates and expose only a minimal context.",
  },
  "crypto-failure": {
    answer:
      "Hex-decode the displayed ciphertext, XOR each byte with repeating ASCII key LAB, then submit the recovered FLAG value.",
    explanation:
      "Repeating-key XOR reuses a short keystream, and the disclosed key reverses every ciphertext byte.",
    remediation:
      "Use a reviewed authenticated-encryption scheme with protected, rotated keys and unique nonces; never invent cryptography.",
  },
  "security-misconfiguration": {
    answer: "Submit /.env.backup.",
    explanation:
      "A deployment backup containing sensitive configuration was copied into the public file tree.",
    remediation:
      "Exclude secrets and backups from artifacts, deny dot/backup files at the server, and scan deployments for exposures.",
  },
  "auth-failure": {
    answer: "Submit admin-session.",
    explanation:
      "The privileged session identifier is predictable from the observed guest identifier and is accepted as authentication.",
    remediation:
      "Generate high-entropy server-side sessions, rotate them after authentication, expire them, and protect cookies securely.",
  },
  "supply-chain": {
    answer: "Submit telemetry-helper.",
    explanation:
      "That lockfile entry resolves from an unexpected attacker-controlled Git host instead of the trusted registry.",
    remediation:
      "Pin versions and integrity hashes, restrict registries/sources, review lockfile changes, and continuously audit dependencies.",
  },
  "exception-handling": {
    answer:
      "Submit a non-integer such as abc, copy the leaked diagnosticContext FLAG from the error, then submit that FLAG.",
    explanation:
      "Malformed input reaches verbose exception handling that discloses an internal diagnostic secret.",
    remediation:
      "Return generic client errors, keep detailed exceptions in access-controlled logs, and never include secrets in diagnostics.",
  },
  "mass-assignment": {
    answer: 'Submit {"displayName":"analyst","role":"admin"}.',
    explanation:
      "The binder copies the extra server-managed role field even though the visible profile form does not expose it.",
    remediation:
      "Allowlist writable DTO fields and set roles/ownership only through separately authorized server-side operations.",
  },
  "open-redirect": {
    answer: "Submit https://attacker.invalid/callback.",
    explanation:
      "The callback accepts an absolute external return URL instead of restricting navigation to trusted local destinations.",
    remediation:
      "Allowlist exact destinations or accept only normalized relative paths; reject scheme-relative and absolute URLs.",
  },
  "cors-misconfiguration": {
    answer: "Submit https://attacker.invalid.",
    explanation:
      "The simulated API reflects an arbitrary Origin while allowing credentials, exposing its private response cross-origin.",
    remediation:
      "Allowlist exact trusted origins, never combine reflected arbitrary origins with credentials, and enforce authorization server-side.",
  },
  "jwt-confusion": {
    answer: "Submit alg=HS256;role=admin;key=LAB-RSA-PUBLIC.",
    explanation:
      "The verifier accepts HS256 and misuses the published RSA verification key as an HMAC signing secret.",
    remediation:
      "Pin the expected JWT algorithm/key type, reject header-driven algorithm changes, and use maintained verification libraries.",
  },
  "nosql-injection": {
    answer: 'Submit {"username":{"$ne":null},"password":{"$ne":null}}.',
    explanation:
      "Operator objects replace credential strings, turning both equality checks into broad not-equal matches.",
    remediation:
      "Validate credentials as strings, reject query operators, and construct fixed database predicates from typed values.",
  },
  "graphql-authorization": {
    answer: 'Submit query { user(id:"2") { privateNote } }.',
    explanation:
      "The resolver exposes another employee's private field without field- or object-level authorization.",
    remediation:
      "Authorize each resolver and sensitive field against the caller, not merely the top-level GraphQL operation.",
  },
  "coupon-race": {
    answer: "Submit RACE 2.",
    explanation:
      "Two requests check the same stale unused state before either records redemption, so both are accepted.",
    remediation:
      "Make check-and-update atomic with a transaction, row lock, unique constraint, or conditional update.",
  },
  "prototype-pollution": {
    answer: 'Submit {"__proto__":{"isAdmin":true}}.',
    explanation:
      "The unsafe merge treats __proto__ as mergeable input, allowing inherited authorization defaults to be changed.",
    remediation:
      "Reject prototype keys, use safe merge libraries and null-prototype maps, and never base authorization on inherited properties.",
  },
  deserialization: {
    answer: 'Submit {"type":"DiagnosticJob","action":"revealFlag"}.',
    explanation:
      "The importer trusts attacker-selected type and action fields and dispatches a privileged behavior.",
    remediation:
      "Deserialize into fixed data schemas, allowlist types/actions, avoid gadget-capable native formats, and authorize dispatch.",
  },
  "request-smuggling": {
    answer:
      "Submit:\nPOST / HTTP/1.1\nContent-Length: 4\nTransfer-Encoding: chunked\n\n0\n\nGET /admin/flag HTTP/1.1",
    explanation:
      "The front and back parsers choose different framing headers, leaving the appended request queued for the protected path.",
    remediation:
      "Reject ambiguous CL/TE requests, normalize framing once, align proxy/origin parsers, and prefer end-to-end HTTP/2.",
  },
  "cache-poisoning": {
    answer: "Submit PRIME attacker.invalid, then submit GET.",
    explanation:
      "The cache omits Host from its key but uses Host in the response, so the attacker-controlled reset link is served later.",
    remediation:
      "Key caches on every response-varying input, ignore untrusted forwarding headers, and build links from a configured origin.",
  },
  "host-header-injection": {
    answer: "Submit attacker.invalid.",
    explanation:
      "The reset-link generator trusts the supplied Host and embeds it in a security-sensitive absolute URL.",
    remediation:
      "Use a configured canonical origin, validate allowed hosts at the edge, and avoid deriving security links from request headers.",
  },
  "oauth-failure": {
    answer:
      "Submit state=missing&redirect_uri=https%3A%2F%2Fattacker.invalid%2Fcallback&code=fictional.",
    explanation:
      "The handler neither binds state to the initiating session nor enforces the exact registered redirect URI.",
    remediation:
      "Generate and verify one-time session-bound state, require exact pre-registered redirects, and use PKCE.",
  },
  "websocket-authorization": {
    answer: "Submit two lines:\nAUTH guest\nSUBSCRIBE admin.audit",
    explanation:
      "Authentication occurs at connection setup, but the privileged channel subscription has no per-action authorization.",
    remediation:
      "Authorize every subscription/message, revalidate long-lived sessions, and enforce channel ACLs server-side.",
  },
  capstone: {
    answer:
      "Submit in order: ASSIGN role=admin; then PRIME attacker.invalid; then SUBSCRIBE admin.audit.",
    explanation:
      "Mass assignment grants a fictional role, unkeyed host input poisons the private cache, and missing channel authorization exposes the audit event.",
    remediation:
      "Allowlist bound fields, use complete cache keys/configured origins, and authorize every real-time subscription independently.",
  },
} satisfies Record<ChallengeKey, SolutionGuide>;

export const CHALLENGES: readonly ChallengeMeta[] = CHALLENGE_DEFINITIONS.map(
  (challenge) => ({
    ...challenge,
    solution: SOLUTION_GUIDES[challenge.key],
  }),
);

export function getChallengeMeta(key: ChallengeKey): ChallengeMeta {
  const meta = CHALLENGES.find((c) => c.key === key);
  if (!meta) throw new Error(`Unknown challenge key: ${key}`);
  return meta;
}

export function nextChallengeKey(key: ChallengeKey): ChallengeKey | undefined {
  const meta = getChallengeMeta(key);
  return CHALLENGES.find((c) => c.order === meta.order + 1)?.key;
}

# Domain companions

Extra attack classes for specific kinds of targets. Select a companion only when its boundary **exists in the target**, record the choice and the reason in `architecture.md`, and add its classes to the matching ledger units. A companion with no boundary in the code is excluded, with the reason written down.

| Companion | Select when the target has |
| --- | --- |
| [Web protocol and identity](#web-protocol-and-identity) | an HTTP server, sessions, OAuth/OIDC/SAML, caches or proxies |
| [Client-side](#client-side) | code running in a browser, webview or extension |
| [AI and LLM](#ai-and-llm) | model calls, agents, tools, RAG, MCP servers |
| [Cloud and deployment](#cloud-and-deployment) | IaC, containers, serverless, cloud SDKs, IAM |
| [Supply chain and release](#supply-chain-and-release) | dependencies, CI workflows, build scripts, published packages or images |
| [Protocols, RPC and messaging](#protocols-rpc-and-messaging) | gRPC, GraphQL, WebSockets, queues, webhooks, custom binary formats |
| [Data isolation and lifecycle](#data-isolation-and-lifecycle) | several tenants or users sharing storage, caches, search or exports |
| [Desktop, mobile and local IPC](#desktop-mobile-and-local-ipc) | Electron/Tauri, iOS/Android, deep links, local servers, IPC |
| [Native code and memory safety](#native-code-and-memory-safety) | C, C++, unsafe Rust, native addons, FFI, parsers of binary input |
| [Resource exhaustion and availability](#resource-exhaustion-and-availability) | public endpoints, paid third-party calls, expensive work per request |

---

## Web protocol and identity

- **Request framing**: differences between the proxy and the app in parsing `Content-Length`/`Transfer-Encoding`, duplicate headers, path normalisation (`/admin/..;/`, `%2e%2e`, trailing slashes, case), which let a request skip a route rule.
- **Trusted headers**: `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP`, `X-Original-URL` read for auth, rate limits, or link building without the proxy guaranteeing them; host-header injection into reset links.
- **Caches**: responses with user data cached by a shared cache (missing `Cache-Control: private`/`Vary`), cache keys that ignore auth, web cache deception through path suffixes.
- **Sessions**: fixation (session id not rotated at login), no invalidation on logout or password change, long-lived tokens without revocation.
- **OAuth/OIDC**: `redirect_uri` matched by prefix or regex, missing `state` or PKCE, `nonce` not checked, ID token accepted from the wrong issuer or audience, tokens in URLs or logs, account linking by unverified email.
- **SAML**: signature not required on the assertion, XML signature wrapping, comments in NameID, unchecked `Audience` and `Recipient`.
- **Password and MFA flows**: reset tokens reusable, guessable or not bound to the user; MFA skippable by calling the next step directly; recovery codes stored in clear.
- **CSRF**: state-changing `GET` routes, cookie auth without `SameSite` or a token, JSON endpoints that accept `text/plain`.

## Client-side

- **DOM XSS**: untrusted data (URL, `postMessage`, storage, API responses) into `innerHTML`, `outerHTML`, `document.write`, `insertAdjacentHTML`, `href`/`src` with `javascript:`, `eval`, `setTimeout(string)`, framework escape hatches (`dangerouslySetInnerHTML`, `v-html`, `[innerHTML]` with `bypassSecurityTrust*`).
- **postMessage**: listeners that do not check `event.origin`, or send to `*` with sensitive data.
- **Prototype pollution**: deep merges, `set(obj, path, value)` and query-string parsers that accept `__proto__`, `constructor`, `prototype`, and the gadgets they reach.
- **UI redress**: sensitive actions frameable (no `frame-ancestors`), and tabnabbing through `target=_blank` without `rel=noopener` on untrusted links.
- **Secrets in the bundle**: private keys, admin tokens or internal URLs shipped to the browser (public-by-design keys such as publishable keys are not findings).
- **Browser extensions**: content scripts that trust page messages, `externally_connectable` too broad, `web_accessible_resources` leaking, privileged APIs reachable from a content script through the background worker without checks, remote code loading.

## AI and LLM

- **Prompt injection to tool abuse**: untrusted text (web pages, emails, files, tool results, retrieved documents) that can make the model call a tool with side effects. The boundary is the tool's authority, not the model's output; check that each tool enforces the caller's permissions itself.
- **Excessive tool authority**: tools that run shell commands, SQL, file writes or HTTP fetches with the server's credentials instead of the user's, or across tenants.
- **Output handling**: model output rendered as HTML or Markdown with images/links (data exfiltration through URLs), executed as code, or used in queries without the same escaping as user input.
- **Data leakage**: system prompts or other users' conversations in context, retrieval that ignores document permissions, embeddings stores shared across tenants, logs that keep prompts with secrets.
- **MCP servers**: tools without per-user auth, tokens passed through to upstream APIs (confused deputy), missing `Origin` checks on local HTTP transports, tool descriptions that can be changed by untrusted data.
- **Cost and availability**: unbounded tokens, recursion or tool loops an anonymous user can trigger.

## Cloud and deployment

- **IAM**: wildcard actions or resources, roles assumable by too broad a principal, long-lived access keys, workload identities with admin rights.
- **Storage**: public buckets, presigned URLs with long expiry or user-controlled keys, encryption off where the policy requires it.
- **Network**: security groups or firewall rules open to `0.0.0.0/0` on admin ports, internal services exposed through a public load balancer, metadata endpoint reachable from user-controlled fetches (IMDSv1).
- **Containers**: running as root, `privileged`, host mounts, Docker socket mounted, secrets in image layers or build args, `latest` base images.
- **Kubernetes**: service accounts with cluster-wide rights, no network policies between tenants, secrets in ConfigMaps.
- **Serverless**: functions with broad roles, event sources that accept untrusted input as trusted (S3 keys, queue messages), environment variables holding secrets in plain text.

Only report what the IaC in the repo shows. Live cloud state is unknown and needs validation.

## Supply chain and release

- **Dependencies**: unpinned or floating versions, missing lock files, packages from an unexpected registry (dependency confusion via unscoped internal names), install scripts, typosquat-looking names, reachable vulnerable functions.
- **CI workflows**: `pull_request_target` or `workflow_run` that checks out and runs untrusted PR code with secrets; script injection from `${{ github.event.* }}` into `run:`; third-party actions not pinned to a commit SHA; `GITHUB_TOKEN` with write permissions by default; secrets exposed to forks; self-hosted runners for public repos.
- **Release**: unsigned artifacts or images, publish tokens with broad scope, release steps runnable from any branch, no provenance or SBOM where consumers expect one.
- **Build scripts**: code generation or downloads at build time without checksums.

## Protocols, RPC and messaging

- **Serialization**: polymorphic deserialization, unknown fields accepted into internal state, size and depth limits missing, schema not enforced at the edge.
- **gRPC and internal RPC**: services reachable without auth because "only internal callers" use them; metadata headers trusted for identity.
- **GraphQL**: missing per-field and per-resolver authorization, introspection in production, batching and aliasing that bypass rate limits, query depth and cost unbounded.
- **WebSockets**: no `Origin` check (cross-site WebSocket hijacking), auth only at connect time while permissions change, messages trusted without the same checks as HTTP.
- **Queues and events**: consumers that trust message contents as already validated, no idempotency (replay = double effect), poison messages that block the queue, producers any service can impersonate.
- **Webhooks (incoming)**: signature not verified, verified with a non-constant-time compare, timestamp not checked (replay), or the raw body re-serialized before verification.

## Data isolation and lifecycle

- **Tenant isolation**: every query, cache key, search index, file path, queue topic and background job scoped by tenant; the scope taken from the authenticated identity, never from the request.
- **Caches**: keys missing the user or tenant, shared in-memory caches across requests, memoized functions that ignore the caller.
- **Search and analytics**: indexes shared across tenants with filters applied only in the UI.
- **Exports and reports**: generated files stored at guessable paths, links that never expire, jobs that run with admin rights.
- **Deletion and retention**: data that survives account deletion (backups, search, caches, object storage, logs), soft-deleted records still reachable through other endpoints.
- **Personal data in logs, errors and analytics**.

## Desktop, mobile and local IPC

- **Electron and Tauri**: `nodeIntegration` on, `contextIsolation` off, `sandbox` off, preload scripts exposing broad APIs, `shell.openExternal` with untrusted URLs, navigation to remote content in privileged windows, Tauri allow-lists too broad.
- **Deep links and URL schemes**: handlers that perform actions or load URLs from link parameters without confirmation or validation; Android intents exported without permissions; iOS universal links not verified.
- **Webviews**: JavaScript bridges exposed to remote content, file access enabled, mixed content allowed.
- **Local servers and IPC**: localhost HTTP servers without auth or `Origin`/`Host` checks (DNS rebinding), named pipes and Unix sockets with loose permissions, IPC messages trusted without validating the sender.
- **Storage on the device**: tokens in plain preferences or files instead of the keychain/keystore, sensitive data in backups or logs.
- **Updates**: auto-update over HTTP or without signature checks.

## Native code and memory safety

- Buffer overflows, out-of-bounds reads and writes, use-after-free, double free, integer overflow in size calculations, format strings, uninitialised memory.
- Parsers of untrusted binary input (images, archives, fonts, documents, network packets): lengths and offsets taken from the input and used without bounds checks.
- `unsafe` Rust blocks, FFI boundaries, and native Node/Python addons that receive untrusted buffers.
- Prove with a sanitizer build (ASan, UBSan) or a fuzzer run inside the sandbox, with time and memory limits; a crash with a sanitizer report is a confirmed result, a theory is needs validation.

## Resource exhaustion and availability

Report only availability problems a lower-trust principal can cause cheaply and that hurt other users or the operator.

- Unbounded work per request: missing pagination limits, regular expressions with catastrophic backtracking (ReDoS), unbounded JSON/XML depth, XML entity expansion, decompression bombs, image dimensions not checked before decoding.
- Operator spend: anonymous access to paid APIs (LLMs, SMS, email, maps), uploads without size or count quotas, background jobs an anonymous user can enqueue without limit.
- Missing rate limits on login, password reset, OTP verification and signup, when they enable brute force or spam (that is the finding, not the missing limit itself).
- Locks and shared resources: a single user able to hold a lock, a connection pool or a queue partition.

Do not run load tests or denial-of-service attempts, even in the sandbox, beyond the smallest input that shows the unbounded cost.

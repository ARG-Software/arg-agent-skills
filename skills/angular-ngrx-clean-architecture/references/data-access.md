# Data access and configuration (infrastructure)

## Port (application) and implementation (infrastructure)

```ts
// src/app/core/application/ports/machine.api.ts
import type { Observable } from "rxjs";
import type { OeeDto, OeeFilter } from "@app/core/domain/production";

/** Abstract class, so it is both the contract and the DI token. */
export abstract class MachineApi {
  abstract getOee(filter: OeeFilter): Observable<OeeDto[]>;
}
```

Because the port lives in `core`, the DTO and filter types it uses live in `core/domain` (or `core/application/dtos`), never in a feature: `core` must not import features. The feature's `models/` keeps its UI models and mappers.

```ts
// src/app/infrastructure/api/base.api.ts
import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, map, throwError, type Observable } from "rxjs";
import { APP_CONFIG } from "../config/app-config";

/** The backend wraps every response as { success, result, error }. */
interface ApiEnvelope<T> {
  success: boolean;
  result: T;
  error: { code: string; message: string } | null;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export abstract class BaseApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).apiUrl;

  protected get<T>(path: string, params?: Record<string, string | readonly string[]>): Observable<T> {
    return this.unwrap(this.http.get<ApiEnvelope<T>>(`${this.baseUrl}${path}`, { params: new HttpParams({ fromObject: params ?? {} }) }));
  }

  protected post<T>(path: string, body: unknown): Observable<T> {
    return this.unwrap(this.http.post<ApiEnvelope<T>>(`${this.baseUrl}${path}`, body));
  }

  private unwrap<T>(request: Observable<ApiEnvelope<T>>): Observable<T> {
    return request.pipe(
      map((envelope) => {
        if (!envelope.success) throw new ApiError(envelope.error?.code ?? "UNKNOWN", envelope.error?.message ?? "Request failed", 200);
        return envelope.result;
      }),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof HttpErrorResponse ? new ApiError(`HTTP_${error.status}`, error.message, error.status) : error,
        ),
      ),
    );
  }
}
```

```ts
// src/app/infrastructure/api/http-machine.api.ts
import { Injectable } from "@angular/core";
import type { Observable } from "rxjs";
import { MachineApi } from "@app/core/application/ports/machine.api";
import type { OeeDto, OeeFilter } from "@app/core/domain/production";
import { BaseApi } from "./base.api";

@Injectable()
export class HttpMachineApi extends BaseApi implements MachineApi {
  getOee(filter: OeeFilter): Observable<OeeDto[]> {
    return this.get<OeeDto[]>("/production/oee", { from: filter.from, to: filter.to, machine: filter.machineCodes });
  }
}
```

Wire it in `app.config.ts`: `{ provide: MachineApi, useClass: HttpMachineApi }`.

## Runtime configuration

```ts
// src/app/infrastructure/config/app-config.ts
import { InjectionToken } from "@angular/core";

export interface AppConfig {
  readonly apiUrl: string;
  readonly environmentName: string;
  readonly version: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>("APP_CONFIG");

export function parseAppConfig(value: unknown): AppConfig {
  const config = value as Partial<AppConfig>;
  const missing = (["apiUrl", "environmentName", "version"] as const).filter((key) => typeof config?.[key] !== "string");
  if (missing.length > 0) throw new Error(`config.json is missing: ${missing.join(", ")}`);
  return config as AppConfig;
}
```

Load it before bootstrapping, so every provider can inject it synchronously:

```ts
// src/main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";
import { APP_CONFIG, parseAppConfig } from "./app/infrastructure/config/app-config";

fetch("/config.json")
  .then((response) => response.json())
  .then((json) => {
    const config = parseAppConfig(json);
    return bootstrapApplication(AppComponent, {
      ...appConfig,
      providers: [...appConfig.providers, { provide: APP_CONFIG, useValue: config }],
    });
  })
  .catch((error: unknown) => {
    document.body.textContent = "The application could not start. Please try again later.";
    console.error(error);
  });
```

- `public/config.json` holds local defaults and is tracked. The deployment overwrites it per environment.
- `config.json` is served to the browser, so it holds only public values.
- `main.ts` is the only place outside infrastructure that touches `fetch` and `document`, because it is the composition root.

## Interceptors

```ts
// src/app/infrastructure/http/auth.interceptor.ts
import type { HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import { HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, switchMap, throwError } from "rxjs";
import { TokenStore } from "../auth/token.store";

const withToken = (request: HttpRequest<unknown>, token: string | null) =>
  token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const tokens = inject(TokenStore);
  if (request.url.endsWith("/auth/refresh")) return next(request);

  return next(withToken(request, tokens.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      // refresh() shares one in-flight refresh between concurrent 401s and errors after one failed attempt
      return tokens.refresh().pipe(switchMap((token) => next(withToken(request, token))));
    }),
  );
};
```

- `TokenStore` is an infrastructure service. It keeps the access token in memory, calls the refresh endpoint once for concurrent 401s (`shareReplay({ bufferSize: 1, refCount: true })` on the in-flight refresh), and on failure clears the tokens and dispatches a logout action.
- Prefer HTTP-only refresh cookies set by the backend over storing refresh tokens in `localStorage`. If storage is unavoidable, only `TokenStore` touches it.
- Register interceptors in order: `provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, errorInterceptor]))`.

## Mock API for local development

- `server/db.json` + `server/routes.json` with json-server, or MSW handlers in `src/mocks/`, both returning the same `{ success, result, error }` envelope as the backend.
- `npm run mock` starts it, and `public/config.json` points `apiUrl` at it by default.
- `npm run test:contract` (`node --test server/contract.test.mjs`) checks that each mocked endpoint returns the fields the DTOs declare, so the mock cannot drift silently.

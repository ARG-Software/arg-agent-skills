# State patterns: global Store and SignalStore

The examples use a `production` feature that loads OEE (overall equipment effectiveness) figures for a date range.

## Models and mapper

The DTO and filter live in `core/domain/production.ts`, because the `MachineApi` port in `core` uses them. The UI model and the mapper live in the feature.

```ts
// src/app/core/domain/production.ts
export interface OeeDto {
  MachineCode: string;
  Availability: number; // 0..1
  Performance: number;
  Quality: number;
  Day: string; // "2026-05-01T00:00:00"
}

export interface OeeFilter {
  from: string; // ISO date
  to: string;
  machineCodes: readonly string[];
}
```

```ts
// src/app/features/production/models/oee.models.ts
import type { OeeDto } from "@app/core/domain/production";

export interface OeeUi {
  id: string; // machineCode + day
  machineCode: string;
  day: string; // "2026-05-01"
  oeePercent: number; // availability x performance x quality, 0..100
}

export function toOeeUi(dto: OeeDto): OeeUi {
  const day = dto.Day.slice(0, 10);
  return {
    id: `${dto.MachineCode}:${day}`,
    machineCode: dto.MachineCode,
    day,
    oeePercent: Math.round(dto.Availability * dto.Performance * dto.Quality * 1000) / 10,
  };
}
```

## Actions (`state/production.actions.ts`)

```ts
import { createActionGroup, emptyProps, props } from "@ngrx/store";
import type { OeeFilter } from "@app/core/domain/production";
import type { OeeUi } from "../models/oee.models";

export const OeePageActions = createActionGroup({
  source: "Production OEE Page",
  events: {
    Opened: emptyProps(),
    "Filter Changed": props<{ filter: OeeFilter }>(),
  },
});

export const OeeApiActions = createActionGroup({
  source: "Production OEE API",
  events: {
    "Oee Loaded": props<{ rows: OeeUi[] }>(),
    "Oee Load Failed": props<{ message: string }>(),
  },
});
```

The source says **where** the event came from (a page, an API, a websocket), and the event says **what happened**, not what to do.

## Reducer and selectors (`state/production.feature.ts`)

```ts
import { createFeature, createReducer, createSelector, on } from "@ngrx/store";
import { createEntityAdapter, type EntityState } from "@ngrx/entity";
import type { OeeFilter } from "@app/core/domain/production";
import type { OeeUi } from "../models/oee.models";
import { OeeApiActions, OeePageActions } from "./production.actions";

export interface ProductionState extends EntityState<OeeUi> {
  filter: OeeFilter | null;
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
}

const adapter = createEntityAdapter<OeeUi>();

const initialState: ProductionState = adapter.getInitialState({ filter: null, status: "idle", error: null });

export const productionFeature = createFeature({
  name: "production",
  reducer: createReducer(
    initialState,
    on(OeePageActions.filterChanged, (state, { filter }) => ({ ...state, filter, status: "loading" as const, error: null })),
    on(OeeApiActions.oeeLoaded, (state, { rows }) => adapter.setAll(rows, { ...state, status: "loaded" as const })),
    on(OeeApiActions.oeeLoadFailed, (state, { message }) => ({ ...state, status: "error" as const, error: message })),
  ),
  extraSelectors: ({ selectProductionState }) => {
    const { selectAll } = adapter.getSelectors(selectProductionState);
    const selectRows = createSelector(selectProductionState, selectAll);
    return {
      selectRows,
      selectAverageOee: createSelector(selectRows, (rows) =>
        rows.length === 0 ? null : Math.round((rows.reduce((sum, row) => sum + row.oeePercent, 0) / rows.length) * 10) / 10,
      ),
    };
  },
});

export const { selectFilter, selectStatus, selectError, selectRows, selectAverageOee } = productionFeature;
```

## Effects (`state/production.effects.ts`)

```ts
import { inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { catchError, map, of, switchMap } from "rxjs";
import { MachineApi } from "@app/core/application/ports/machine.api";
import { toOeeUi } from "../models/oee.models";
import { OeeApiActions, OeePageActions } from "./production.actions";

export const loadOee = createEffect(
  (actions$ = inject(Actions), api = inject(MachineApi)) =>
    actions$.pipe(
      ofType(OeePageActions.filterChanged),
      switchMap(({ filter }) =>
        api.getOee(filter).pipe(
          map((dtos) => OeeApiActions.oeeLoaded({ rows: dtos.map(toOeeUi) })),
          catchError((error: unknown) =>
            of(OeeApiActions.oeeLoadFailed({ message: error instanceof Error ? error.message : "Could not load OEE" })),
          ),
        ),
      ),
    ),
  { functional: true },
);
```

- `switchMap` because a newer filter makes the older request irrelevant.
- `catchError` is inside `switchMap`, so the effect keeps running after a failure.
- The effect injects the `MachineApi` **port**, never `HttpClient`.
- Register it in the feature routes: `providers: [provideState(productionFeature), provideEffects({ loadOee })]`.

## Facade (optional, `core/application` or the feature)

A facade keeps containers ignorant of actions and selectors when several containers share the same state:

```ts
import { Injectable, inject } from "@angular/core";
import { Store } from "@ngrx/store";
import { OeePageActions } from "./production.actions";
import { selectAverageOee, selectRows, selectStatus } from "./production.feature";
import type { OeeFilter } from "@app/core/domain/production";

@Injectable({ providedIn: "root" })
export class ProductionFacade {
  private readonly store = inject(Store);
  readonly rows = this.store.selectSignal(selectRows);
  readonly status = this.store.selectSignal(selectStatus);
  readonly averageOee = this.store.selectSignal(selectAverageOee);

  changeFilter(filter: OeeFilter): void {
    this.store.dispatch(OeePageActions.filterChanged({ filter }));
  }
}
```

Use a facade only when it earns its place. A single container can use the store directly.

## Container and presentational component

```ts
@Component({
  selector: "app-oee-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OeeFilterBoxComponent, OeeTableComponent],
  template: `
    <app-oee-filter-box (filterChange)="facade.changeFilter($event)" />
    @switch (facade.status()) {
      @case ("loading") { <app-spinner /> }
      @case ("error") { <app-error-message /> }
      @default { <app-oee-table [rows]="facade.rows()" [average]="facade.averageOee()" /> }
    }
  `,
})
export class OeePageComponent {
  protected readonly facade = inject(ProductionFacade);
}

@Component({
  selector: "app-oee-table",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table>
      @for (row of rows(); track row.id) {
        <tr><td>{{ row.machineCode }}</td><td>{{ row.day }}</td><td>{{ row.oeePercent }}%</td></tr>
      } @empty {
        <tr><td colspan="3">No data for this filter</td></tr>
      }
    </table>
  `,
})
export class OeeTableComponent {
  readonly rows = input.required<readonly OeeUi[]>();
  readonly average = input<number | null>(null);
}
```

## The same feature as a SignalStore

```ts
// features/production/state/production.store.ts
import { inject } from "@angular/core";
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals";
import { rxMethod } from "@ngrx/signals/rxjs-interop";
import { tapResponse } from "@ngrx/operators";
import { computed } from "@angular/core";
import { pipe, switchMap, tap } from "rxjs";
import { MachineApi } from "@app/core/application/ports/machine.api";
import type { OeeFilter } from "@app/core/domain/production";
import { toOeeUi, type OeeUi } from "../models/oee.models";

interface ProductionState {
  rows: OeeUi[];
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
}

export const ProductionStore = signalStore(
  withState<ProductionState>({ rows: [], status: "idle", error: null }),
  withComputed(({ rows }) => ({
    averageOee: computed(() => {
      const list = rows();
      return list.length === 0 ? null : Math.round((list.reduce((sum, row) => sum + row.oeePercent, 0) / list.length) * 10) / 10;
    }),
  })),
  withMethods((store, api = inject(MachineApi)) => ({
    load: rxMethod<OeeFilter>(
      pipe(
        tap(() => patchState(store, { status: "loading", error: null })),
        switchMap((filter) =>
          api.getOee(filter).pipe(
            tapResponse({
              next: (dtos) => patchState(store, { rows: dtos.map(toOeeUi), status: "loaded" }),
              error: (error: unknown) =>
                patchState(store, { status: "error", error: error instanceof Error ? error.message : "Could not load OEE" }),
            }),
          ),
        ),
      ),
    ),
  })),
);
```

Provide it in the route (`providers: [ProductionStore]`) and inject it in the container. It uses the same port and mapper as the global Store version, so switching approaches does not touch infrastructure.

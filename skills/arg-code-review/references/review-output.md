# Writing and posting the review

## Example review

```markdown
## Review: feat(cart): apply discount codes at checkout (#123)

Adds discount-code support to checkout: a `DiscountCode` value object, an `ApplyDiscountUseCase`, a Stripe coupon lookup, and a code field on the checkout screen. The domain modelling is solid and well tested. **3 blocking findings** (a layer violation, a missing architecture rule, and an unmarked breaking change), 2 suggestions, 1 question.

### Findings

1. [blocking] src/application/cart/applydiscount.usecase.ts:3 - application imports infrastructure
   `import { StripeCoupons } from "@infrastructure/payments/stripecoupons"` ties the use case to the Stripe adapter. CI's `verify` job fails on it (`application must not import infrastructure`).
   Fix: add `ICouponLookup` in `src/application/ports/couponlookup.port.ts`, implement it in `StripeCoupons`, and inject it in `src/bootstrap/container.ts`.

2. [blocking] test/architecture/layers.test.js - new `infrastructure/payments` package owner not covered
   The PR adds the `stripe` SDK but no rule keeps it inside `infrastructure/payments`.
   Fix: add `test("only infrastructure/payments imports stripe", ...)` using `usagesOutside` with `/from ["']stripe["']/`.

3. [blocking] PR title - breaking change not marked
   `POST /api/checkout` now requires `discountCode: string | null` (src/presentation/api/checkout.dto.ts:12); existing clients sending no field get a 400.
   Fix: make the field optional (preferred), or retitle as `feat(cart)!: ...` with a `BREAKING CHANGE:` footer describing the migration.

4. [suggestion] src/application/cart/applydiscount.usecase.ts:28 - magic number
   `if (percent > 50)` is a business limit. Move it to `DISCOUNT.MAX_PERCENT` in `src/domain/policy/discount.policy.ts`.

5. [suggestion] src/presentation/checkout/DiscountField.tsx:15 - private copy of `lib/normalizedToken`
   `code.trim().toUpperCase()` duplicates `normalizedToken` in `src/lib/text.ts`. Use it.

6. [question] src/infrastructure/payments/stripecoupons.ts:40
   A Stripe timeout returns `{ valid: false }`, which the screen shows as "Invalid code". Should a timeout be "Could not check the code, try again" instead? As written, a network problem reads as the user's mistake.

### Not checked
- `verify` fails only on finding 1; unit tests pass. The e2e job was skipped (label `skip-e2e`).
- I did not test the Stripe sandbox flow; worth a manual check before approving.
```

## Posting comments (only when the user asks)

Show the user the exact comments first. Then:

```bash
# One summary review comment (does not approve or request changes)
gh pr review 123 --comment --body-file review.md

# Inline comments on specific lines: one pending review with several comments, submitted as COMMENT
gh api repos/{owner}/{repo}/pulls/123/reviews \
  -f event=COMMENT \
  -f body="Review notes from ARG code review. Blocking items first." \
  -F 'comments[][path]=src/application/cart/applydiscount.usecase.ts' \
  -F 'comments[][line]=3' \
  -F 'comments[][side]=RIGHT' \
  -F 'comments[][body]=[blocking] application imports infrastructure. Declare ICouponLookup in application/ports and inject it from bootstrap.'
```

- Use `event=COMMENT`. Never `APPROVE` or `REQUEST_CHANGES` unless the user explicitly asks for that verdict and it is their review to give.
- Inline `line` numbers refer to the file in the PR's head commit (`side=RIGHT`). Re-check them against `gh pr diff` before posting.
- GitLab, Bitbucket or Azure DevOps: produce the Markdown and let the user post it, unless a CLI for that host is configured and they ask you to use it.

## Follow-up rounds

When the author pushes changes:

1. Diff only what changed since your last review (`git diff <last-reviewed-sha>..HEAD`).
2. For each earlier finding, mark it **resolved**, **partly resolved** (say what remains) or **open**.
3. Add new findings only for the new changes, with the same verification rule.

```markdown
### Since the last review (abc1234..def5678)
- 1 resolved: `ICouponLookup` port added and injected.
- 2 resolved: architecture test added.
- 3 open: the field is still required; either make it optional or mark the change as breaking.
- New: [suggestion] src/application/ports/couponlookup.port.ts:8 - the port returns Stripe's `Coupon` type; return a domain type instead.
```

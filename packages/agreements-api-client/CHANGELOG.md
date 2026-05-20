# Changelog

## Unreleased

### Added

- Added response envelopes for successful API responses. Resource responses now include `data` and `meta`; list responses include `data`, `meta`, and `pageInfo`.
- Added structured error envelopes with `error.code`, `error.message`, optional `error.details`, and `error.requestId`.
- Added cursor paging to agreement and input-history list responses through `pageInfo.limit`, `pageInfo.nextCursor`, and optional `pageInfo.totalCount`.
- Added agreement list filtering by `state`, `createdAt`, and `updatedAt`.
- Added input-history filtering by `userId`, `inputId`, `status`, `createdAt`, and `updatedAt`.
- Added list sorting. Agreements can be sorted by `createdAt`, `updatedAt`, and `displayName`; input history can be sorted by `createdAt` and `updatedAt`.
- Added SDK types for `ApiResponse`, `ListResponse`, `PageInfo`, `DateFilter`, `SortFilter`, `AgreementListParams`, and `AgreementInputListParams`.

### Changed

- `listAgreements()` now returns `ListResponse<AgreementSummary>` instead of `AgreementRecord[]`.
- `listAgreementInputs()` now returns `ListResponse<AgreementInputRecord>` instead of `AgreementInputRecord[]`.
- Agreement list items are now summaries. Call `getAgreement(id)` to load full agreement JSON, participants, observers, variables, and on-chain context.
- SDK single-resource methods unwrap the response envelope and continue returning the resource payload directly.
- `AgreementsApiError#errorPayload` now exposes the structured error envelope when one is returned by the API.

### Migration guide

If your code used a list response as an array, read records from `.data`:

```ts
// Before
const agreements = await client.listAgreements();
console.log(agreements[0].id);

// After
const agreementsPage = await client.listAgreements();
console.log(agreementsPage.data[0].id);
```

If your code needs the next page, pass the returned cursor into the next request:

```ts
const firstPage = await client.listAgreementInputs(agreementId, { limit: 25 });

if (firstPage.pageInfo.nextCursor) {
  const secondPage = await client.listAgreementInputs(agreementId, {
    limit: 25,
    cursor: firstPage.pageInfo.nextCursor,
  });
  console.log(secondPage.data);
}
```

If your code filtered agreements by `status`, update it to use the new agreement state filter where appropriate:

```ts
const agreementsPage = await client.listAgreements({
  state: 'AWAITING_PAYMENT',
  sort: { updatedAt: 'desc' },
});
```

If your code needs complete agreement details from a list result, fetch the full record:

```ts
const agreementsPage = await client.listAgreements({ limit: 10 });
const agreement = await client.getAgreement(agreementsPage.data[0].id);
```

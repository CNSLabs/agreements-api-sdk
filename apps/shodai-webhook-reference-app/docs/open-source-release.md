# Open Source Release Review

Before making this repository public, run the dependency notice workflow:

```sh
pnpm install --frozen-lockfile
pnpm notices:generate
pnpm notices:check
```

Review `THIRD_PARTY_NOTICES.md`, especially the "Licenses Requiring Human Review" section. The generated inventory is intended to make license review repeatable; it does not replace legal review or any third-party license text obligations that apply to distributed artifacts.

When dependencies change, regenerate `THIRD_PARTY_NOTICES.md` in the same change set as the lockfile update.

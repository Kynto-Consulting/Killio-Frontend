# Automation test v2: TODO mention with full email

Goal: validate that GitHub Create Cards flow detects TODO and assigns by full email mention.

Test id: 2026-04-08-v2-email-mention

- TODO: [AUTOTEST-V2] Create card from this TODO and assign @arubik4u@gmail.com
- TODO: [AUTOTEST-V2-MOD] Verify fileDiff and fileContent in iterator after backend fix @arubik4u@gmail.com
- TODO: [AUTOTEST-V2-MOD-2] Validate public API fallback for diff/content @arubik4u@gmail.com
- TODO: [AUTOTEST-V2-DIAG] Inspect fileContentSource/fileDiffSource diagnostics in run output @arubik4u@gmail.com

## Notes
- Repo: Kynto-Consulting/Killio-Frontend
- Expected assignee: arubik4u@gmail.com
- Expected behavior: card is created and assignee is attached automatically.

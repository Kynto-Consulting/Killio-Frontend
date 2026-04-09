# Automation test: card + todo + assignee

Purpose: trigger GitHub->Killio script automation for card creation and automatic assignee resolution.

Test id: 2026-04-08-card-assignee-arubik4u

## Requested card payload
- Title: [AUTOTEST] Create card from commit TODO and assign member
- Source: commit test file in repository
- Assignee email: arubik4u@gmail.com

## TODO block
- [ ] AUTOTEST TODO: validate card creation from repository change
- [ ] AUTOTEST TODO: validate automatic assignment to arubik4u@gmail.com

## Parser hints
Assignee: arubik4u@gmail.com
Owner email: arubik4u@gmail.com
Mention: @arubik4u@gmail.com

Expected result:
- A new card is created by automation.
- The card contains at least one TODO from this file.
- The card gets assigned to arubik4u@gmail.com automatically.

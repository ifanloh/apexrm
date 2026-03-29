# Trailnesia Product Blueprint

## Purpose

This document maps the desired Trailnesia experience to the LiveTrail-style user journey we want to emulate, then translates that into a concrete implementation backlog for our product.

The key principle is:

- spectator-first experience on the public site
- event-day operations separated into scanner and organizer tools
- organizer platform capabilities added only after the spectator and ops foundations are stable

## Product Layers

### 1. Spectator Layer

Public-facing race hub for people who want to follow the event.

- event home / edition home
- race detail page
- search runner
- runners list
- favorites list
- my followed runners
- ranking
- race leaders
- statistics

### 2. Event-Day Operations Layer

Operational tooling for crews and race control.

- scanner app
- duplicate handling
- audit feed
- export results
- sync and device health

### 3. Organizer Platform Layer

Pre-race and post-race setup tooling for organizers.

- create event
- upload organizer branding
- upload event logo
- upload GPX
- define race categories
- define checkpoints
- import participants
- assign crews
- publish spectator pages

## Personas

| Persona | Primary goal | Main entry point | Core needs |
| --- | --- | --- | --- |
| Spectator | Follow the race live | Event home | Leaders, ranking, map, statistics |
| Follower | Track specific runners | Search / favorites | Last checkpoint, rank, race time, status |
| Crew | Record passings in the field | Scanner app | Fast scan, duplicate protection, offline queue |
| Organizer | Set up and control event | Organizer login | Event config, crews, exports, audit, health |

## Information Architecture

### Spectator Pages

- `/`
  - Event Home
- `/race/:slug`
  - Race Detail
- `/search`
  - Search a Runner
- `/runners`
  - Runners List
- `/favorites`
  - Favorites List
- `/my-runners`
  - My Followed Runners
- `/ranking`
  - Ranking
- `/leaders`
  - Race Leaders
- `/statistics`
  - Statistics

### Operations Pages

- `/scanner`
  - Crew scanner
- `/organizer`
  - Organizer dashboard

## UX Rules

### Event Home

The event home is a catalog of race categories within one event edition.

It must show:

- organizer/event branding
- edition context
- race category cards
- live vs finished state
- top 3 preview only
- CTA into race detail

It must not show:

- full ranking rails for one race
- detailed runner utility views

### Race Detail

The race detail page must be focused and compact.

It should only contain:

1. course information / description
2. elevation profile
3. course map
4. race leaders or race ranking

Rules:

- if the race is ongoing, show `LIVE` and `Leading`
- if the race is finished, show `FINISHED` and `Ranking`
- runner status must follow race state:
  - ongoing runner: last checkpoint / on-course state
  - finisher: finished
  - DNF: dnf

### Utility Views

These are separate pages or modes, not stacked under race detail:

- Search a runner
- Runners list
- Favorites list
- My followed runners
- Ranking
- Race leaders
- Statistics

Each utility view should have:

- its own heading
- its own filters
- its own pagination if needed
- a visible path back to race detail

## Page-by-Page Backlog

### 1. Event Home

#### Goal

Help spectators choose a race category to follow.

#### Must have

- event hero
- edition selector
- race category cards
- live badge vs finished badge
- `Leading` for live cards
- `Ranking` for finished cards
- top 3 preview
- route snippet / elevation snippet

#### Data needed

- event identity
- edition identity
- race category list
- per-race state
- top 3 preview by race
- summary counts: finishers, DNF

#### Acceptance criteria

- spectators can understand all available race categories at a glance
- clicking a card opens the correct race detail
- live and finished cards are visually distinct

### 2. Race Detail

#### Goal

Help spectators understand one race deeply without clutter.

#### Must have

- course description
- route highlights
- elevation profile
- interactive map
- live leaders if ongoing
- final ranking if finished

#### Data needed

- race metadata
- race description
- elevation route geometry
- checkpoint list
- live or finished state
- leader/ranking data

#### Acceptance criteria

- only the four core blocks are visible
- live race shows leaders
- finished race shows ranking
- map reflects the selected race category

### 3. Search a Runner

#### Goal

Help spectators quickly find a runner by bib, name, or club.

#### Must have

- search bar
- race filter
- results table
- row action to open runner details

#### Data needed

- runner directory
- race assignment
- status
- last checkpoint

#### Acceptance criteria

- a bib or name query returns matching runners quickly
- empty states are clean and informative

### 4. Runners List

#### Goal

Provide a browsable directory of runners.

#### Must have

- state filter
- race filter
- nationality filter
- category filter
- compact table
- actions: favorite, open

#### Data needed

- runner registration state
- race
- gender
- nationality
- club
- status

#### Acceptance criteria

- list is easy to scan
- no unnecessary clutter such as decorative avatar or UTMB-style filler data

### 5. Favorites List

#### Goal

Help users monitor runners they explicitly care about.

#### Must have

- same table feel as runners list
- filters
- ranking snapshot where relevant
- actions to unfavorite or open

#### Data needed

- user favorites state
- runner/race metadata
- live or final position

#### Acceptance criteria

- the list is useful even when runners span multiple races

### 6. My Followed Runners

#### Goal

Give followers a focused shortlist of selected runners.

#### Must have

- empty state with CTA to search
- shortlist cards or compact list
- selected runner detail

#### Data needed

- followed runners
- runner progress
- last checkpoint
- status

#### Acceptance criteria

- if no followed runner exists, the empty state is clear
- if followed runners exist, the page is usable as a personal monitoring dashboard

### 7. Ranking

#### Goal

Show final or derived race order.

#### Must have

- race filter
- nationality filter
- gender filter: men / women
- ranking table
- total race time

#### Data needed

- overall position
- gender position
- finish or last valid result
- nationality
- gender

#### Acceptance criteria

- finished races show meaningful ranking
- ongoing races should avoid implying final results

### 8. Race Leaders

#### Goal

Show who is currently leading an ongoing race or set of races.

#### Must have

- race filter
- nationality filter
- category filter
- compact leader table
- last checkpoint
- next estimated passing

#### Data needed

- last point reached
- elapsed time
- estimated next passing
- race grouping

#### Acceptance criteria

- event-level leaders can show all races
- race-level leaders can default to the current race

### 9. Statistics

#### Goal

Show summary metrics for the active race category.

#### Must have

- starters
- finishers
- DNF
- men/women split
- country distribution

#### Data needed

- participant roster for the active race
- statuses
- gender breakdown
- nationality breakdown

#### Acceptance criteria

- statistics on race detail are scoped to the active race category
- they do not mix all races unless explicitly requested at event level

## Event-Day Operations Backlog

### Scanner

#### Goal

Record passings as fast and safely as possible.

#### Must have

- checkpoint selection
- QR scan
- manual bib input
- accepted / duplicate handling
- offline queue
- sync button

#### Acceptance criteria

- crew can process runners quickly
- duplicates are blocked even with mixed bib casing
- queued scans survive temporary offline conditions

### Organizer Ops

#### Goal

Control race-day quality and output.

#### Must have

- duplicate log
- notification feed
- scan audit
- export results
- device / crew visibility

## Organizer Platform Backlog

### Phase 1

- create event
- upload organizer logo
- upload event logo
- create event edition
- create race categories

### Phase 2

- upload GPX
- define route metadata
- define checkpoints
- assign checkpoint crews

### Phase 3

- import participants
- validate bib uniqueness
- assign race categories
- publish spectator hub

### Phase 4

- export official results
- archive event
- duplicate review workflow

## Delivery Sequence

### Phase A: Spectator Core

1. Event Home
2. Race Detail
3. Ranking
4. Race Leaders
5. Statistics

### Phase B: Follower Tools

1. Search a Runner
2. Runners List
3. Favorites List
4. My Followed Runners

### Phase C: Event-Day Ops

1. Scanner stability
2. Duplicate handling
3. Audit and export

### Phase D: Organizer Platform

1. Event setup
2. Course setup
3. Participant import
4. Crew assignment

## Definition of Done

A page or feature is done only when:

- the visual structure is stable
- the page does not leak unrelated sections
- the data is scoped correctly to event or race context
- live vs finished logic is correct
- filters and actions behave consistently
- the experience works at standard desktop zoom without layout collisions

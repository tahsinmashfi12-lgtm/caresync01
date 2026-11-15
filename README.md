# Caresync01

Build CareSync — Smart, Connected & Collaborative Elderly Healthcare Management Platform as specified in the attached MASTER PROMPT — CARESYNC (pasted).md and styled after the attached design sample (ab9e0da406040f596f3071168969ffea.webp).

Start the CareSync build with authentication and role-based dashboards, then add medication tracking:

1. Visual Direction & Design (from attached design sample):
- Modern, clean, trustworthy healthcare SaaS aesthetic.
- Floating pill navigation bar (rounded-full) with active tab badges, clean logo, and right-aligned CTA with directional arrow.
- Deep forest green and vibrant mint/teal accent colors, crisp white cards, rounded containers (large radius), floating stat badges and social proof pills.
- Accessibility for elderly users: large typography, high contrast, oversized clickable buttons, clear status indicators.

2. Authentication & Access Management:
- User registration, login, and secure session management with Lovable Cloud.
- Centralized Elderly Healthcare Profile creation.
- Secure passcode/invitation code generation to allow family members and caregivers to connect to an existing elderly profile.
- Role-based permissions:
  * Elderly Individual (manage personal schedule, view appointments, control access)
  * Family Administrator (manage authorized members, view adherence reports, notifications)
  * Caregiver (record medication administration, update daily care, report missed meds)

3. Role-Based Dashboards:
- Elderly Healthcare Dashboard: simple, high-contrast, large buttons, today's medication schedule, next dose countdown, clear visual status indicators (Green: Taken, Yellow: Due, Red: Missed), daily wellness check-in, quick emergency assistance button.
- Family Administrator Dashboard: overview of connected loved ones, adherence rates, recent activity timeline, upcoming appointments, caregiver updates.
- Caregiver Dashboard: assigned individuals, today's care checklist, dose confirmation, missed dose reporting.
- Easy role/demo switcher to explore all three dashboards with realistic demo data.

4. Smart Medication Management:
- Medication schedule: daily/weekly/custom frequencies, specific dosage times, instructions (before/after meals).
- Adherence logging: Mark as Taken, Snooze, Report as Missed.
- History view tracking confirmation time, who confirmed it, and adherence trends.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://caresync01.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c21c7c86-42a7-4409-8dca-bad8d342d4e0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

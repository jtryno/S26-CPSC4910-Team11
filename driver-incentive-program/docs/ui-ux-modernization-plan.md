# Quiet SaaS UI/UX Modernization Plan

## Summary

Redesign the app into a polished, compact operations dashboard while keeping the existing React/Vite stack, routes, backend APIs, and role logic intact. The main goal is to replace page-by-page inline styling with a shared visual system, then apply it consistently across auth, dashboards, catalog, organizations, reports, messaging, notifications, support, account, and settings.

## Key Changes

- Add a shared design foundation in `src/index.css` and/or new style files: CSS variables for color, spacing, typography, shadows, focus rings, z-index, and responsive breakpoints.
- Use a light, quiet SaaS palette: neutral app background, white surfaces, subtle borders, blue primary actions, green success, amber warning, red danger, and muted gray secondary text.
- Create reusable UI primitives in `src/components/ui`: `Button`, `IconButton`, `Card`, `PageHeader`, `Toolbar`, `Badge`, `Alert`, `EmptyState`, `MetricCard`, `Modal`, `Tabs`, `DataTable`, `FormField`, `Input`, `Select`, `Textarea`, and `Toast`.
- Keep existing component names where practical by upgrading `Modal`, `TabGroup`, `SortableTable`, `InputField`, `DropdownField`, `DatePicker`, `Field`, and `EditableField` to use the new primitives internally.
- Replace most inline styles with class names and reusable components, especially in the high-duplication screens: `Dashboard.jsx`, `Catalog.jsx`, `SupportTickets.jsx`, `Messages.jsx`, and organization/report tabs.
- Modernize the logged-in app shell without changing route behavior: role-aware navigation, compact account/logout area, active sponsor selector, notification/message shortcuts, and responsive mobile drawer.
- Keep public/logged-out screens simple and professional: centered auth cards, consistent form validation, cleaner login/signup/password reset flow, and less oversized button styling.
- Redesign data-heavy pages around scanability: page headers, filter toolbars, stat cards, consistent tables, row actions, badges, loading skeletons, empty states, and clear error states.
- Redesign catalog as a rewards workspace: wider responsive grid, polished product cards, balance summary, search/filter/sort toolbar, cart drawer/side panel, cleaner checkout/detail/share modals, and stable image aspect ratios.
- Redesign communication/support pages with feed/list patterns: unread states, priority badges, compact message bubbles, ticket detail panels, and consistent comment threads.
- Replace browser `alert`/`confirm` patterns with app modals or toasts where they affect UX-critical flows.

## Public Interfaces

- Preserve backend API calls, route paths, user roles, local/session storage behavior, and existing test assumptions.
- `Button`: `variant`, `size`, `loading`, `disabled`, `fullWidth`, `icon`, `children`.
- `Badge`/`Alert`: `tone` values of `neutral`, `info`, `success`, `warning`, `danger`.
- `Modal`: keep `isOpen`, `onClose`, `onSave`, `title`, `children`, `saveLabel`, `saveDisabled`, `maxWidth`; add optional `description`, `size`, `tone`, and `footer`.
- `Tabs`: support current `tabs=[{ label, content }]` shape while adding optional `defaultIndex`, `activeIndex`, and `onChange`.
- `DataTable`/upgraded `SortableTable`: keep `columns`, `data`, `actions`, `rowsPerPage`; add empty/loading states and responsive horizontal scrolling.

## Test Plan

- Run `npm run lint`, `npm test -- --run`, and `npm run build`.
- Add or adjust React Testing Library coverage for shared primitives: buttons, modal focus/close behavior, tabs, table sort/pagination, alerts, and form fields.
- Regression-test existing role flows: driver catalog/cart, driver dashboard, sponsor organization management, admin dashboard/user search, reports, notifications, messages, support tickets, login/signup/reset.
- Manually verify responsive layouts at desktop, tablet, and mobile widths, especially navigation, catalog grid/cart, data tables, modals, and long text labels.
- Verify accessibility basics: keyboard navigation, visible focus states, button labels/icons, dialog roles, form labels, color contrast, and readable disabled/loading states.

## Assumptions

- Target visual direction is quiet SaaS, not a flashy marketing or gamified redesign.
- No backend/schema/API changes are included.
- No new UI framework is required; use plain React, CSS, and existing `react-icons`.
- Light theme ships first, with CSS variables structured so dark mode could be added later.
- Implementation should be staged: shared shell and primitives first, then page-by-page migration.

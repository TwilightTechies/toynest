# Post-Certification Backlog

Deferred by ADR-001. Pick up after 7 Nov 2026.

## Phase order
One phase per project session, each on its own `feat/` branch:

1. ~~Storefront browsing~~ (done, ADR-012)
2. ~~Design foundation~~ (done, ADR-013)
3. **Cart** (next)
4. Checkout
5. Auth: switches the composition root to user-scoped clients
6. **Design polish**: details across every page once all flows exist

## Design foundation (responsive web; no native app)
- [x] ~~Figma mock-ups~~ (skipped: built code-first and reviewed at real widths)
- [x] Brand tokens: colours and typography as Tailwind theme variables (light + dark), contrast-checked
- [x] Logo/wordmark and favicon
- [x] Placeholder product art per category
- [ ] Real product photos (image field + Supabase Storage): with admin product CRUD
- [x] Mobile header: menu button with disclosure panel
- [x] Mobile filters: collapsible panel instead of the full filter row
- [x] Shared UI primitives (button, input, select, card, badge) used by storefront pages
- [x] Layout check at phone (375 px), tablet (768 px) and desktop (1280 px) widths

## Design polish (after checkout)
- [ ] Move support and admin pages from raw `zinc` classes to tokens
- [ ] Empty, loading and error states styled consistently
- [ ] Accessibility pass: contrast, focus styles, keyboard navigation
- [ ] Final responsive review of cart, checkout and account pages

## Storefront
- [x] Home page sections: hero, shop by category, new arrivals, under £10 (ADR-012)
- [ ] Home page: featured and best sellers (needs a featured flag / order aggregate)
- [x] Product detail page, category browsing, price filter, sorting, pagination (ADR-012)
- [ ] Product variants (colour/size) selection UI
- [ ] Customised products: personalised text, colour, instructions, image upload (Supabase Storage)
- [ ] Cart: add/remove, quantities, customisation details, subtotal/discount/shipping/total
- [ ] Checkout: customer details, shipping address, order summary
- [ ] MockPaymentProvider: success / failure / pending
- [ ] Customer account: registration, password recovery, profile, order history UI

## Admin
- [ ] Dashboard: counts, sales summary, low-stock, recent orders
- [ ] Full product CRUD, archive, images, categories, variants, prices
- [ ] Inventory management
- [ ] Order management: status updates, payment tracking

## Platform
- [ ] Rate limiting
- [ ] Notification provider
- [ ] Playwright E2E suite
- [ ] Vercel deployment hardening

## Original backlog (from brief)
- [ ] Real payment gateway
- [ ] Advanced shipping integration
- [ ] Wishlist, customer reviews
- [ ] Coupons and discounts
- [ ] Advanced analytics and reporting

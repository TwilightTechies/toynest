# Post-Certification Backlog

Deferred by ADR-001. Pick up after 7 Nov 2026.

## Phase order
One phase per project session, each on its own `feat/` branch:

1. ~~Storefront browsing~~ (done, ADR-012)
2. **Design foundation** (next): set the look once, so cart and checkout inherit it
3. Cart
4. Checkout
5. Auth: switches the composition root to user-scoped clients
6. **Design polish**: details across every page once all flows exist

## Design foundation (responsive web; no native app)
- [ ] Optional first step: Figma mock-ups of home and product pages, desktop + phone, approved before code
- [ ] Brand tokens: colours, typography, spacing, radius as Tailwind theme variables (light + dark)
- [ ] Logo/wordmark and favicon
- [ ] Product imagery: placeholder images per product, with an image field ready for real photos
- [ ] Mobile header: menu button and slide-out navigation
- [ ] Mobile filters: collapsible panel instead of the full filter row
- [ ] Shared UI primitives (button, input, select, card, badge) used by existing pages
- [ ] Layout check at phone (375 px), tablet (768 px) and desktop (1280 px) widths

## Design polish (after checkout)
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

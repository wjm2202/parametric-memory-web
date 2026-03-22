# Stripe Product Creation Scripts

This directory contains scripts to create and manage Stripe products and subscription prices for the MMPM pricing page.

## Scripts

### 1. `create-stripe-products.js` (Production)

Creates real Stripe products and prices using the Stripe API.

**Usage:**
```bash
node scripts/create-stripe-products.js
```

**Features:**
- Reads `STRIPE_SECRET_KEY` from `.env.local`
- Checks for existing products by name to avoid duplicates
- Creates monthly subscription prices for each product
- Auto-generates `src/config/stripe-products.ts` with product/price IDs
- Includes exponential backoff retry logic for network resilience
- Graceful error handling with detailed messages

**Products Created:**
1. **Starter** - $9/mo - 512 MiB RAM, 10 GiB storage
2. **Solo** - $29/mo - 1 GiB RAM, 25 GiB storage
3. **Team** - $79/mo - 4 GiB RAM, 80 GiB storage
4. **Enterprise Cloud** - $299/mo - 8 GiB RAM, 100+ GiB storage
5. **Enterprise Self-Hosted** - $499/mo - Commercial license

### 2. `create-stripe-products-with-mock.js` (Testing)

Dual-mode script that can operate with real Stripe API or mock data for testing.

**Usage (Production):**
```bash
node scripts/create-stripe-products-with-mock.js
```

**Usage (Mock/Testing):**
```bash
node scripts/create-stripe-products-with-mock.js --mock
```

**Features:**
- Same functionality as production script
- `--mock` flag generates test product/price IDs without API calls
- Useful for development environments without network access
- Same output configuration file format

### 3. `create-stripe-products.ts` (TypeScript Source)

TypeScript source for the script (requires tsx or node --import tsx/esm).

## Generated Configuration

Both scripts output a configuration file: **`src/config/stripe-products.ts`**

This file exports:

- **`STRIPE_PRODUCTS`** - Array of all product configurations with IDs
- **`STRIPE_PRODUCTS_BY_NAME`** - Object map for quick lookup by product name
- **`STRIPE_PRICES_BY_PRODUCT_ID`** - Object map from product ID to price ID

### Example Usage in Code

```typescript
import { STRIPE_PRODUCTS, STRIPE_PRODUCTS_BY_NAME } from '@/config/stripe-products';

// Get all products
const allProducts = STRIPE_PRODUCTS;

// Get a specific product
const starterPlan = STRIPE_PRODUCTS_BY_NAME['Starter'];
// => { name: 'Starter', productId: 'prod_...', priceId: 'price_...', price: 9, ... }

// Access product details
const priceId = starterPlan.priceId;
const monthlyPrice = starterPlan.price; // $9
```

## Environment Setup

### Requirements

1. **Stripe Account** - Create at https://stripe.com
2. **Test Secret Key** - Copy from Stripe Dashboard > Developers > API Keys > Secret Key (test mode)
3. **.env.local file** - Add to project root:
   ```
   STRIPE_SECRET_KEY=sk_test_51TARK1KPmxRibChZqqCUnQpwN7WParlDH742...
   ```

### Verify Configuration

```bash
# Check if STRIPE_SECRET_KEY is set
grep STRIPE_SECRET_KEY .env.local
```

## Idempotency

Both scripts check for existing products by name before creating new ones. This means:

- **Safe to run multiple times** - Won't create duplicates
- **Safe to update prices** - New prices are created for existing products
- **Preserves existing IDs** - Uses previously created product/price IDs

## Troubleshooting

### "STRIPE_SECRET_KEY not found"

- Verify `.env.local` exists in project root
- Check it contains `STRIPE_SECRET_KEY=sk_test_...`
- Do NOT commit `.env.local` to git (add to `.gitignore`)

### Network Timeout / Connection Errors

- Use `--mock` flag to test script logic without network
- Check internet connectivity
- Verify Stripe API is accessible (https://status.stripe.com)
- Try again later or increase timeout in script

### "Product already exists"

- This is expected if you've run the script before
- Script reuses existing products and prices
- Delete from Stripe Dashboard if you want fresh setup

## Integration with Pricing Page

Once configured, use the generated IDs in your pricing page:

```typescript
import { STRIPE_PRODUCTS } from '@/config/stripe-products';

export default function PricingPage() {
  return (
    <div>
      {STRIPE_PRODUCTS.map((product) => (
        <PricingCard key={product.productId} {...product} />
      ))}
    </div>
  );
}
```

## Support

For Stripe integration issues:
- Stripe Docs: https://stripe.com/docs/subscriptions
- API Reference: https://stripe.com/docs/api/products
- Node.js SDK: https://github.com/stripe/stripe-node

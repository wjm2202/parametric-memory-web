const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

// Read .env.local directly and parse it
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n');

let STRIPE_SECRET_KEY = '';
for (const line of envLines) {
  if (line.startsWith('STRIPE_SECRET_KEY=')) {
    STRIPE_SECRET_KEY = line.replace('STRIPE_SECRET_KEY=', '').trim();
    break;
  }
}

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY not found in .env.local');
  process.exit(1);
}

console.log('✓ Loaded STRIPE_SECRET_KEY from .env.local');
console.log(`✓ Using Stripe API key: ${STRIPE_SECRET_KEY.substring(0, 20)}...`);

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  maxNetworkRetries: 5,
  timeout: 60000,
});

const PRODUCTS = [
  {
    name: 'Starter',
    price: 900, // $9/mo in cents
    description:
      'Dedicated MMPM instance. 512 MiB RAM, 10 GiB storage. All features: Merkle proofs, Markov prediction, MCP.',
  },
  {
    name: 'Solo',
    price: 2900, // $29/mo in cents
    description:
      'Dedicated MMPM instance. 1 GiB RAM, 25 GiB storage. All features plus email support.',
  },
  {
    name: 'Team',
    price: 7900, // $79/mo in cents
    description:
      'Dedicated MMPM instance. 4 GiB RAM, 80 GiB storage. All features, priority support, custom domain, multi-user API keys.',
  },
  {
    name: 'Enterprise Cloud',
    price: 29900, // $299/mo in cents
    description:
      'Dedicated General Purpose instance. 8 GiB RAM, 100+ GiB storage. SLA, SSO/SAML, compliance docs, dedicated support.',
  },
  {
    name: 'Enterprise Self-Hosted',
    price: 49900, // $499/mo in cents
    description:
      'Commercial license for self-hosted deployment. Run on your own AWS/GCP/Azure. Source access, onboarding, dedicated support.',
  },
];

async function retryWithExponentialBackoff(fn, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = Math.pow(2, attempt - 1) * 2000; // 2s, 4s, 8s, 16s, 32s
      console.log(`  ⏳ Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function main() {
  console.log('\n🚀 Starting Stripe product creation...\n');

  const createdProducts = [];

  for (const product of PRODUCTS) {
    console.log(`Processing: ${product.name} ($${(product.price / 100).toFixed(2)}/mo)`);

    try {
      // Check if product already exists by name
      let existingProduct;
      try {
        const result = await retryWithExponentialBackoff(async () => {
          const existingProducts = await stripe.products.list({
            limit: 100,
          });
          return existingProducts.data.find((p) => p.name === product.name);
        });
        existingProduct = result;
      } catch (listError) {
        console.log(`  ⚠️  Could not list products: ${listError.message}`);
        existingProduct = null;
      }

      let productId;

      if (existingProduct) {
        console.log(`  ✓ Product already exists: ${existingProduct.id}`);
        productId = existingProduct.id;
      } else {
        // Create new product
        let createdProduct;
        try {
          createdProduct = await retryWithExponentialBackoff(() =>
            stripe.products.create({
              name: product.name,
              description: product.description,
              type: 'service',
              metadata: {
                tier: product.name.toLowerCase().replace(/\s+/g, '-'),
              },
            })
          );
        } catch (createError) {
          console.error(`  ❌ Failed to create product after retries:`);
          console.error(`     ${createError.message || createError}`);
          throw createError;
        }

        console.log(`  ✓ Created product: ${createdProduct.id}`);
        productId = createdProduct.id;
      }

      // Check if price already exists for this product
      let existingPrice;
      try {
        const result = await retryWithExponentialBackoff(async () => {
          const existingPrices = await stripe.prices.list({
            product: productId,
            limit: 100,
          });
          return existingPrices.data.find(
            (p) => p.unit_amount === product.price && p.recurring?.interval === 'month'
          );
        });
        existingPrice = result;
      } catch (listError) {
        console.log(`  ⚠️  Could not list prices: ${listError.message}`);
        existingPrice = null;
      }

      let priceId;

      if (existingPrice) {
        console.log(`  ✓ Price already exists: ${existingPrice.id}`);
        priceId = existingPrice.id;
      } else {
        // Create new price
        let createdPrice;
        try {
          createdPrice = await retryWithExponentialBackoff(() =>
            stripe.prices.create({
              product: productId,
              unit_amount: product.price,
              currency: 'usd',
              recurring: {
                interval: 'month',
                interval_count: 1,
              },
              metadata: {
                tier: product.name.toLowerCase().replace(/\s+/g, '-'),
              },
            })
          );
        } catch (createError) {
          console.error(`  ❌ Failed to create price after retries:`);
          console.error(`     ${createError.message || createError}`);
          throw createError;
        }

        console.log(`  ✓ Created price: ${createdPrice.id}`);
        priceId = createdPrice.id;
      }

      createdProducts.push({
        name: product.name,
        productId,
        priceId,
        price: product.price / 100,
        currency: 'USD',
        interval: 'month',
      });

      console.log();
    } catch (error) {
      console.error(`\n✗ Stopping due to error with ${product.name}`);
      process.exit(1);
    }
  }

  // Generate TypeScript configuration file
  const configPath = path.join(process.cwd(), 'src/config/stripe-products.ts');
  const configDir = path.dirname(configPath);

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`📁 Created directory: ${configDir}`);
  }

  const configContent = `// Auto-generated by scripts/create-stripe-products.js
// DO NOT EDIT MANUALLY - regenerate with: node scripts/create-stripe-products.js

export interface StripeProductConfig {
  name: string;
  productId: string;
  priceId: string;
  price: number;
  currency: string;
  interval: string;
}

export const STRIPE_PRODUCTS: StripeProductConfig[] = ${JSON.stringify(createdProducts, null, 2)};

// Convenience lookups
export const STRIPE_PRODUCTS_BY_NAME = Object.fromEntries(
  STRIPE_PRODUCTS.map((p) => [p.name, p])
) as Record<string, StripeProductConfig>;

export const STRIPE_PRICES_BY_PRODUCT_ID = Object.fromEntries(
  STRIPE_PRODUCTS.map((p) => [p.productId, p.priceId])
) as Record<string, string>;
`;

  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log(`✅ Configuration saved to: ${configPath}\n`);

  // Print summary
  console.log('='.repeat(60));
  console.log('✨ Stripe Product Setup Complete!\n');
  console.log('Products created:');
  createdProducts.forEach((p) => {
    console.log(`  • ${p.name.padEnd(25)} | Price: $${p.price}/mo`);
    console.log(`    Product ID: ${p.productId}`);
    console.log(`    Price ID: ${p.priceId}`);
  });
  console.log('\n' + '='.repeat(60));
}

main().catch((error) => {
  console.error('\nFatal error:', error);
  process.exit(1);
});

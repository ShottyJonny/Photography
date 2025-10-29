# Netlify Environment Variables Setup Guide# Netlify Environment Variables Setup Guide



## Copy these values into Netlify's Environment Variables section:## Copy these values into Netlify's Environment Variables section:



### How to add them:### How to add them:

1. Go to: https://app.netlify.com1. Go to: https://app.netlify.com

2. Select your site2. Select your site

3. Site configuration → Environment variables3. Site configuration → Environment variables

4. Click "Add a variable" for each one below4. Click "Add a variable" for each one below



------



### Variable 1:### Variable 1:

**Key:** `VITE_SUPABASE_URL`**Key:** `VITE_SUPABASE_URL`

**Values:** `https://xecesotunsxkkgxiicqb.supabase.co`**Values:** `https://xecesotunsxkkgxiicqb.supabase.co`



### Variable 2:### Variable 2:

**Key:** `VITE_SUPABASE_ANON_KEY`**Key:** `VITE_SUPABASE_ANON_KEY`

**Values:** `[Get from your Supabase Dashboard → Settings → API → anon/public key]`**Values:** `[Your Supabase Anon Key - get from Supabase Dashboard → Settings → API]`



### Variable 3:### Variable 3:

**Key:** `VITE_STRIPE_PUBLISHABLE_KEY`**Key:** `VITE_STRIPE_PUBLISHABLE_KEY`

**Values:** `[Get from your Stripe Dashboard → Developers → API Keys → Publishable key]`**Values:** `[Your Stripe Publishable Key - get from Stripe Dashboard → Developers → API Keys]`



### Variable 4:### Variable 4:

**Key:** `STRIPE_SECRET_KEY`**Key:** `STRIPE_SECRET_KEY`

**Values:** `[Get from your Stripe Dashboard → Developers → API Keys → Secret key]`**Values:** `[Your Stripe Secret Key - get from Stripe Dashboard → Developers → API Keys]`



------



## After adding all 4 variables:## After adding all 4 variables:

1. Go to Deploys tab1. Go to Deploys tab

2. Click "Trigger deploy" → "Deploy site"2. Click "Trigger deploy" → "Deploy site"

3. Wait for build to complete3. Wait for build to complete



Your site will then have access to Supabase and Stripe! 🎉Your site will then have access to Supabase and Stripe! 🎉


## Security Note:
The actual API keys have been removed from this file for security reasons. 
Please get the real values from your respective dashboards when setting up Netlify.
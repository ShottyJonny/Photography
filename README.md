# Jon Hoffman Photography

A modern, full-featured photography portfolio and e-commerce website built with React, TypeScript, and Vite. This application allows photographers to showcase their work and sell prints directly to customers with integrated payment processing.

## 🌟 Features

### Core Functionality
- **Photography Portfolio**: Browse collections and individual prints with high-quality image display
- **E-Commerce**: Full shopping cart and checkout experience with Stripe integration
- **Order Management**: View order history and track purchases through Supabase
- **Responsive Design**: Mobile-first design that works seamlessly across all devices
- **PWA Support**: Installable as a Progressive Web App with offline capabilities

### User Experience
- **Dark/Light Theme**: Toggle between dark and light modes with persistent preferences
- **Shopping Cart**: Persistent cart with add-to-cart notifications and floating cart button
- **Smart Sizing**: Recommended print sizes based on image aspect ratios
- **Collections**: Curated photo collections for easy browsing
- **Cookie Consent**: GDPR-compliant cookie banner and consent management
- **Toast Notifications**: User-friendly feedback for actions and events

### Technical Features
- **TypeScript**: Full type safety throughout the application
- **Context API**: State management for cart, theme, pricing, and consent
- **React Router**: Client-side routing with hash-based navigation
- **Serverless Functions**: Netlify functions for secure payment processing
- **Email Integration**: Contact form with EmailJS integration

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **CSS3** - Custom styling (no UI framework dependencies)

### Backend & Services
- **Stripe** - Payment processing
- **Supabase** - Database and authentication
- **EmailJS** - Contact form email delivery
- **Netlify** - Hosting and serverless functions

### Development Tools
- **ESLint** - Code linting
- **TypeScript ESLint** - TypeScript-specific linting rules

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Stripe account (for payment processing)
- Supabase account (for database)
- Netlify account (for deployment)

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Photography-main
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key

# EmailJS Configuration (optional)
VITE_EMAILJS_SERVICE_ID=your_emailjs_service_id
VITE_EMAILJS_TEMPLATE_ID=your_emailjs_template_id
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
```

**Getting API Keys:**
- **Supabase**: [Dashboard → Settings → API](https://app.supabase.com)
- **Stripe**: [Dashboard → Developers → API Keys](https://dashboard.stripe.com/apikeys)
- **EmailJS**: [Dashboard → Email Services](https://dashboard.emailjs.com)

### 4. Run Development Server

```bash
# Start local development server
npm run dev

# Start with network access (for mobile testing)
npm run dev:local
```

Visit `http://localhost:5173` to see the application.

## 📦 Build & Deploy

### Build for Production
```bash
npm run build
```

This compiles TypeScript and builds the Vite project to the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

### Deploy to Netlify

1. **Connect Repository**: Link your Git repository to Netlify
2. **Environment Variables**: Add all required environment variables in Netlify dashboard (see [NETLIFY_ENV_SETUP.md](NETLIFY_ENV_SETUP.md))
3. **Build Settings**:
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Node version: `18`
4. **Deploy**: Netlify will automatically deploy on push to your main branch

### Netlify Functions

The following serverless functions are included:
- `create-checkout-session.js` - Creates Stripe checkout sessions
- `stripe-webhook.js` - Handles Stripe webhook events

These are automatically deployed to Netlify Functions.

## 🗂️ Project Structure

```
Photography-main/
├── netlify/
│   └── functions/          # Serverless functions
├── public/
│   ├── images/
│   │   ├── prints/         # Full-size print images
│   │   └── thumbs/         # Thumbnail images
│   └── manifest.json       # PWA manifest
├── src/
│   ├── assets/             # Static assets (logos, icons)
│   ├── components/         # React components
│   │   ├── Header.tsx
│   │   ├── CartDrawer.tsx
│   │   ├── ProductCard.tsx
│   │   └── ...
│   ├── context/            # React Context providers
│   │   ├── CartContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── ...
│   ├── data/               # Product and collection data
│   │   ├── products.ts
│   │   └── collections.ts
│   ├── pages/              # Page components
│   │   ├── Home.tsx
│   │   ├── Shop.tsx
│   │   ├── Product.tsx
│   │   └── ...
│   ├── services/           # External service integrations
│   │   ├── supabase.ts
│   │   └── emailService.ts
│   ├── utils/              # Utility functions
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Application entry point
│   └── styles.css          # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🎨 Adding Products

Products are defined in `src/data/products.ts`. Each product has:

```typescript
{
  id: string              // Unique identifier
  name: string            // Product name
  price: number           // Price in cents
  image: string           // Path to full-size image
  thumbnail?: string      // Path to thumbnail
  imageBW?: string        // Path to B&W version
  thumbnailBW?: string    // Path to B&W thumbnail
  description?: string    // Product description
  unlisted?: boolean      // Hide from shop (direct link only)
}
```

### Adding Images

1. Add full-size images to `public/images/prints/`
2. Add thumbnails to `public/images/thumbs/`
3. Add B&W versions to `public/images/prints/bw/` and `public/images/thumbs/bw/`
4. Update `src/data/products.ts` with the new product entry

### Auto-Generate Products (Optional)

Use the product generation script to automatically create product entries from your image folders:

```bash
npm run gen:products
```

## 🎯 Collections

Collections are defined in `src/data/collections.ts`. Group related products into themed collections for easier browsing.

## 🧪 Development

### Linting
```bash
npm run lint
```

### Code Style
- Use TypeScript for all new components
- Follow React hooks best practices
- Use functional components with hooks
- Keep components small and focused
- Use meaningful variable and function names

## 🔐 Security Notes

- Never commit `.env` files or API keys to version control
- Keep Stripe secret keys secure and only use them server-side
- Use Stripe's test mode during development
- Regularly rotate API keys
- Keep dependencies updated for security patches

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run linting and tests
4. Submit a pull request

## 📄 License

This project is private and proprietary.

## 📧 Support

For questions or issues, please contact through the website's contact form or open an issue in the repository.

---

**Built with ❤️ for photographers who want to share their art with the world.**

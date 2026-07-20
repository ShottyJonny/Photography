import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CartProvider } from '@/components/cart/CartContext'
import { Header } from '@/components/store/Header'
import { CartDrawer } from '@/components/cart/CartDrawer'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CartProvider>
        <Header />
        {children}
        <CartDrawer />
      </CartProvider>
    </ThemeProvider>
  )
}

import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CartProvider } from '@/components/cart/CartContext'
import { Header } from '@/components/store/Header'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CartProvider>
        <Header />
        {children}
      </CartProvider>
    </ThemeProvider>
  )
}

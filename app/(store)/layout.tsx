import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CartProvider } from '@/components/cart/CartContext'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider><CartProvider>{children}</CartProvider></ThemeProvider>
}

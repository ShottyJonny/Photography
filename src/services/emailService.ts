import emailjs from '@emailjs/browser'

// EmailJS configuration
const EMAILJS_SERVICE_ID = 'service_m6kyeba'
const EMAILJS_TEMPLATE_ID = 'template_fcnv3df'
const EMAILJS_PUBLIC_KEY = '27i5ChwovXgN7ckpO'

export type OrderData = {
  id: string
  createdAt: string
  customerShipping: {
    name: string
    email: string
    address1: string
    address2: string
    city: string
    region: string
    postal: string
    country: string
    notes: string
  }
  customerBilling: {
    name: string
    email: string
    address1: string
    address2: string
    city: string
    region: string
    postal: string
    country: string
  }
  items: Array<{
    id: string
    name: string
    size: string
    qty: number
    unit: number
  }>
  totals: {
    subtotal: number
    shipping: number
    tax: number
    total: number
  }
  marketing: {
    promoAgree: boolean
    newsletterOptIn: boolean
  }
}

// Initialize EmailJS (call this once when your app starts)
export function initializeEmailJS() {
  emailjs.init(EMAILJS_PUBLIC_KEY)
}

// Send order notification email to you (simplified - just one email)
export async function sendOrderNotification(orderData: OrderData): Promise<void> {
  // Format complete order details for your manual processing
  const orderNotification = `
🆕 NEW ORDER RECEIVED - #${orderData.id}

📅 ORDER DATE: ${new Date(orderData.createdAt).toLocaleDateString()}

👤 CUSTOMER INFORMATION:
• Name: ${orderData.customerShipping.name}
• Email: ${orderData.customerShipping.email}
• Phone: (if collected)

📦 SHIPPING ADDRESS:
${orderData.customerShipping.address1}
${orderData.customerShipping.address2 ? orderData.customerShipping.address2 + '\n' : ''}${orderData.customerShipping.city}, ${orderData.customerShipping.region} ${orderData.customerShipping.postal}
${orderData.customerShipping.country}

🎨 ITEMS TO PRINT:
${orderData.items.map(item => 
  `• ${item.name}\n  Size: ${item.size}\n  Quantity: ${item.qty}\n  Price: $${(item.unit / 100).toFixed(2)} each\n`
).join('\n')}

💰 ORDER TOTALS:
• Subtotal: $${(orderData.totals.subtotal / 100).toFixed(2)}
• Shipping: $${(orderData.totals.shipping / 100).toFixed(2)}
• Tax: $${(orderData.totals.tax / 100).toFixed(2)}
• TOTAL: $${(orderData.totals.total / 100).toFixed(2)}

💳 BILLING ADDRESS:
${formatAddress(orderData.customerBilling)}

📧 MARKETING PREFERENCES:
• Newsletter: ${orderData.marketing.newsletterOptIn ? 'Yes' : 'No'}
• Promotions: ${orderData.marketing.promoAgree ? 'Yes' : 'No'}

📝 SPECIAL NOTES: ${orderData.customerShipping.notes || 'None'}

---
⚡ This order has been saved to your system. 
📧 Customer email: ${orderData.customerShipping.email}
🆔 Order ID: ${orderData.id}

Next steps: Process prints → Package → Ship → Send tracking info to customer`

  const templateParams = {
    to_name: 'Jon',
    to_email: 'JonHoffmanBusiness@gmail.com',
    from_name: 'Photography Order System',
    subject: `📸 New Order #${orderData.id} - $${(orderData.totals.total / 100).toFixed(2)} from ${orderData.customerShipping.name}`,
    message: orderNotification
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
    console.log('Order notification email sent successfully')
  } catch (error) {
    console.error('Failed to send order notification email:', error)
    throw error
  }
}

// Helper function to format addresses
function formatAddress(address: any): string {
  const parts = [
    address.address1,
    address.address2,
    `${address.city}, ${address.region} ${address.postal}`,
    address.country
  ].filter(Boolean)
  
  return parts.join('\n')
}
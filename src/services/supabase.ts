import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Order type for database
export type OrderData = {
  id: string
  created_at?: string
  customer_email: string
  customer_name?: string
  shipping_address: any
  items: any[]
  totals: {
    subtotal: number
    shipping: number
    tax: number
    total: number
  }
  stripe_payment_intent_id?: string
  status?: string
  marketing?: any
  metadata?: any
}

// Save order to Supabase
export async function saveOrder(order: OrderData) {
  const { data, error } = await supabase
    .from('orders')
    .insert([order])
    .select()
  
  if (error) {
    console.error('Error saving order to Supabase:', error)
    throw error
  }
  
  return data[0]
}

// Get order by ID
export async function getOrder(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  
  if (error) {
    console.error('Error fetching order:', error)
    return null
  }
  
  return data
}

// Get all orders (for admin view - you'll add auth later)
export async function getAllOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching orders:', error)
    return []
  }
  
  return data
}

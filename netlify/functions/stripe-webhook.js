// Netlify Function to handle Stripe webhook events
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const sig = event.headers['stripe-signature']
  let stripeEvent

  try {
    // Verify webhook signature
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Webhook Error: ${err.message}` })
    }
  }

  // Initialize Supabase client with service key (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Handle different event types
  switch (stripeEvent.type) {
    case 'checkout.session.completed':
      const session = stripeEvent.data.object
      
      try {
        // Extract order ID from metadata
        const orderId = session.metadata.orderId
        const paymentIntentId = session.payment_intent

        if (!orderId) {
          console.error('No orderId in session metadata')
          break
        }

        // Update order status in Supabase
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'completed',
            stripe_payment_intent_id: paymentIntentId,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)

        if (error) {
          console.error('Error updating order:', error)
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update order' })
          }
        }

        console.log(`Order ${orderId} marked as completed with payment intent ${paymentIntentId}`)
      } catch (error) {
        console.error('Error processing checkout.session.completed:', error)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message })
        }
      }
      break

    case 'checkout.session.expired':
      const expiredSession = stripeEvent.data.object
      
      try {
        const orderId = expiredSession.metadata.orderId

        if (!orderId) {
          console.error('No orderId in expired session metadata')
          break
        }

        // Update order status to expired
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)

        if (error) {
          console.error('Error updating expired order:', error)
        }

        console.log(`Order ${orderId} marked as expired`)
      } catch (error) {
        console.error('Error processing checkout.session.expired:', error)
      }
      break

    case 'payment_intent.payment_failed':
      const failedIntent = stripeEvent.data.object
      
      try {
        // Update order status to failed
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'failed',
            stripe_payment_intent_id: failedIntent.id,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_payment_intent_id', failedIntent.id)

        if (error) {
          console.error('Error updating failed payment order:', error)
        }

        console.log(`Payment failed for intent ${failedIntent.id}`)
      } catch (error) {
        console.error('Error processing payment_intent.payment_failed:', error)
      }
      break

    default:
      console.log(`Unhandled event type: ${stripeEvent.type}`)
  }

  // Return success response to Stripe
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true })
  }
}

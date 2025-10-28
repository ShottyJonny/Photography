// Netlify Function to create Stripe Checkout Session
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { items, orderId, customerEmail, customerName } = JSON.parse(event.body)

    // Calculate line items for Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: `Size: ${item.size}`,
        },
        unit_amount: item.unit, // price in cents
      },
      quantity: item.qty,
    }))

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.URL || 'http://localhost:5181'}/#/order/${orderId}`,
      cancel_url: `${process.env.URL || 'http://localhost:5181'}/#/checkout`,
      customer_email: customerEmail,
      metadata: {
        orderId,
        customerName,
      },
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: session.id, url: session.url }),
    }
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }
}

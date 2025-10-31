// Netlify Function to create Stripe Checkout Session
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { items, orderId, customerEmail, customerName, totals } = JSON.parse(event.body)

    // Calculate line items for Stripe - start with products
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

    // Add shipping as a line item if there's a shipping cost
    if (totals && totals.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
            description: 'Standard shipping',
          },
          unit_amount: totals.shipping,
        },
        quantity: 1,
      })
    }

    // Add tax as a line item if there's tax
    if (totals && totals.tax > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Tax',
            description: 'Sales tax',
          },
          unit_amount: totals.tax,
        },
        quantity: 1,
      })
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.URL || 'http://localhost:5181'}/#/order/${orderId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL || 'http://localhost:5181'}/#/checkout?canceled=true`,
      customer_email: customerEmail,
      metadata: {
        orderId,
        customerName,
        customerEmail,
      },
      // Allow Stripe to send payment intent ID in webhook
      payment_intent_data: {
        metadata: {
          orderId,
        }
      }
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

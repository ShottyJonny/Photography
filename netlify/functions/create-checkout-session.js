// Netlify Function to create Stripe Checkout Session
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { computeOrderAmounts } = require('./_pricing')

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' }),
    }
  }

  const { items, orderId, customerEmail, customerName, shippingAddress } = body

  // The server is the sole authority on price. item.unit and totals from the
  // client are never trusted — computeOrderAmounts derives everything from
  // item.size and the shipping address. See netlify/functions/_pricing.js.
  let amounts
  try {
    amounts = computeOrderAmounts(items, shippingAddress)
  } catch (error) {
    console.error('Order validation failed:', error.message)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'We could not validate your order. Please refresh and try again.' }),
    }
  }

  try {
    // Calculate line items for Stripe from server-computed, trusted amounts
    const lineItems = amounts.lineItems.map(li => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: li.name,
          description: `Size: ${li.size}`,
        },
        unit_amount: li.unit, // price in cents, computed server-side
      },
      quantity: li.qty,
    }))

    // Add shipping as a line item if there's a shipping cost
    if (amounts.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
            description: 'Standard shipping',
          },
          unit_amount: amounts.shipping,
        },
        quantity: 1,
      })
    }

    // Add tax as a line item if there's tax
    if (amounts.tax > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Tax',
            description: 'Sales tax',
          },
          unit_amount: amounts.tax,
        },
        quantity: 1,
      })
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      // This is a hash router: a query string placed AFTER the # becomes part
      // of the route and corrupts the order ID. Query must come BEFORE the #.
      success_url: `${process.env.URL || 'http://localhost:5181'}/?payment=success&session_id={CHECKOUT_SESSION_ID}#/order/${orderId}`,
      cancel_url: `${process.env.URL || 'http://localhost:5181'}/?canceled=true#/checkout`,
      customer_email: customerEmail,
      metadata: {
        orderId,
        customerName,
        customerEmail,
      },
      // Allow Stripe to send payment intent ID in webhook, and have Stripe
      // send its own receipt email to the customer.
      payment_intent_data: {
        receipt_email: customerEmail,
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
      body: JSON.stringify({ error: 'Unable to create checkout session' }),
    }
  }
}

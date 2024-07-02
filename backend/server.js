const express = require('express');
const cors = require('cors');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
require('dotenv').config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

app.post('/create_link_token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'user-id' },
      client_name: 'Plaid App',
      products: process.env.PLAID_PRODUCTS.split(','),
      country_codes: process.env.PLAID_COUNTRY_CODES.split(','),
      language: 'en',
      redirect_uri: process.env.PLAID_REDIRECT_URI,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

app.post('/exchange_public_token', async (req, res) => {
  const { public_token } = req.body;
  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = response.data.access_token;
    // TODO: Securely store the access_token
    console.log('Access token:', accessToken);
    res.json({ message: 'Public token exchanged successfully' });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
});

app.post('/create_adyen_processor_token', async (req, res) => {
  const { access_token, account_id } = req.body;
  try {
    const response = await plaidClient.processorTokenCreate({
      access_token,
      account_id,
      processor: 'adyen',
    });
    const processorToken = response.data.processor_token;
    // TODO: Securely store the processor_token if needed
    res.json({ processor_token: processorToken });
  } catch (error) {
    console.error('Error creating Adyen processor token:', error);
    res.status(500).json({ error: 'Failed to create Adyen processor token' });
  }
});

app.post('/create_adyen_payment', async (req, res) => {
  const { processor_token, amount, currency, reference } = req.body;

  try {
    const response = await axios.post(
      `${process.env.ADYEN_API_ENDPOINT}/payments`,
      {
        amount: {
          value: amount, // Amount in cents
          currency: currency,
        },
        reference: reference,
        paymentMethod: {
          type: 'ach',
          ach: {
            bankAccountToken: processor_token,
            ownerName: 'John Doe', // This should be collected from the user
          },
        },
        shopperReference: 'YOUR_UNIQUE_SHOPPER_ID_HERE',
        recurringProcessingModel: 'Subscription',
        shopperInteraction: 'ContAuth',
      },
      {
        headers: {
          'x-API-key': process.env.ADYEN_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error creating Adyen payment:', error);
    res.status(500).json({ error: 'Failed to create Adyen payment' });
  }
});

app.post('/adyen-webhook', (req, res) => {
  const webhook = req.body;
  
  // Verify the HMAC signature of the webhook (implementation not shown here)
  
  if (webhook.eventCode === 'AUTHORISATION') {
    const paymentSuccess = webhook.success === 'true';
    if (paymentSuccess) {
      // Payment was successful
      console.log('Payment successful for reference:', webhook.merchantReference);
      // TODO: Update order status in your database
      // TODO: Notify the merchant or update the UI
    } else {
      // Payment failed
      console.log('Payment failed for reference:', webhook.merchantReference);
      // TODO: Handle failed payment (e.g., notify the user, update order status)
    }
  }

  res.status(200).send('Webhook received');
});


const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
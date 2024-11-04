
## Ethereum Wallet Manager

A robust Node.js application for creating, funding, and managing multiple Ethereum wallets in batches. This tool allows for efficient creation of multiple wallets, funding them from a main wallet, and returning specified portions of the funds.


## Features

✨ Batch wallet creation and management

💰 Automated funding of new wallets

↩️ Automatic fund return functionality

⚡ Efficient batch processing

🔍 Transaction confirmation monitoring

🛡️ Built-in error handling and recovery

📊 Detailed operation reporting


## Prerequisites

Node.js (v12.0.0 or higher)

npm or yarn

An Ethereum node URL (Infura, local node, etc.)

A funded Ethereum wallet to use as the main wallet


## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Create .env file with required variables:
   - RPC_URL
   - MAIN_PRIVATE_KEY
   - WALLET_COUNT
   - FUND_AMOUNT
   - BATCH_SIZE
   - CONCURRENT_TRANSACTIONS

3. Run the script:
   ```bash
   node app/create-wallets.js
   ```

## Configuration
- Adjust CONCURRENT_TRANSACTIONS based on your RPC provider's limits
- Monitor error.log and combined.log for detailed operation logs
- Use NODE_ENV=production for production deployment

## Security
- Never commit .env file
- Use secure key management in production
- Monitor gas prices and adjust accordingly




# Error Handling

The script includes comprehensive error handling for:

### Insufficient balance

Failed transactions

Network issues

Transaction timeouts

Invalid parameters

### Gas Management

Dynamic gas price fetching

Configurable gas limits

Estimated gas cost calculation

### Monitoring and Logging
The script provides detailed logging of:

Batch processing progress

Transaction success/failure

Error details

Operation statistics

### Best Practices

1. Start with a small batch size (20-50) to test the script
2. Monitor gas prices and adjust accordingly
3. Ensure main wallet has sufficient funds including gas costs
4. Use a reliable Ethereum node/RPC provider
5. Keep private keys secure and never commit them to code

### Security Considerations

1. Never share or expose private keys
2. Test with small amounts first
3. Monitor transactions for unexpected behavior
4. Keep track of created wallets and their states
4. Implement additional security measures for production use

### Limitations

1. Network congestion can affect processing time
2. Gas costs may vary significantly
3. Rate limiting by RPC provider may occur
4. Large batches may require significant funds




## Contributing


Feel free to submit issues and enhancement requests!
contact@ithd.co.uk

### License
MIT License - feel free to use and modify for your own purposes.

### Disclaimer
This tool is provided for educational purposes. Use at your own risk. Always test thoroughly before using with significant amounts of ETH.

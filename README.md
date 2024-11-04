Ethereum Wallet Manager
A robust Node.js application for creating, funding, and managing multiple Ethereum wallets in batches. This tool allows for efficient creation of multiple wallets, funding them from a main wallet, and returning specified portions of the funds.
Features

✨ Batch wallet creation and management
💰 Automated funding of new wallets
↩️ Automatic fund return functionality
⚡ Efficient batch processing
🔍 Transaction confirmation monitoring
🛡️ Built-in error handling and recovery
📊 Detailed operation reporting

Prerequisites

Node.js (v12.0.0 or higher)
npm or yarn
An Ethereum node URL (Infura, local node, etc.)
A funded Ethereum wallet to use as the main wallet

Installation

Clone the repository or create a new directory:

bashCopymkdir ethereum-wallet-manager
cd ethereum-wallet-manager

Initialize a new Node.js project:

bashCopynpm init -y

Install required dependencies:

bashCopynpm install web3

Create the main script file:

bashCopytouch wallet-manager.js

Copy the provided code into wallet-manager.js

Configuration
Before running the script, you need to configure the following:

Update the RPC URL in the Web3 initialization:

javascriptCopyconst web3 = new Web3("Your_RPC_URL");

Set your main wallet's private key:

javascriptCopyconst manager = new WalletManager("Your_Main_Private_Key", 50);

Adjust batch size if needed (default is 50):

javascriptCopyconst batchSize = 50; // Modify as needed
Usage
Basic Usage
javascriptCopyasync function main() {
    try {
        // Create manager instance
        const manager = new WalletManager("Your_Main_Private_Key", 50);
        
        // Create and manage 10000 wallets with 0.001 ETH each
        const results = await manager.createAndManageWallets(10000, 0.001);
        
        console.log(`Total wallets created: ${results.created}`);
        console.log(`Successful transactions: ${results.successful.length}`);
        console.log(`Failed transactions: ${results.failed.length}`);
    } catch (error) {
        console.error("Error in wallet management:", error.message);
    }
}

main();
Running the Script
bashCopynode wallet-manager.js
Class Methods
WalletManager
Constructor
javascriptCopyconst manager = new WalletManager(mainPrivateKey, batchSize);

mainPrivateKey: Private key of the funding wallet
batchSize: Number of wallets to process in each batch (default: 50)

checkMainBalance(requiredAmount)
Verifies if the main wallet has sufficient balance for operations.

requiredAmount: Total ETH needed for all operations

createWallets(count)
Creates specified number of new Ethereum wallets.

count: Number of wallets to create

processBatch(wallets, fundAmount, returnPercentage)
Processes a batch of wallets - funding and return operations.

wallets: Array of wallet objects
fundAmount: Amount of ETH to send to each wallet
returnPercentage: Percentage of funds to return (default: 95)

createAndManageWallets(walletCount, fundAmount)
Main function to orchestrate wallet creation and management.

walletCount: Total number of wallets to create
fundAmount: Amount of ETH to send to each wallet

Response Format
The script returns an object with the following structure:
javascriptCopy{
    successful: [], // Array of successful wallet addresses
    failed: [     // Array of failed operations
        {
            address: "0x...",
            error: "error message",
            stage: "funding/returning"
        }
    ],
    created: 0    // Total number of wallets created
}
Error Handling
The script includes comprehensive error handling for:

Insufficient balance
Failed transactions
Network issues
Transaction timeouts
Invalid parameters

Gas Management

Dynamic gas price fetching
Configurable gas limits
Estimated gas cost calculation

Monitoring and Logging
The script provides detailed logging of:

Batch processing progress
Transaction success/failure
Error details
Operation statistics

Best Practices

Start with a small batch size (20-50) to test the script
Monitor gas prices and adjust accordingly
Ensure main wallet has sufficient funds including gas costs
Use a reliable Ethereum node/RPC provider
Keep private keys secure and never commit them to code

Security Considerations

Never share or expose private keys
Test with small amounts first
Monitor transactions for unexpected behavior
Keep track of created wallets and their states
Implement additional security measures for production use

Limitations

Network congestion can affect processing time
Gas costs may vary significantly
Rate limiting by RPC provider may occur
Large batches may require significant funds

Troubleshooting
Common issues and solutions:

Insufficient Funds

Ensure main wallet has enough ETH for all operations including gas
Reduce batch size or number of wallets


Transaction Timeouts

Increase maxAttempts in waitForConfirmation
Check network congestion
Verify RPC node stability


High Gas Costs

Adjust gas price calculation
Process during low network usage periods
Reduce batch size


RPC Errors

Verify RPC URL
Check RPC provider status
Consider using a different provider



Contributing
Feel free to submit issues and enhancement requests!
License
MIT License - feel free to use and modify for your own purposes.
Disclaimer
This tool is provided for educational purposes. Use at your own risk. Always test thoroughly before using with significant amounts of ETH.

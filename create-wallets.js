const Web3 = require('web3');
// Initialize Web3 with your Ethereum node URL (Infura, local node, etc.)
const web3 = new Web3("Your_RPC_URL");

/**
 * WalletManager class handles creation and management of multiple Ethereum wallets
 * Includes funding operations and return transactions
 */
class WalletManager {
    /**
     * Initialize WalletManager with main wallet and batch configuration
     * @param {string} mainPrivateKey - Private key of the funding wallet
     * @param {number} batchSize - Number of wallets to process in each batch (default: 50)
     */
    constructor(mainPrivateKey, batchSize = 50) {
        this.mainPrivateKey = mainPrivateKey;
        this.mainWallet = web3.eth.accounts.privateKeyToAccount(mainPrivateKey);
        this.batchSize = batchSize;
        this.wallets = [];
    }

    /**
     * Verify if main wallet has enough balance for all operations
     * @param {number} requiredAmount - Total ETH needed for operations
     * @returns {Promise<boolean>} - True if sufficient balance, throws error if insufficient
     */
    async checkMainBalance(requiredAmount) {
        // Get current balance of main wallet
        const balance = await web3.eth.getBalance(this.mainWallet.address);
        // Convert required amount to Wei (smallest ETH unit)
        const requiredWei = web3.utils.toWei((requiredAmount).toString(), "ether");
        
        // Compare balance with required amount using BigNumber comparison
        if (web3.utils.toBN(balance).lt(web3.utils.toBN(requiredWei))) {
            throw new Error(`Insufficient balance. Required: ${requiredAmount} ETH, Available: ${web3.utils.fromWei(balance, "ether")} ETH`);
        }
        return true;
    }

    /**
     * Wait for transaction confirmation and verify success
     * @param {string} txHash - Transaction hash to monitor
     * @param {number} maxAttempts - Maximum number of confirmation check attempts
     * @returns {Promise<object>} - Transaction receipt or throws error
     */
    async waitForConfirmation(txHash, maxAttempts = 20) {
        let attempts = 0;
        while (attempts < maxAttempts) {
            try {
                // Get transaction receipt from network
                const receipt = await web3.eth.getTransactionReceipt(txHash);
                
                // Check if transaction is confirmed and successful
                if (receipt && receipt.status) {
                    return receipt;
                } else if (receipt && !receipt.status) {
                    throw new Error(`Transaction failed: ${txHash}`);
                }
            } catch (error) {
                console.error(`Error checking transaction ${txHash}:`, error);
            }
            attempts++;
            // Wait 3 seconds between checks to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        throw new Error(`Transaction confirmation timeout: ${txHash}`);
    }

    /**
     * Create specified number of new Ethereum wallets
     * @param {number} count - Number of wallets to create
     * @returns {Promise<Array>} - Array of created wallet objects
     */
    async createWallets(count) {
        const newWallets = [];
        for (let i = 0; i < count; i++) {
            // Create new Ethereum account
            const wallet = web3.eth.accounts.create();
            newWallets.push(wallet);
        }
        // Add new wallets to internal wallet array
        this.wallets = this.wallets.concat(newWallets);
        return newWallets;
    }

    /**
     * Process a batch of wallets - fund them and return funds
     * @param {Array} wallets - Array of wallet objects to process
     * @param {number} fundAmount - Amount of ETH to send to each wallet
     * @param {number} returnPercentage - Percentage of funds to return (default: 95)
     * @returns {Promise<object>} - Results of funding and return operations
     */
    async processBatch(wallets, fundAmount, returnPercentage = 95) {
        // Get current gas price for all transactions in batch
        const gasPrice = await web3.eth.getGasPrice();
        // Convert amounts to Wei
        const fundValue = web3.utils.toWei(fundAmount.toString(), "ether");
        const returnValue = web3.utils.toWei((fundAmount * returnPercentage / 100).toString(), "ether");

        // Create array of promises for funding transactions
        const fundPromises = wallets.map(async (wallet) => {
            try {
                // Prepare funding transaction
                const tx = {
                    from: this.mainWallet.address,
                    to: wallet.address,
                    value: fundValue,
                    gas: "210000",
                    gasPrice: gasPrice
                };

                // Sign and send funding transaction
                const signed = await this.mainWallet.signTransaction(tx);
                const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
                await this.waitForConfirmation(receipt.transactionHash);
                return { success: true, wallet, type: 'fund' };
            } catch (error) {
                return { success: false, wallet, error, type: 'fund' };
            }
        });

        // Wait for all funding transactions to complete
        const fundResults = await Promise.all(fundPromises);

        // Filter for successfully funded wallets
        const successfullyFunded = fundResults
            .filter(result => result.success)
            .map(result => result.wallet);

        // Create array of promises for return transactions
        const returnPromises = successfullyFunded.map(async (wallet) => {
            try {
                // Prepare return transaction
                const tx = {
                    from: wallet.address,
                    to: this.mainWallet.address,
                    value: returnValue,
                    gas: "210000",
                    gasPrice: gasPrice
                };

                // Sign and send return transaction
                const signed = await wallet.signTransaction(tx);
                const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
                await this.waitForConfirmation(receipt.transactionHash);
                return { success: true, wallet, type: 'return' };
            } catch (error) {
                return { success: false, wallet, error, type: 'return' };
            }
        });

        // Wait for all return transactions to complete
        const returnResults = await Promise.all(returnPromises);
        return { fundResults, returnResults };
    }

    /**
     * Main function to orchestrate wallet creation and management
     * @param {number} walletCount - Total number of wallets to create and manage
     * @param {number} fundAmount - Amount of ETH to send to each wallet
     * @returns {Promise<object>} - Summary of operations results
     */
    async createAndManageWallets(walletCount, fundAmount) {
        try {
            // Calculate total ETH needed including estimated gas costs
            const estimatedGasCost = 0.01 * walletCount; // Rough estimate
            const totalRequired = (fundAmount * walletCount) + estimatedGasCost;
            
            // Verify sufficient balance
            await this.checkMainBalance(totalRequired);

            // Initialize results tracking
            const results = {
                successful: [],
                failed: [],
                created: 0
            };

            // Process wallets in batches
            for (let i = 0; i < walletCount; i += this.batchSize) {
                const batchSize = Math.min(this.batchSize, walletCount - i);
                console.log(`Processing batch ${i / this.batchSize + 1}...`);

                // Create and process batch of wallets
                const newWallets = await this.createWallets(batchSize);
                results.created += newWallets.length;

                // Process transactions for current batch
                const { fundResults, returnResults } = await this.processBatch(newWallets, fundAmount);

                // Track failed funding transactions
                fundResults.forEach(result => {
                    if (!result.success) {
                        results.failed.push({
                            address: result.wallet.address,
                            error: result.error.message,
                            stage: 'funding'
                        });
                    }
                });

                // Track failed return transactions
                returnResults.forEach(result => {
                    if (!result.success) {
                        results.failed.push({
                            address: result.wallet.address,
                            error: result.error.message,
                            stage: 'returning'
                        });
                    } else {
                        results.successful.push(result.wallet.address);
                    }
                });

                // Add delay between batches to prevent network congestion
                if (i + this.batchSize < walletCount) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Wallet creation failed: ${error.message}`);
        }
    }
}

/**
 * Example usage of WalletManager
 * Creates and manages multiple wallets with specified parameters
 */
async function main() {
    try {
        // Initialize manager with main wallet private key and batch size of 50
        const manager = new WalletManager("Your_Main_Private_Key", 50);
        
        // Create and manage 10000 wallets, funding each with 0.001 ETH
        const results = await manager.createAndManageWallets(10000, 0.001);
        
        // Log results
        console.log("Wallet creation completed:");
        console.log(`Total wallets created: ${results.created}`);
        console.log(`Successful transactions: ${results.successful.length}`);
        console.log(`Failed transactions: ${results.failed.length}`);
        
        // Log details of any failed transactions
        if (results.failed.length > 0) {
            console.log("Failed transactions details:");
            console.log(results.failed);
        }
    } catch (error) {
        console.error("Error in wallet management:", error.message);
    }
}

// Execute the main function
main();

// Import Web3 library for Ethereum interaction
const Web3 = require('web3');
const web3 = new Web3("Your_RPC_URL");

// Global configuration for gas and timing parameters
const CONFIG = {
    GAS_LIMIT: '21000',      // Standard ETH transfer gas limit
    CONFIRMATION_ATTEMPTS: 20, // Number of attempts to confirm a transaction
    RETRY_COUNT: 3,          // Number of retry attempts for failed operations
    BATCH_DELAY: 1000,       // Delay between processing batches (1 second)
    CONFIRMATION_DELAY: 3000  // Delay between confirmation checks (3 seconds)
};

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
        // Store the private key of the main funding wallet
        this.mainPrivateKey = mainPrivateKey;
        // Convert private key to an Ethereum account object
        this.mainWallet = web3.eth.accounts.privateKeyToAccount(mainPrivateKey);
        // Number of wallets to process in each batch
        this.batchSize = batchSize;
        // Array to store created wallet objects
        this.wallets = [];
        // Track transaction nonce for the main wallet
        this.currentNonce = null;
    }

    /**
     * Verify if main wallet has enough balance for all operations
     * @param {number} requiredAmount - Total ETH needed for operations
     * @returns {Promise<boolean>} - True if sufficient balance, throws error if insufficient
     */
    async checkMainBalance(requiredAmount) {
        // Get current balance in Wei (smallest ETH unit)
        const balance = await web3.eth.getBalance(this.mainWallet.address);
        // Convert required amount from ETH to Wei for comparison
        const requiredWei = web3.utils.toWei((requiredAmount).toString(), "ether");
        
        // Use BigNumber comparison to avoid floating-point issues
        if (web3.utils.toBN(balance).lt(web3.utils.toBN(requiredWei))) {
            throw new Error(`Insufficient balance. Required: ${requiredAmount} ETH, Available: ${web3.utils.fromWei(balance, "ether")} ETH`);
        }
        return true;
    }

    /**
     * Wait for transaction confirmation and verify success
     * @param {string} txHash - Transaction hash to monitor
     * @param {number} maxAttempts - Maximum number of confirmation check attempts
     * @param {number} retryCount - Number of retry attempts
     * @returns {Promise<object>} - Transaction receipt or throws error
     */
    async waitForConfirmation(txHash, maxAttempts = 20, retryCount = 3) {
        // Outer loop for retry attempts if confirmation fails
        for (let retry = 0; retry < retryCount; retry++) {
            try {
                let attempts = 0;
                // Inner loop for checking transaction confirmation
                while (attempts < maxAttempts) {
                    try {
                        const receipt = await web3.eth.getTransactionReceipt(txHash);
                        
                        // Transaction confirmed and successful
                        if (receipt && receipt.status) {
                            return receipt;
                        } 
                        // Transaction confirmed but failed
                        else if (receipt && !receipt.status) {
                            throw new Error(`Transaction failed: ${txHash}`);
                        }
                        // Transaction not yet confirmed - will retry
                    } catch (error) {
                        console.error(`Error checking transaction ${txHash}:`, error);
                    }
                    attempts++;
                    // Wait between confirmation checks
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                throw new Error(`Transaction confirmation timeout: ${txHash}`);
            } catch (error) {
                // If this was the last retry, throw the error
                if (retry === retryCount - 1) throw error;
                // Otherwise wait and try again
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    /**
     * Create specified number of new Ethereum wallets
     * @param {number} count - Number of wallets to create
     * @returns {Promise<Array>} - Array of created wallet objects
     */
    async createWallets(count) {
        const newWallets = [];
        // Create specified number of new Ethereum accounts
        for (let i = 0; i < count; i++) {
            const wallet = web3.eth.accounts.create();
            newWallets.push(wallet);
        }
        // Add new wallets to the internal tracking array
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
        // Get current gas price for all transactions in this batch
        const gasPrice = await web3.eth.getGasPrice();
        // Convert ETH amounts to Wei
        const fundValue = web3.utils.toWei(fundAmount.toString(), "ether");
        const returnValue = web3.utils.toWei((fundAmount * returnPercentage / 100).toString(), "ether");

        // Step 1: Fund all wallets in parallel
        const fundPromises = wallets.map(async (wallet) => {
            try {
                // Create funding transaction
                const tx = {
                    from: this.mainWallet.address,
                    to: wallet.address,
                    value: fundValue,
                    gas: "210000",
                    gasPrice: gasPrice,
                    nonce: await this.getNextNonce()
                };

                // Sign and send the transaction
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

        // Step 2: Return funds from successfully funded wallets
        const successfullyFunded = fundResults
            .filter(result => result.success)
            .map(result => result.wallet);

        const returnPromises = successfullyFunded.map(async (wallet) => {
            try {
                // Create return transaction
                const tx = {
                    from: wallet.address,
                    to: this.mainWallet.address,
                    value: returnValue,
                    gas: "210000",
                    gasPrice: gasPrice,
                    nonce: await this.getNextNonce()
                };

                // Sign and send the return transaction
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
        // Add input validation
        if (!Number.isInteger(walletCount) || walletCount <= 0) {
            throw new Error('Wallet count must be a positive integer');
        }
        if (typeof fundAmount !== 'number' || fundAmount <= 0) {
            throw new Error('Fund amount must be a positive number');
        }
        try {
            // Calculate total ETH needed including estimated gas costs
            const gasLimit = 21000;
            const gasPrice = await web3.eth.getGasPrice();
            const estimatedGasCost = web3.utils.fromWei(
                web3.utils.toBN(gasPrice).mul(web3.utils.toBN(gasLimit * 2 * walletCount)),
                'ether'
            );
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

    /**
     * Get and increment nonce for the main wallet
     * @returns {Promise<number>} - Next nonce for the main wallet
     */
    async getNextNonce() {
        if (this.currentNonce === null) {
            this.currentNonce = await web3.eth.getTransactionCount(this.mainWallet.address);
        }
        return this.currentNonce++;
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

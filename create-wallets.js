// Import Web3 library for Ethereum interaction
const Web3 = require('web3');
const web3 = new Web3(process.env.RPC_URL);

// Global configuration for gas and timing parameters
const CONFIG = {
    GAS_LIMIT: '21000',      // Standard ETH transfer gas limit
    CONFIRMATION_ATTEMPTS: 20, // Number of attempts to confirm a transaction
    RETRY_COUNT: 3,          // Number of retry attempts for failed operations
    BATCH_DELAY: parseInt(process.env.BATCH_DELAY || '1000'),
    CONFIRMATION_DELAY: parseInt(process.env.CONFIRMATION_DELAY || '3000'),
    CONCURRENT_TRANSACTIONS: parseInt(process.env.CONCURRENT_TRANSACTIONS || '5')
};

// Add Rate Limiting Package
const pLimit = require('p-limit');

// Configure logger
const winston = require('winston');
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Add to production environment only
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

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

        // Add performance monitoring
        this.metrics = {
            startTime: null,
            endTime: null,
            successfulTransactions: 0,
            failedTransactions: 0,
            gasUsed: web3.utils.toBN(0)
        };
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
    async waitForConfirmation(txHash, maxAttempts = CONFIG.CONFIRMATION_ATTEMPTS, retryCount = CONFIG.RETRY_COUNT) {
        for (let retry = 0; retry < retryCount; retry++) {
            try {
                console.log(`Waiting for confirmation of tx ${txHash} (attempt ${retry + 1}/${retryCount})`);
                let attempts = 0;
                
                while (attempts < maxAttempts) {
                    try {
                        const receipt = await web3.eth.getTransactionReceipt(txHash);
                        
                        if (receipt && receipt.status) {
                            console.log(`Transaction ${txHash} confirmed successfully`);
                            return receipt;
                        } else if (receipt && !receipt.status) {
                            throw new Error(`Transaction ${txHash} failed on-chain`);
                        }
                    } catch (error) {
                        console.error(`Error checking transaction ${txHash}:`, error);
                    }
                    
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, CONFIG.CONFIRMATION_DELAY));
                }
                
                throw new Error(`Transaction confirmation timeout: ${txHash}`);
            } catch (error) {
                if (retry === retryCount - 1) throw error;
                console.log(`Retrying confirmation check for ${txHash}...`);
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
        try {
            const gasPrice = await web3.eth.getGasPrice();
            const fundValue = web3.utils.toWei(fundAmount.toString(), "ether");
            const returnValue = web3.utils.toWei((fundAmount * returnPercentage / 100).toString(), "ether");

            // Create rate limiter with configurable concurrency
            const limit = pLimit(CONFIG.CONCURRENT_TRANSACTIONS);

            // Step 1: Fund wallets with rate limiting
            const fundPromises = wallets.map(wallet => 
                limit(async () => {
                    try {
                        console.log(`Funding wallet: ${wallet.address}`);
                        const tx = {
                            from: this.mainWallet.address,
                            to: wallet.address,
                            value: fundValue,
                            gas: CONFIG.GAS_LIMIT,
                            gasPrice: gasPrice,
                            nonce: await this.getNextNonce()
                        };

                        const signed = await this.mainWallet.signTransaction(tx);
                        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
                        await this.waitForConfirmation(receipt.transactionHash);
                        
                        console.log(`Successfully funded wallet: ${wallet.address}`);
                        return { success: true, wallet, type: 'fund' };
                    } catch (error) {
                        console.error(`Failed to fund wallet ${wallet.address}:`, error);
                        return { success: false, wallet, error: error.message, type: 'fund' };
                    }
                })
            );

            const fundResults = await Promise.all(fundPromises);

            // Step 2: Return funds with rate limiting
            const successfullyFunded = fundResults
                .filter(result => result.success)
                .map(result => result.wallet);

            const returnPromises = successfullyFunded.map(wallet =>
                limit(async () => {
                    try {
                        console.log(`Returning funds from wallet: ${wallet.address}`);
                        // Calculate the actual return amount (subtracting gas costs)
                        const gasNeeded = web3.utils.toBN(CONFIG.GAS_LIMIT).mul(web3.utils.toBN(gasPrice));
                        const actualReturnValue = web3.utils.toBN(returnValue).sub(gasNeeded);

                        const tx = {
                            from: wallet.address,
                            to: this.mainWallet.address,
                            value: actualReturnValue.toString(),
                            gas: CONFIG.GAS_LIMIT,
                            gasPrice: gasPrice,
                            nonce: '0' // New wallets always start with nonce 0
                        };

                        // Properly sign the transaction using the wallet's private key
                        const signed = await web3.eth.accounts.signTransaction(tx, wallet.privateKey);
                        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
                        await this.waitForConfirmation(receipt.transactionHash);

                        console.log(`Successfully returned funds from wallet: ${wallet.address}`);
                        return { success: true, wallet, type: 'return' };
                    } catch (error) {
                        console.error(`Failed to return funds from wallet ${wallet.address}:`, error);
                        return { success: false, wallet, error: error.message, type: 'return' };
                    }
                })
            );

            const returnResults = await Promise.all(returnPromises);
            return { fundResults, returnResults };
        } catch (error) {
            logger.error('Batch processing error', {
                error: error.message,
                stack: error.stack,
                walletCount: wallets.length,
                fundAmount
            });
            throw error;
        }
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
        try {
            // Always get fresh nonce from network to prevent conflicts
            this.currentNonce = await web3.eth.getTransactionCount(this.mainWallet.address, 'pending');
            const nonce = this.currentNonce;
            this.currentNonce++;
            return nonce;
        } catch (error) {
            console.error('Error getting nonce:', error);
            throw error;
        }
    }

    // Add performance monitoring method
    async trackMetrics(operation, success, gasUsed) {
        if (!this.metrics.startTime) {
            this.metrics.startTime = Date.now();
        }
        
        if (success) {
            this.metrics.successfulTransactions++;
            this.metrics.gasUsed = this.metrics.gasUsed.add(web3.utils.toBN(gasUsed));
        } else {
            this.metrics.failedTransactions++;
        }
    }

    // Add method to get performance report
    getPerformanceReport() {
        this.metrics.endTime = Date.now();
        const duration = (this.metrics.endTime - this.metrics.startTime) / 1000; // in seconds
        
        return {
            duration: `${duration} seconds`,
            successRate: `${(this.metrics.successfulTransactions / (this.metrics.successfulTransactions + this.metrics.failedTransactions) * 100).toFixed(2)}%`,
            totalGasUsed: this.metrics.gasUsed.toString(),
            averageTimePerTransaction: `${(duration / (this.metrics.successfulTransactions + this.metrics.failedTransactions)).toFixed(2)} seconds`
        };
    }
}

/**
 * Example usage of WalletManager
 * Creates and manages multiple wallets with specified parameters
 */
async function main() {
    try {
        if (!process.env.MAIN_PRIVATE_KEY) {
            throw new Error('Missing MAIN_PRIVATE_KEY in environment variables');
        }
        
        const manager = new WalletManager(
            process.env.MAIN_PRIVATE_KEY,
            parseInt(process.env.BATCH_SIZE || '50')
        );
        
        const walletCount = parseInt(process.env.WALLET_COUNT || '10000');
        const fundAmount = parseFloat(process.env.FUND_AMOUNT || '0.001');
        
        const results = await manager.createAndManageWallets(walletCount, fundAmount);
        
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
